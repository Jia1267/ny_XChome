# NY Rental Map V2 — 项目维护与升级计划

> 最后更新：2026-06-08
> 适用版本：`package.json` v0.2.0 / Next.js 14.2 App Router

本计划基于对当前代码库的完整审查，把改进项拆成 6 个阶段（Phase 0–5），按
**风险 / 收益 / 依赖关系**排序。每个条目包含：现状、目标、实施步骤、验收标准、
预估工作量（S = 半天内，M = 1–2 天，L = 3 天以上）。

建议执行顺序：**Phase 0 → Phase 1 → Phase 2**（安全 + 工程化先行），
之后 Phase 3–5 可按需穿插。

---

## Phase 0 — 基线与防回归（先做，约 0.5–1 天）

在动任何业务代码前，先把"安全网"搭好，确保后续每一步改动都能被验证。

### 0.1 建立 CI 流水线 `[S]`
- **现状**：没有 `.github/workflows/`，只有本地 `npm run lint / typecheck / test`。
- **目标**：每个 PR 自动跑 lint + typecheck + test + build。
- **怎么做**：
  1. 新建 `.github/workflows/ci.yml`，触发条件 `pull_request` 和 `push: main`。
  2. 步骤：`actions/checkout` → `actions/setup-node@v4`（Node 20，`cache: npm`）
     → `npm ci` → `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`。
  3. build 步骤注入占位环境变量，避免因缺 env 失败。
- **验收**：在 GitHub 上看到 PR 检查全绿；故意改坏一处类型能让 CI 变红。

### 0.2 清理版本控制噪音 `[S]`
- **现状**：`tsconfig.tsbuildinfo` 被 git 跟踪（`git status` 一直显示 M），属于构建产物。
- **怎么做**：
  ```bash
  git rm --cached tsconfig.tsbuildinfo
  ```
  在 `.gitignore` 中加入 `tsconfig.tsbuildinfo`、`.test-dist/`、`.data/`、`.places-cache/`（确认已忽略）。
- **验收**：`git status` 不再出现构建产物。

### 0.3 依赖安全审计基线 `[S]`
- **怎么做**：运行 `npm audit`，记录当前漏洞数；在 CI 中加 `npm audit --omit=dev --audit-level=high`（仅告警不阻断）。
- **验收**：有一份基线报告，后续可对比。

---

## Phase 1 — 安全加固（最高优先级，约 2–3 天）

公开写接口当前是最大风险面。

### 1.1 公开 POST 接口限流 `[M]` ⭐ 最高优先
- **现状**：[`app/api/leads/route.ts`](app/api/leads/route.ts) 与
  [`app/api/analytics/route.ts`](app/api/analytics/route.ts) 的 `POST` 无鉴权、无频率限制。
  任何人可无限写入 Google Sheet，污染给 broker 看的运营数据并烧掉 API 配额。
- **目标**：按 IP（或 IP+UA）限流，例如线索 5 次/10 分钟，analytics 60 次/分钟。
- **怎么做**：
  - **方案 A（推荐，生产）**：接入 `@upstash/ratelimit` + Upstash Redis（serverless 友好，
    Vercel 部署零运维）。新建 `lib/rate-limit.ts` 封装，在两个路由 POST 开头调用。
  - **方案 B（无外部依赖，单实例）**：实现内存滑动窗口 `Map<ip, timestamps[]>`，
    注意 serverless 多实例下不可靠，仅适合单机/自托管。
  - 取 IP：读取 `x-forwarded-for`（Vercel）或 `request.headers`。
  - 超限返回 `429` + `Retry-After` 头。
- **验收**：脚本连续打 N+1 次，第 N+1 次返回 429；单测覆盖限流逻辑。

