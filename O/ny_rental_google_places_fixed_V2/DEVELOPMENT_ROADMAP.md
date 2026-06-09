# NY Rental Map V2 — 未来发展与更新路线图

> 最后更新：2026-06-08
> 部署平台：**Vercel**（serverless）
> 配套文档：[`MAINTENANCE_PLAN.md`](MAINTENANCE_PLAN.md)（安全/质量加固）、[`CLAUDE.md`](CLAUDE.md)（架构说明）、[`README_V2.md`](README_V2.md)（运行/运维）

这份文档是**前瞻性的产品 + 技术路线图**，基于对整个代码库逐文件的审查。
`MAINTENANCE_PLAN.md` 解决"现在的坑"，本文件解决"接下来往哪走"。

---

## 0. 项目现状快照

| 维度 | 现状 |
|------|------|
| 技术栈 | Next.js 14 App Router + React 18 + TypeScript（strict）+ Leaflet 地图 |
| 部署 | Vercel serverless（无持久化本地磁盘） |
| 数据规模 | ~34 栋楼、~734 个户型、~1000+ POI（CSV / 私有 Google Sheet 双源） |
| 数据源 | `data/*.csv` 为基线，配置后优先用 Google Sheet 缓存（`lib/data.ts`） |
| 核心功能 | 地图发现、通勤圈层、房源可信度(Trust)、户型对比、合租租金计算器、线索表单、双语(en/zh) |
| 后台 | `/admin` 密码登录，看运营指标 + Trust 表 + 手动同步 Sheet |
| 写入 | 线索/埋点写入私有 Google Sheet（Vercel 上本地文件存储默认禁用） |
| 覆盖学校 | Columbia / NYU / Baruch / Pratt（硬编码于 `lib/data.ts`） |

**做得好的地方**（继续保持）：
- 服务端隔离 Google API key；public/internal 数据严格分层（`lib/public-dataset.ts`）。
- 首页只发摘要、详情懒加载（`/api/buildings/[id]`）——已是性能友好设计。
- Trust（房源可信度）是差异化卖点，数据模型完整。
- 已有 robots/sitemap/OG，SEO 基础在。

---

## ⚠️ 关键认知：Vercel = 无持久化磁盘

这是后续所有决策的前提。当前代码里大量 `.data/` 和 `.places-cache/` 的本地文件逻辑
（`localFileStoreAllowed()`），在 Vercel 生产环境**默认全部失效**：

- **线索 / 埋点**：只能落到 Google Sheet。若 Sheet 凭据没配好，线索提交会返回 503 → **用户白填表单，你丢客户**。这是当前最大的隐性业务风险，必须先确认。
- **Google Places 刷新缓存**：生产环境写不进文件 → 每次刷新都重新打 API 或只能读 CSV。
- **Sheet 同步缓存**（`.data/google-sheets-cache.json`）：在 serverless 上是单实例内存级，冷启动会丢，跨实例不共享。

→ 路线图的 Phase 1 必须把这些"本地文件假设"换成 Vercel 原生方案（KV / Cron / 直连 Sheet）。

---

## 阶段总览

| 阶段 | 周期 | 主题 | 目标 |
|------|------|------|------|
| **Phase 1** | 第 1–2 周 | Vercel 上线收尾 + 安全 | 确认线索不丢、接入 KV/Cron、完成安全加固 |
| **Phase 2** | 第 3–6 周 | 代码健康 + 体验打磨 | 清理死代码、拆组件、列表/搜索视图、错误兜底 |
| **Phase 3** | 第 2–3 月 | 产品功能扩展 | 收藏、筛选、图册、聚合标记、更多学校/区域 |
| **Phase 4** | 第 3–5 月 | 架构演进 | 迁移数据库、中介自助后台、Agent 登录 |
| **Phase 5** | 第 5–6 月+ | 商业化 + 增长 | 付费订阅、SEO 内容、PWA、数据产品化 |

---

## Phase 1 — Vercel 上线收尾 + 安全（第 1–2 周）⭐ 最高优先