### 1.2 输入校验与字段长度限制 `[M]`
- **现状**：lead/analytics 路由手工 `String(body.x)`，无长度上限、无格式校验、无类型白名单。
- **目标**：统一 schema 校验，拒绝超长/畸形输入。
- **怎么做**：
  1. 引入 `zod`，在 `lib/validation.ts` 定义 `leadSchema`、`analyticsEventSchema`。
  2. 每个字段设 `.max(N)`（如 name ≤ 80、notes ≤ 1000、wechat ≤ 64）。
  3. analytics `type` 用 `z.enum([...])` 白名单（page_view / school_click / building_click /
     unit_click / share_click / contact_click / lead_submit 等当前实际用到的）。
  4. 校验失败返回 400 + 具体错误。
- **验收**：超长 notes、未知 event type 均被 400 拒绝；单测覆盖。

### 1.3 表单反垃圾（蜜罐） `[S]`
- **现状**：线索表单无任何 bot 防护。
- **怎么做**：在 `LeadModal`（`components/RentalApp.tsx`）加一个 CSS 隐藏的诱饵字段
  （如 `website`），后端发现该字段非空即静默丢弃（返回 200 但不写库）。
  成本低、对真实用户零打扰。
- **进阶（可选）**：访问量上来后接 Cloudflare Turnstile（免费、隐私友好）。
- **验收**：填充蜜罐字段的请求不会写入 Sheet。