### 1.1 确认线索链路在生产可用（半天，**先做这个**）
- 在 Vercel 项目 Settings → Environment Variables 配齐：`GOOGLE_SHEET_ID`、
  `GOOGLE_SERVICE_ACCOUNT_EMAIL`、`GOOGLE_PRIVATE_KEY`（注意换行 `\n` 转义）、
  `ADMIN_PASSWORD`、`ADMIN_SESSION_SECRET`、`ADMIN_SYNC_TOKEN`、`NEXT_PUBLIC_SITE_URL`、
  `ALLOWED_APP_ORIGINS`、`GOOGLE_PLACES_API_KEY`。
- 服务账号对 Sheet 有 Editor 权限；Sheet 含 `leads` / `analytics_events` tab。
- **验收**：线上真实提交一条测试线索 → Sheet 出现该行；`/admin` 能看到。

### 1.2 接入 Vercel KV（Redis）做限流 + Places 缓存（1–2 天）
- 一举解决"无持久化磁盘"和"公开接口防刷"两个问题。
- **做法**：
  - 开通 Vercel KV，新增 `lib/kv.ts` 封装。
  - 限流：`lib/rate-limit.ts` 用 `@upstash/ratelimit` + KV，对 `/api/leads`、`/api/analytics`
    POST 按 IP 限流（呼应 `MAINTENANCE_PLAN` 1.1）。
  - Places 缓存：把 `app/api/places/nearby/route.ts` 的文件缓存改为 KV（key
    `places:{buildingId}:{type}`，TTL 30 天），生产环境也能命中（呼应计划 4.1）。
- **验收**：超频请求返回 429；Places 刷新后二次请求命中 KV。

### 1.3 用 Vercel Cron 自动同步 Sheet（半天）
- **现状**：`/api/admin/sync` 需手动点或外部定时打。
- **做法**：新增 `vercel.json` 配 `crons`，每 4 小时 `POST /api/admin/sync`；
  鉴权改为读 `ADMIN_SYNC_TOKEN`（Cron 可带 header，或加一个内部校验）。
- **验收**：Vercel Dashboard → Cron 显示按时执行；`/admin` 的 "Last sync" 自动更新。

### 1.4 完成安全加固（参见 `MAINTENANCE_PLAN.md` Phase 1）
- 重点：安全响应头（1.4）、输入校验+长度限制（1.2）、蜜罐（1.3）、env 启动校验（1.5）、
  Origin 白名单（1.6，`ALLOWED_APP_ORIGINS` 已有但未用）。

### 1.5 接入 Vercel Analytics + Speed Insights（半天）
- `@vercel/analytics` + `@vercel/speed-insights`，零配置拿到真实访问量与 Core Web Vitals，
  补充现有的自建埋点（自建埋点偏业务事件，Vercel 偏流量/性能）。

---

## Phase 2 — 代码健康 + 体验打磨（第 3–6 周）

### 2.1 清理死代码与冗余（半天）⭐ 立竿见影
审查中发现的明确问题：
- **`AnalyticsPanel` 和 `MetricList`**（`components/RentalApp.tsx:1395-1455`）已定义但**从未被渲染**。
  与之绑定的 `events` / `leads` 客户端 state、localStorage 读写（`RentalApp` 顶部）也基本是
  死重量——`track()` 仍需上报服务端，但本地存储那套可删。决策：要么删掉，要么把面板真正接上
  作为"公开数据展示"。建议先删，需要时再从 admin 复用。
- **i18n 重复**：`copy.zh` 已完整填充，紧接着又有一份完全相同的 `zhCopy` 常量 +
  `Object.assign(copy.zh, zhCopy)`（约 90 行纯冗余，`RentalApp.tsx:204-296`）。删掉 `zhCopy`。
- `nearby_pois.csv`(1340行) 与 `building_google_nearby_pois_500m.csv`(1033行) 数据重叠，
  loader 二选一。明确保留一个，避免维护两份。

### 2.2 拆分巨型组件 `RentalApp.tsx`（2–3 天）
- 见 `MAINTENANCE_PLAN.md` 3.1。1455 行 / 22 个 useState，是迭代最大摩擦点。
- 顺手把 i18n 文案表抽到 `lib/i18n.ts`，为将来多语言/路由化(`/en` `/zh`)铺路。

### 2.3 错误边界 + 加载/失败兜底（1 天）
- `app/error.tsx` + `app/global-error.tsx`；详情懒加载失败时显示"重试"。
  （`loadBuildingDetail` 当前失败是静默 return，用户看到空白。）

### 2.4 新增「列表 / 搜索」视图（2–3 天）⭐ 高价值
- **现状**：纯地图发现，没有可滚动的房源列表，移动端浏览效率低、不利于 SEO。
- **做法**：加一个 `/listings` 列表页（服务端渲染，利好 SEO）：
  - 卡片流 + 排序（价格/更新时间/距某校通勤）。
  - 顶部筛选：学校、预算区间、卧室数、可租状态。
  - 与地图共享数据层和 Trust 展示。
- **验收**：可在列表/地图间切换；列表页可被搜索引擎抓取。

### 2.5 无障碍与移动端细节（1–2 天）
- 弹窗/底部抽屉加焦点陷阱、Esc 关闭、aria 标签（见计划 3.3）。
- 跑一遍 README 里的"Mobile launch QA checklist"，修真机问题。

---

## Phase 3 — 产品功能扩展（第 2–3 月）

### 3.1 收藏 / 比较列表持久化（2 天）
- 用户收藏楼栋/户型，localStorage + 可选登录同步。提升回访与转化。

### 3.2 户型图册 + 图片优化（2 天）
- 详情页多图轮播（现在只展示一张 hero/floorplan）。
- 详情图统一走 `next/image`（现在用原生 `<img>`，见 `RentalApp.tsx` 多处
  `eslint-disable @next/next/no-img-element`），拿到懒加载/尺寸优化/CDN。
- `next.config.mjs` 的 `remotePatterns` 改为按需补充，或评估统一图床。

### 3.3 地图聚合标记（clustering）（1–2 天）
- 房源变多后（现在 cap 500 marker、80 POI）需要 `leaflet.markercluster` 或自实现，
  避免标记重叠、提升性能。

### 3.4 扩展学校与区域（1 天/批，数据驱动）
- 学校现硬编码在 `lib/data.ts` 的 `SCHOOLS`。抽成数据表（CSV/Sheet `schools` tab），
  支持加 Fordham、The New School、Cornell Tech、Pace 等，无需改代码。
- 为多校区/多市（波士顿、洛杉矶？）预留 `market` 字段。

### 3.5 中介自助提交入口（3–4 天）⭐ 运营杠杆
- 现在数据更新靠人工改 CSV/Sheet（README "Data update workflow for agents"）。
- 先做轻量版：一个带 `ADMIN_SYNC_TOKEN`/简单口令的表单页，中介提交房源更新 →
  写入 Sheet 的待审 tab → 你在 `/admin` 审核合并。
- 为 Phase 4 的正式 Agent 后台打前站。

### 3.6 SEO 内容页（持续）
- 每栋楼的 `/buildings/[id]` 已可分享，但内容偏应用态。补：楼栋静态介绍、
  "Columbia 周边学生公寓" 这类落地页、FAQ、担保人指南（已有文案素材在 `lib/legal.ts`）。
- 结构化数据（JSON-LD `Residence`/`Apartment`）提升富搜索结果。

---

## Phase 4 — 架构演进（第 3–5 月）

### 4.1 从 CSV/Sheet 迁移到数据库（1–2 周）⭐ 决定上限
- **痛点**：Google Sheet 适合试运营，但并发写、字段校验、查询、审计都弱；
  serverless 上每次读全表 + 内存缓存不可持续。
- **方案**：Vercel Postgres / Supabase / Neon。
  - 表结构直接映射现有类型（`lib/types.ts` 已是现成 schema）。
  - 保留 CSV 作为种子/导入工具；Sheet 可降级为"运营人员录入界面"或彻底替换。
  - 数据访问层 `lib/data.ts` 已是单一入口，迁移面可控。
- **验收**：读写走 DB，支持按条件查询、事务、迁移脚本。

### 4.2 Agent / 运营后台账号体系（1 周）
- 当前只有单一管理员密码（HMAC cookie，`lib/admin-auth.ts`）。
- 引入多用户 + 角色（admin / agent / viewer）。可用 NextAuth/Auth.js 或 Clerk。
- Agent 登录后只能管自己的房源；操作进 `change_log`（表已设计好）。