### 1.4 安全响应头 `[S]`
- **现状**：[`next.config.mjs`](next.config.mjs) 无 `headers()`。
- **怎么做**：在 next config 加 `async headers()`，对所有路由返回：
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Frame-Options: SAMEORIGIN`（或用 CSP `frame-ancestors`）
  - `Permissions-Policy: geolocation=(self), camera=(), microphone=()`
  - `Content-Security-Policy`：先用宽松策略（允许 self + 已知图片域名 + Google
    tile/Places），用 `Content-Security-Policy-Report-Only` 灰度，确认地图/图片不被拦再转强制。
- **验收**：securityheaders.com 评分提升；地图、图片、Places 刷新仍正常。

### 1.5 启动期环境变量校验 `[S]`
- **现状**：缺 `ADMIN_PASSWORD` / `ADMIN_SESSION_SECRET` 时生产环境静默降级
  （[`lib/admin-auth.ts`](lib/admin-auth.ts)），开发默认密码 `123456`。
- **目标**：生产缺关键 env 时显式失败/告警，避免误部署成"无密码后台"。
- **怎么做**：新建 `lib/env.ts`，在生产环境断言必需变量
  （`ADMIN_PASSWORD`、`ADMIN_SESSION_SECRET`、`ADMIN_SYNC_TOKEN`、`NEXT_PUBLIC_SITE_URL`）。
  缺失时在服务器日志打 ERROR，并让 `/admin` 与 `/api/admin/*` 返回 503 而不是放行。
- **验收**：生产模式下清空 `ADMIN_PASSWORD` 时后台不可登录且有清晰报错。

### 1.6 CORS / Origin 校验 `[S]`
- **现状**：`.env.example` 有 `ALLOWED_APP_ORIGINS` 但未见在写接口中使用。
- **怎么做**：在 lead/analytics POST 校验 `Origin`/`Referer` 是否在 `ALLOWED_APP_ORIGINS`
  白名单内，拒绝跨站直接调用（配合限流双保险）。
- **验收**：从非白名单 Origin 调用被拒。

---

## Phase 2 — 工程化与质量（约 2–3 天）

### 2.1 扩展测试覆盖到 API 路由 `[M]`
- **现状**：[`tests/`](tests/) 仅覆盖 lib 层（admin-auth、persistence-policy、
  public-dataset、server-store、google-sheets-write）。路由零覆盖。
- **怎么做**：用 `node:test` 为每个 route handler 写单测——直接 import `GET/POST`，
  传入构造的 `Request`，断言状态码与 body。重点覆盖：鉴权失败 401、校验失败 400、
  限流 429、正常 200。
- **验收**：路由分支均有测试；`npm test` 通过。

### 2.2 依赖更新与锁定 `[S]`
- **现状**：`next@^14.2.4`、`react@18.3`、`lucide-react@0.468`。
- **怎么做**：
  - 跑 `npm outdated`，在小版本范围内更新 Next 14.x 补丁（含安全修复）。
  - 评估是否升级到 Next 15 / React 19（**单独分支**，破坏性较大，非必须，可延后）。
  - 提交更新后的 `package-lock.json`，确保 CI 用 `npm ci`。
- **验收**：更新后 build/test 通过；`npm audit` 高危归零或有豁免说明。

### 2.3 统一错误处理与日志 `[M]`
- **现状**：各路由 try/catch 风格不一；`sync` 路由已做 API key 脱敏（好做法），
  但 leads/analytics 的 `await appendLeadToGoogleSheet` 未 try/catch，Sheet 报错会
  直接 500 且可能泄漏细节。
- **怎么做**：
  1. 新建 `lib/api-helpers.ts`，提供 `jsonError(status, msg)` 与 `withErrorBoundary(handler)`。
  2. 所有外部调用（Sheets、Places）包 try/catch，对外返回通用错误，对内 `console.error` 完整堆栈。
  3. 复用 sync 路由的 `AIza...` 脱敏正则到统一工具函数。
- **验收**：Sheet 故障时接口返回干净的 5xx，不泄漏 token/堆栈。

### 2.4 接入错误监控（可选但推荐） `[S]`
- **怎么做**：接 Sentry（`@sentry/nextjs`），捕获服务端/客户端异常。免费额度足够试运营。
- **验收**：手动抛错能在 Sentry 看到。

---

## Phase 3 — 前端代码重构（约 3–4 天，可分批）

### 3.1 拆分巨型组件 `RentalApp.tsx` `[L]` ⭐
- **现状**：[`components/RentalApp.tsx`](components/RentalApp.tsx) **1455 行、22 个 useState**，
  容纳了地图、楼栋详情、单元详情、对比坞、租金计算器、线索表单、i18n 文案等全部逻辑。
  这是后续迭代最大的摩擦点。
- **目标**：单文件 < ~400 行，子组件独立可测。
- **怎么做（渐进式，每步独立提交 + 跑测试）**：
  1. 抽离纯展示组件到独立文件：`components/detail/BuildingDetail.tsx`、`UnitDetail.tsx`、
     `NearbyFacilities.tsx`、`TrustGrid.tsx`、`MapLegend.tsx`。
  2. 抽离交互组件：`components/lead/LeadModal.tsx`、`components/compare/CompareDock.tsx`
     （含 Mini/Full card）、`components/rent/RentCalculator.tsx`。
  3. 把分散的 22 个 `useState` 按域聚合为 `useReducer`：
     `selection`（building/unit/poi）、`mobileUI`（各种 open 状态）、`compare`、`leadContext`。
  4. i18n 文案表（`CopyKey`/`t()`）抽到 `lib/i18n.ts`。
  5. 数据拉取逻辑（`buildingDetails` 懒加载）抽成 `useBuildingDetail` 自定义 hook。
- **验收**：行为不变（手动过一遍 README 的"Mobile launch QA checklist"）；
  各子组件可单独 import；typecheck 通过。

### 3.2 错误边界与加载/失败 UI `[M]`
- **现状**：客户端 `fetch('/api/buildings/[id]')` 失败缺统一兜底；无 React Error Boundary。
- **怎么做**：
  1. 新建 `app/error.tsx`（路由级错误页）与 `app/global-error.tsx`。
  2. `useBuildingDetail` 增加 error 状态，详情面板展示"加载失败 + 重试"。
- **验收**：断网/接口 500 时 UI 有友好提示而非空白或崩溃。

### 3.3 无障碍（a11y）与键盘可达性 `[M]`
- **怎么做**：给 bottom sheet、对比坞、线索弹窗加 `role`/`aria-*`/焦点陷阱（focus trap）+
  Esc 关闭；地图标记加可读 label。用 axe DevTools 扫一遍。
- **验收**：键盘可完成"选楼→看单元→提交线索"全流程；axe 无 critical。

---

## Phase 4 — 性能与数据（约 2–3 天）

### 4.1 Google Places 生产环境持久缓存 `[M]` ⭐
- **现状**：[`app/api/places/nearby/route.ts`](app/api/places/nearby/route.ts) 的 JSON 缓存
  只在本地开发可用（`localFileStoreAllowed()` 为 false 时不写）。生产只能读 CSV 或实时打 API。
- **目标**：生产可缓存 Places 结果并按月刷新（呼应 README 的"展示给付费 partner 前先刷新"）。
- **怎么做**：把缓存后端从本地文件改为可插拔：
  - **方案 A**：写回 Google Sheet 的 `nearby_pois` tab（已有读路径）。
  - **方案 B**：用 Vercel KV / Upstash Redis 存 `{buildingId}_{type}` → POI[]，带 TTL（30 天）。
  - 提供管理端"刷新附近"按钮或定时任务（复用 `x-admin-sync-token` 鉴权模式）。
- **验收**：生产首次刷新后命中缓存；30 天后自动失效重取。

### 4.2 Google access token 缓存 `[S]`
- **现状**：[`lib/google-sheets-write.ts`](lib/google-sheets-write.ts) 每次 append/read 都调
  `getGoogleSheetsAccessToken()` 重新签 JWT 换 token。高频写时浪费。
- **怎么做**：在 `lib/google-sheets.ts` 内存缓存 access token，按 `exp` 提前 60s 失效复用。
- **验收**：连续多次写只触发一次 token 交换（可用日志/单测验证）。

### 4.3 图片加载策略统一 `[S]`
- **现状**：`next.config.mjs` 配了 7 个 `remotePatterns` 白名单图片域名；首页只发摘要、
  详情懒加载（已是好实践）。
- **怎么做**：确认详情图统一走 `next/image`（懒加载 + 尺寸约束 + `sizes`），主图加
  `priority`；给外链图加 `onError` 占位。
- **验收**：Lighthouse 移动端 LCP/CLS 改善。

### 4.4 Sheet → Cache 同步的健壮性 `[S]`
- **现状**：`getRentalDataset` 在 Sheet 不可用时回退本地 CSV（好）。
- **怎么做**：给同步加 schema 校验（必需列存在性）与失败告警；记录每个 tab 行数到管理端。
- **验收**：缺列/坏行有日志，不会静默产出空数据集。

---

## Phase 5 — 运维与可观测性（约 1–2 天）

### 5.1 健康检查与就绪探针 `[S]`
- **怎么做**：新增 `app/api/health/route.ts`，返回数据集行数、`dataSourceMode`、
  `sheetLastSyncedAt`、各依赖配置是否就绪（不泄漏密钥）。
- **验收**：`GET /api/health` 可用于部署平台探活与人工排障。

### 5.2 Google Sheet 备份策略 `[S]`
- **怎么做**：定时（每日）把 `leads` / `analytics_events` 导出快照（Sheet 版本历史或
  导出到对象存储），防误删/误改。
- **验收**：有可恢复的历史快照。

### 5.3 文档同步 `[S]`
- **现状**：`README_V2.md` 较完整但与代码会随迭代漂移。
- **怎么做**：每个 Phase 完成后更新 README 对应章节；保持 `.env.example` 与实际读取的
  变量一致；本计划完成项打勾归档。
- **验收**：新人按 README 能在 30 分钟内跑起来。

---

## 里程碑建议

| 里程碑 | 包含 | 目标 |
|--------|------|------|
| **M1 安全可上线** | Phase 0 + Phase 1 | 公开接口防刷、有安全头、env 校验，可放心试运营 |
| **M2 可持续迭代** | Phase 2 + Phase 3.1 | CI + 测试 + 组件拆分，团队能高效改 |
| **M3 付费就绪** | Phase 4 + Phase 5 | Places 缓存、监控、备份，可服务付费 broker |

## 跟踪清单（勾选进度）

- [x] 0.1 CI 流水线 — `.github/workflows/ci.yml`（路径过滤到本项目，lint/typecheck/test/build）
- [x] 0.2 清理构建产物 — 已 untrack `tsconfig.tsbuildinfo` 并加入 `.gitignore`
- [x] 0.3 依赖审计基线 — CI 加 `npm audit --omit=dev --audit-level=high`（advisory，首次 CI 跑出基线）
- [x] 1.1 POST 限流 ⭐ — `lib/api-guard.ts` `rateLimitShared`（leads 8/10min、analytics 600/5min、admin login 5/15min）。配置 `UPSTASH_REDIS_REST_URL/TOKEN` 时为跨实例共享限流（零依赖 REST），未配置回退内存版；`clientIp` 已防 XFF 伪造（取可信末跳）
- [x] 1.2 输入校验 — `lib/validation.ts`（手写零依赖，非 zod）：字段长度上限 + 控制字符清洗 + event type 白名单
- [x] 1.3 蜜罐反垃圾 — LeadModal 隐藏 `website` 字段，服务端命中即静默丢弃
- [x] 1.4 安全响应头 — `next.config.mjs` headers()（HSTS / nosniff / X-Frame-Options / Referrer-Policy / Permissions-Policy；CSP 留待 report-only 灰度）
- [x] 1.5 env 启动校验 — `lib/env.ts` `productionEnvProblems()`，在 `/admin` 顶部红色横幅显示缺失项（非抛错，避免整站挂）
- [x] 1.6 Origin 白名单 — `lib/api-guard.ts` `isAllowedOrigin()`：同源恒放行，跨源查 `ALLOWED_APP_ORIGINS`，未配置不拦截
- [~] 2.1 测试 — 已补核心逻辑单测（rent-split / filter-floorplans / validation / api-guard），覆盖各路由的校验/限流/Origin/筛选决策；handler 集成测试 + E2E(Playwright) 待依赖
- [ ] 2.2 依赖更新
- [ ] 2.3 统一错误处理
- [x] 2.4 错误监控 — `@sentry/nextjs` 已接（client/server/edge config + instrumentation.ts + withSentryConfig + global-error 上报）。未设 `NEXT_PUBLIC_SENTRY_DSN` 时 SDK 完全停用；设 DSN 即启用
- [x] 3.1 拆分 RentalApp ⭐ — 已拆到 `components/rental/*` + `lib/i18n.ts`
- [x] 3.2 错误边界 UI — `app/error.tsx` + `app/global-error.tsx` + 详情加载失败"重试"
- [ ] 3.3 a11y
- [x] 4.1 Places 生产缓存 ⭐ — refresh 结果写入进程内存缓存（30 天 TTL），生产也命中；KV 升级待办
- [x] 4.2 access token 缓存 — `lib/google-sheets.ts` 按 scope 缓存 OAuth token，按 `expires_in` 提前 60s 失效
- [~] 4.3 图片策略 — 详情/户型图加 `decoding="async"` + 加载失败优雅隐藏；迁移 `next/image` 仍待办（外链域名多）
- [~] 4.4 同步健壮性 — Sheet 读探针抛出可读错误 + `/admin` 存储自检卡片 + 写入测试按钮；列校验待办
- [x] 5.1 健康检查 — `GET /api/health`（计数 + 数据源 + 配置布尔，无密钥）
- [x] 5.2 Sheet 备份 — `/admin` 「Download backup」+ `GET /api/admin/backup`（leads+analytics JSON 快照，可带 sync token 给定时任务）；Sheet 版本历史为就地备份
- [x] 5.3 文档同步 — README 增加 Operations/troubleshooting、列表页、自动建表说明，修正过期的 localStorage 描述