### 4.3 数据校验与审计流水线（3–4 天）
- 导入/写入时做 schema 校验（zod）；记录 `change_log`（before/after）。
- 字段字典已存在（`data/field_dictionary.csv`，76 行）——用它驱动校验规则。

---

## Phase 5 — 商业化与增长（第 5–6 月+）

### 5.1 付费订阅（broker SaaS）
- 现有 `/admin` 的运营证据（访问、点击、线索转化）本就是为定价铺垫（README 已写明）。
- 演进：按中介/楼盘订阅，分级展示位、线索配额、专属分析面板。接 Stripe。

### 5.2 数据产品化
- 把 admin 的分析做成对中介开放的只读看板（带权限），形成付费价值点。
- 线索 CRM 化：状态流转（新/已联系/成交）、导出、WeChat/邮件通知。

### 5.3 PWA / 通知
- 加 manifest + service worker，移动端可"添加到主屏"；可选 Web Push 提醒新房源。

### 5.4 多语言路由化
- 现在 en/zh 是客户端切换。SEO 角度做成 `/en` `/zh` 路由 + `hreflang`，
  覆盖中文搜索流量（核心用户是中国留学生）。

### 5.5 增长
- Google Search Console / Bing 提交 sitemap；内容营销（学校周边租房指南）；
- 小红书/微信渠道落地页与分享卡片优化（OG 已有基础）。

---

## 数据运营计划（贯穿各阶段）

| 项目 | 节奏 | 说明 |
|------|------|------|
| Sheet → 站点同步 | 每 4h（Vercel Cron） | Phase 1.3 |
| Places POI 刷新 | 每月 | 计划 4.1；写入 KV/Sheet `nearby_pois` |
| 房源时效巡检 | 每周 | `/admin` 已标红 >7 天未更新的楼/户型，跟进确认 |
| 线索/埋点备份 | 每日 | 计划 5.2；防误删 |
| 价格/费用复核 | 上架前 | Trust 状态 needs_confirmation → verified |

---

## 技术债清单（审查中发现的具体项）

- [ ] 死代码：`AnalyticsPanel` / `MetricList` 未使用（`RentalApp.tsx`）
- [ ] i18n `zhCopy` 重复定义（~90 行冗余）
- [ ] 详情图用原生 `<img>` + eslint-disable，未走 `next/image`
- [ ] `nearby_pois.csv` 与 `building_google_nearby_pois_500m.csv` 数据重叠
- [ ] 学校列表硬编码在 `lib/data.ts`，应数据化
- [ ] `buildings.csv` 的 `year_built`、`units.csv` 的 `space_*_name`/`share_plan_type` 等字段已采集但未在 UI 体现
- [ ] `.data`/`.places-cache` 文件缓存在 Vercel 无效，需换 KV
- [ ] 线索/埋点 POST 无限流、无输入长度限制（见 `MAINTENANCE_PLAN`）
- [ ] `tsconfig.tsbuildinfo` 被 git 跟踪
- [ ] 无 CI（无 `.github/workflows`）
- [ ] 测试仅覆盖 lib 层，无路由/组件测试

---

## 里程碑与验收

| 里程碑 | 包含 | 验收标准 |
|--------|------|----------|
| **M1 生产稳健** | Phase 1 | 线索零丢失、限流生效、Cron 自动同步、安全头齐全 |
| **M2 可持续迭代** | Phase 2 | 死代码清零、组件拆分、列表/搜索上线、有错误兜底 |
| **M3 产品丰满** | Phase 3 | 收藏、图册、聚合、可数据化加校区、中介可提交 |
| **M4 平台化** | Phase 4 | 数据库支撑、多角色登录、审计流水线 |
| **M5 可变现** | Phase 5 | 订阅付费、数据看板、多语言路由、增长渠道 |

---

## 建议的下一步（按顺序）

1. **立刻**：按 1.1 在 Vercel 确认线索链路通（不通则现在每个访客都在白填表单）。
2. 本周：1.2 KV 限流 + 1.4 安全加固 + 1.5 Vercel Analytics。
3. 下周：2.1 清死代码 + 2.4 列表视图（最快见到产品提升）。

需要我从其中任意一项开始落地实现，告诉我即可。
