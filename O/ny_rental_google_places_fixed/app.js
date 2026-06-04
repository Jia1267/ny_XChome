/* =========================================================
   NY Rental Map · Clean Leaflet Enterprise MVP
   Goals:
   - no live POI fetch during user interaction
   - no full marker rerender on building select
   - clean state, filters, listing list, drawer, local nearby tools
   ========================================================= */

const CONFIG = {
  dev: ['localhost', '127.0.0.1'].includes(location.hostname),
  defaultCenter: [40.776, -73.965],
  defaultZoom: 11,
  poiRadius: {
    subway: 500,
    grocery: 500,
    restaurant: 500,
    coffee: 500,
    school: 2400,
    mall: 1600,
    community: 1200,
  },
  maxNearbyResults: 12,
};

const SCHOOL_FALLBACKS = {
  columbia: { type: 'school', name: 'Columbia University', lat: 40.8075, lng: -73.9626 },
  nyu: { type: 'school', name: 'New York University', lat: 40.7295, lng: -73.9965 },
  baruch: { type: 'school', name: 'Baruch College', lat: 40.7402, lng: -73.9834 },
};

const state = {
  buildings: [],
  units: [],
  photos: [],
  pois: [],
  buildingMap: new Map(),
  unitsByBuilding: new Map(),
  photosByBuilding: new Map(),
  photosByUnit: new Map(),
  buildingMarkers: new Map(),
  selectedId: null,
  selectedUnitId: null,
  panelExpanded: false,
  lang: localStorage.getItem('nyrm_lang') || 'en',
  commuteSchool: '',
  commuteMode: '',
  commuteMinutes: 0,
  compareUnitIds: [],
  leadContext: { buildingId: '', unitId: '' },
  activeNearbyType: null,
  activeSchool: '',
  filteredBuildings: [],
};

const els = {
  workspace: document.querySelector('.workspace'),
  listingList: document.getElementById('listingList'),
  resultCount: document.getElementById('resultCount'),
  dataSummary: document.getElementById('dataSummary'),
  searchForm: document.getElementById('searchForm'),
  searchInput: document.getElementById('searchInput'),
  areaFilter: document.getElementById('areaFilter'),
  bedFilter: document.getElementById('bedFilter'),
  rentFilter: document.getElementById('rentFilter'),
  sortFilter: document.getElementById('sortFilter'),
  resetFilters: document.getElementById('resetFilters'),
  detailDrawer: document.getElementById('detailDrawer'),
  detailContent: document.getElementById('detailContent'),
  closeDrawer: document.getElementById('closeDrawer'),
  nearbyToolbar: document.getElementById('nearbyToolbar'),
  nearbyBuildingName: document.getElementById('nearbyBuildingName'),
  langToggle: document.getElementById('langToggle'),
  analyticsButton: document.getElementById('analyticsButton'),
  policyButton: document.getElementById('policyButton'),
  commutePanel: document.getElementById('commutePanel'),
  compareDock: document.getElementById('compareDock'),
  leadModal: document.getElementById('leadModal'),
  leadForm: document.getElementById('leadForm'),
  leadContext: document.getElementById('leadContext'),
  analyticsModal: document.getElementById('analyticsModal'),
  analyticsContent: document.getElementById('analyticsContent'),
  policyModal: document.getElementById('policyModal'),
  policyContent: document.getElementById('policyContent'),
};

// -----------------------------
// Map setup
// -----------------------------
const map = L.map('map', {
  zoomControl: true,
  scrollWheelZoom: true,
  preferCanvas: true,
}).setView(CONFIG.defaultCenter, CONFIG.defaultZoom);

const baseLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  subdomains: 'abcd',
  maxZoom: 20,
}).addTo(map);

const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles &copy; Esri',
  maxZoom: 19,
});

L.control.layers(
  { 'Clean map': baseLayer, Satellite: satelliteLayer },
  null,
  { position: 'topright', collapsed: true }
).addTo(map);

const buildingLayer = L.layerGroup().addTo(map);
const poiClusterLayer = L.markerClusterGroup({
  showCoverageOnHover: false,
  spiderfyOnMaxZoom: true,
  disableClusteringAtZoom: 15,
  maxClusterRadius: 44,
}).addTo(map);
const nearbyLayer = L.layerGroup().addTo(map);
const radiusLayer = L.layerGroup().addTo(map);
const commuteLayer = L.layerGroup().addTo(map);
const subwayLineLayer = L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenRailwayMap contributors',
  maxZoom: 19,
  opacity: 0.72,
});

// -----------------------------
// Utilities
// -----------------------------
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === ',' && !quoted) {
      row.push(cell);
      cell = '';
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell);
      cell = '';
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (!rows.length) return [];

  const headers = rows.shift().map(header => header.trim().replace(/^\uFEFF/, ''));
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()])));
}

async function loadCSV(filename) {
  const url = CONFIG.dev ? `${filename}?v=${Date.now()}` : filename;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${filename} HTTP ${response.status}`);
  return parseCSV(await response.text());
}

const I18N = {
  en: {
    brandTitle: 'NY Rental Map',
    brandSub: 'Student-friendly apartment discovery',
    all: 'All',
    analytics: 'Analytics',
    legal: 'Legal',
    mapView: 'Map view',
    building: 'Building',
    schools: 'Schools',
    life: 'Life',
    nearby: 'Nearby',
    clear: 'Clear',
    commuteTitle: 'School commute rings',
    walk5: 'Walk 5m',
    walk15: 'Walk 15m',
    subway20: 'Subway 20m',
    subway40: 'Subway 40m',
    subway60: 'Subway 60m',
    startRent: 'Starting rent',
    availableUnits: 'available units',
    askAvailability: 'Ask availability',
    checkAvailability: 'Check availability',
    officialSite: 'Official site',
    buildingOverview: 'Building overview',
    amenities: 'Amenities and policies',
    availableUnit: 'Available unit',
    availableUnitsTitle: 'Available units',
    nearbyTransit: 'Nearby transit',
    nearbySchools: 'Nearby schools',
    rentRange: 'Rent range',
    lease: 'Lease',
    utilities: 'Utilities',
    verification: 'Verification',
    floorPlan: 'Floor plan',
    unitDetails: 'Unit details',
    feesVerification: 'Fees and verification',
    backBuilding: 'Back to building',
    compare: 'Compare',
    remove: 'Remove',
    contact: 'Contact agent',
    compareTitle: 'Compare units',
    compareHint: 'Select up to two units to compare.',
    rentCalculator: 'Rent calculator and roommate split',
    monthlyGrossRent: 'Monthly gross rent',
    leaseMonths: 'Lease months',
    freeMonths: 'Free months',
    peopleSharing: 'People sharing',
    securityDeposit: 'Security deposit',
    brokerFee: 'Broker fee',
    amenityFees: 'Amenity / app fees',
    utilitiesMonth: 'Utilities / month',
    calculate: 'Calculate',
    netEffective: 'Net effective',
    monthlyTotal: 'Monthly total',
    moveInTotal: 'Move-in total',
    feesPerson: 'Fees / person',
    formula: 'Formula: gross rent * paid months / lease months, then utilities are added.',
    privatePlan: 'Private plan',
    sharedPlan: 'shared plan',
    oneTimePerson: 'One-time / person',
    leadEyebrow: 'Connect with leasing',
    leadTitle: 'Ask availability',
    leadName: 'Name',
    leadWechat: 'WeChat',
    leadSchool: 'School',
    leadBudget: 'Budget',
  leadMoveDate: 'Move-in date',
  leadInterest: 'Interested unit',
  leadSource: 'Referred by agent?',
    leadNotes: 'Notes',
    leadConsent: 'I agree to be contacted about this rental inquiry.',
    submitLead: 'Submit inquiry',
    leadFine: 'Demo storage: leads are saved locally in this browser until CRM is connected.',
    trialDashboard: 'Trial dashboard',
    exportAnalytics: 'Export analytics',
    exportLeads: 'Export leads',
    policyTitle: 'Policies and disclosures',
    disclaimer: 'Disclaimer',
    feeDisclosure: 'Fees',
    privacy: 'Privacy',
    fairHousing: 'Fair Housing',
  },
  zh: {
    brandTitle: 'NY 租房地图',
    brandSub: '面向学生的纽约租房发现工具',
    all: '全部',
    analytics: '数据',
    legal: '合规',
    mapView: '地图视图',
    building: '楼盘',
    schools: '学校',
    life: '生活',
    nearby: '附近',
    clear: '清除',
    commuteTitle: '学校通勤圈层',
    walk5: '步行5分',
    walk15: '步行15分',
    subway20: '地铁20分',
    subway40: '地铁40分',
    subway60: '地铁60分',
    startRent: '起租价',
    availableUnits: '套可租户型',
    askAvailability: '咨询房源',
    checkAvailability: '查看空房',
    officialSite: '官网',
    buildingOverview: '楼盘概览',
    amenities: '设施和政策',
    availableUnit: '可租户型',
    availableUnitsTitle: '可租户型',
    nearbyTransit: '附近交通',
    nearbySchools: '附近学校',
    rentRange: '租金范围',
    lease: '租期',
    utilities: '水电网',
    verification: '数据状态',
    floorPlan: '户型图',
    unitDetails: '户型详情',
    feesVerification: '费用和核验',
    backBuilding: '返回楼盘',
    compare: '对比',
    remove: '移除',
    contact: '联系中介',
    compareTitle: '户型对比',
    compareHint: '最多选择两个户型进行对比。',
    rentCalculator: '租金计算器和合租拆分',
    monthlyGrossRent: '月租金',
    leaseMonths: '租期（月）',
    freeMonths: '减免月数',
    peopleSharing: '合租人数',
    securityDeposit: '押金',
    brokerFee: '中介费',
    amenityFees: '申请/设施费',
    utilitiesMonth: '水电网/月',
    calculate: '计算',
    netEffective: '折后月租',
    monthlyTotal: '每月合计',
    moveInTotal: '入住成本',
    feesPerson: '人均一次性费用',
    formula: '公式：月租 * 实付月数 / 租期月数，再加每月水电网估算。',
    privatePlan: '单人方案',
    sharedPlan: '合租方案',
    oneTimePerson: '人均一次性',
    leadEyebrow: '联系租赁顾问',
    leadTitle: '咨询房源',
    leadName: '姓名',
    leadWechat: '微信',
    leadSchool: '学校',
    leadBudget: '预算',
    leadMoveDate: '入住日期',
    leadSource: '是否有推荐中介？',
    leadNotes: '备注',
    leadConsent: '我同意接收关于本次租房咨询的联系。',
    submitLead: '提交咨询',
    leadFine: '演示存储：接入 CRM 前，lead 会保存在当前浏览器本地。',
    trialDashboard: '试用版数据面板',
    exportAnalytics: '导出数据',
    exportLeads: '导出 leads',
    policyTitle: '政策和免责声明',
    disclaimer: '免责声明',
    feeDisclosure: '费用说明',
    privacy: '隐私',
    fairHousing: '公平住房',
  },
};

Object.assign(I18N.en, {
  life: 'Life',
  restaurants: 'Restaurants',
  grocery: 'Grocery',
  coffee: 'Coffee',
  subway: 'Subway',
  askAgent: 'Ask agent',
  ask: 'Ask',
  available: 'Available',
  availableNow: 'Available now',
  units: 'units',
  buildings: 'buildings',
  pois: 'POIs',
  from: 'From',
  view: 'View',
  noResults: 'No results found',
  tryDifferent: 'Try another area, rent, or school.',
  transitInfo: 'Transit info available',
  buildingPhoto: 'Building photo',
  photo: 'Photo',
  askAmenities: 'Ask agent for amenities',
  listingDisclaimer: 'Rental building information is shown from the current CSV data. Confirm final price, availability, fees, and lease terms with the listing agent or official building office.',
  important: 'Important',
  platformDisclaimer: 'This platform is an information and discovery tool. It does not collect rent, deposits, or sign leases. All listing details should be confirmed directly with the agent, owner, or building management.',
  grossRent: 'Gross rent',
  netEffectiveRent: 'Net effective rent',
  bedrooms: 'Bedrooms',
  bathrooms: 'Bathrooms',
  size: 'Size',
  securityDeposit: 'Security deposit',
  brokerFee: 'Broker fee',
  amenityFee: 'Amenity fee',
  checked: 'Checked',
  concession: 'Concession',
  officialUnitPage: 'Official unit page',
  buildingAvailability: 'Building availability',
  noFloorPlan: 'No floor plan image for this unit yet',
  confirmUnit: 'Confirm final rent, availability, floor plan, fees, and lease terms directly with the official listing source or leasing office.',
  expandDetails: 'Expand details',
  shrinkDetails: 'Shrink details',
  share: 'Share',
  copied: 'Copied',
  person: 'person',
  people: 'people',
  moveInEst: 'Move-in est.',
  depositSplit: 'Deposit split',
  brokerSplit: 'Broker split',
  feesSplit: 'Fees split',
  splitNote: 'Monthly split uses a room-price difference rule. One-time fees are split equally by headcount.',
  wholeUnit: 'Whole unit',
  bedroom: 'Bedroom',
  primaryBedroom: 'Primary bedroom',
  secondBedroom: 'Second bedroom',
  thirdBedroom: 'Third bedroom',
  fourthBedroom: 'Fourth bedroom',
  livingRoom: 'Living room',
  guarantorTitle: 'NYC guarantor check',
  guarantorIncome: 'Estimated guarantor income target',
  guarantorNote: 'Many NYC rentals require the renter or guarantor to show annual income around 35x the monthly rent.',
  guarantorFee: 'If that threshold is not met, a third-party guarantor company may charge a non-refundable fee. The fee is usually quoted as a rent percentage based on credit/profile and is commonly not more than one month of rent.',
  guarantorConfirm: 'Confirm the exact rule, fee, and approval standard with the agent or leasing office.',
  leadSaved: 'Inquiry saved. Next step: connect Google Sheet or CRM.',
  visits: 'Visits',
  buildingClicks: 'Building clicks',
  unitClicks: 'Unit clicks',
  shareClicks: 'Share clicks',
  leadOpens: 'Inquiry clicks',
  leadSubmits: 'Submitted leads',
  conversionRate: 'Lead conversion',
  topBuildings: 'Top buildings',
  topUnits: 'Top units',
  schoolIntent: 'School intent',
  recentLeads: 'Recent leads',
  noDataYet: 'No data yet',
  crmReady: 'CRM-ready local export',
  noNearbyData: 'No nearby data loaded',
  runPoiUpdate: 'Run monthly POI update',
  commuteWalk: 'walk',
  commuteSubway: 'subway',
});

Object.assign(I18N.zh, {
  brandTitle: 'NY 租房地图',
  brandSub: '学生友好公寓发现工具',
  all: '全部',
  analytics: '数据',
  legal: '合规',
  mapView: '地图视图',
  building: '楼盘',
  schools: '学校',
  life: '生活',
  nearby: '附近',
  clear: '清除',
  commuteTitle: '学校通勤圈层',
  walk5: '步行 5 分钟',
  walk15: '步行 15 分钟',
  subway20: '地铁 20 分钟',
  subway40: '地铁 40 分钟',
  subway60: '地铁 60 分钟',
  restaurants: '餐厅',
  grocery: '超市',
  coffee: '咖啡',
  subway: '地铁',
  startRent: '起租价',
  availableUnits: '套可租户型',
  askAvailability: '咨询空房',
  checkAvailability: '查看空房',
  officialSite: '官网',
  buildingOverview: '楼盘概览',
  amenities: '设施与政策',
  availableUnit: '可租户型',
  availableUnitsTitle: '可租户型',
  nearbyTransit: '附近交通',
  nearbySchools: '附近学校',
  rentRange: '租金范围',
  lease: '租期',
  utilities: '水电网',
  verification: '数据状态',
  floorPlan: '户型图',
  unitDetails: '户型详情',
  feesVerification: '费用与核验',
  backBuilding: '返回楼盘',
  compare: '对比',
  remove: '移除',
  contact: '联系中介',
  compareTitle: '户型对比',
  compareHint: '再选择一个户型后会展开左右对比。',
  rentCalculator: '专业租金计算器',
  monthlyGrossRent: '月租金',
  leaseMonths: '租期（月）',
  freeMonths: '减免月数',
  peopleSharing: '合租人数',
  securityDeposit: '押金',
  brokerFee: '中介费',
  amenityFees: '申请/设施费',
  utilitiesMonth: '水电网/月',
  calculate: '重新计算',
  netEffective: '折后月租',
  monthlyTotal: '每月总额',
  moveInTotal: '入住成本',
  feesPerson: '人均一次性费用',
  formula: '公式：月租金 × 实付月数 ÷ 租期月数，再加每月水电网估算。',
  privatePlan: '单人方案',
  sharedPlan: '合租方案',
  oneTimePerson: '人均一次性费用',
  leadEyebrow: '联系租赁顾问',
  leadTitle: '咨询房源',
  leadName: '姓名',
  leadWechat: '微信',
  leadSchool: '学校',
  leadBudget: '预算',
  leadMoveDate: '入住时间',
  leadInterest: '感兴趣户型',
  leadSource: '是否有推荐中介？',
  leadNotes: '备注',
  leadConsent: '我同意接收关于本次租房咨询的联系。',
  submitLead: '提交咨询',
  leadFine: '试用版会把 lead 保存在本浏览器本地；正式版可接入 Google Sheet 或 CRM。',
  trialDashboard: '试用版数据面板',
  exportAnalytics: '导出数据',
  exportLeads: '导出 leads',
  policyTitle: '政策与披露',
  disclaimer: '免责声明',
  feeDisclosure: '费用说明',
  privacy: '隐私政策',
  fairHousing: '公平住房',
  askAgent: '咨询中介',
  ask: '咨询',
  available: '可入住',
  availableNow: '现在可租',
  units: '套户型',
  buildings: '个楼盘',
  pois: '个设施点',
  from: '起',
  view: '查看',
  noResults: '没有找到结果',
  tryDifferent: '换一个区域、预算或学校试试。',
  transitInfo: '已有交通信息',
  buildingPhoto: '楼盘照片',
  photo: '照片',
  askAmenities: '请向中介确认设施',
  listingDisclaimer: '楼盘信息来自当前 CSV 数据。最终价格、空房、费用和租约条款请以中介、官网或楼盘管理方确认为准。',
  important: '重要提示',
  platformDisclaimer: '本平台是信息发现与咨询工具，不收取租金、押金，也不签署租约。所有房源细节都需要与中介、业主或楼盘管理方直接确认。',
  grossRent: '原价月租',
  netEffectiveRent: '折后月租',
  bedrooms: '卧室',
  bathrooms: '卫浴',
  size: '面积',
  amenityFee: '设施费',
  checked: '核验时间',
  concession: '优惠',
  officialUnitPage: '打开户型来源',
  buildingAvailability: '楼盘空房页',
  noFloorPlan: '这个户型暂时没有户型图',
  confirmUnit: '最终租金、空房、户型图、费用和租约条款请以官方房源或租赁办公室确认为准。',
  expandDetails: '放大详情',
  shrinkDetails: '缩小详情',
  share: '分享',
  copied: '已复制',
  person: '人',
  people: '人',
  moveInEst: '入住预估',
  depositSplit: '押金分摊',
  brokerSplit: '中介费分摊',
  feesSplit: '费用分摊',
  splitNote: '月租分摊使用房间价差规则；一次性费用按人数平均分摊。',
  wholeUnit: '整套',
  bedroom: '卧室',
  primaryBedroom: '主卧',
  secondBedroom: '次卧',
  thirdBedroom: '第三卧',
  fourthBedroom: '第四卧',
  livingRoom: '客厅',
  guarantorTitle: 'NYC 担保要求',
  guarantorIncome: '担保收入门槛估算',
  guarantorNote: '纽约租房通常需要租客或担保人的年收入达到月租的约 35 倍。',
  guarantorFee: '如果达不到收入要求，可能需要第三方担保公司。担保费通常不退，具体按信用分、申请材料和担保公司政策计算，一般不超过一个月租金。',
  guarantorConfirm: '具体规则、费用和审批标准请以中介或楼盘 leasing office 确认为准。',
  leadSaved: '咨询已保存。下一步可以接入 Google Sheet 或 CRM。',
  visits: '访问量',
  buildingClicks: '楼盘点击',
  unitClicks: '户型点击',
  shareClicks: '分享点击',
  leadOpens: '咨询点击',
  leadSubmits: '提交 lead',
  conversionRate: 'Lead 转化率',
  topBuildings: '热门楼盘',
  topUnits: '热门户型',
  schoolIntent: '学校意向',
  recentLeads: '最新 leads',
  noDataYet: '暂无数据',
  crmReady: '可导出的 CRM 本地数据',
  noNearbyData: '暂无附近数据',
  runPoiUpdate: '请运行每月 POI 更新',
  commuteWalk: '步行',
  commuteSubway: '地铁',
});

function t(key) {
  return I18N[state.lang]?.[key] || I18N.en[key] || key;
}

function storageRead(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch (_) {
    return fallback;
  }
}

function storageWrite(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function track(eventName, payload = {}) {
  const events = storageRead('nyrm_analytics_events', []);
  events.push({
    event: eventName,
    at: new Date().toISOString(),
    school: state.activeSchool || state.commuteSchool || '',
    building_id: state.selectedId || '',
    unit_id: state.selectedUnitId || '',
    ...payload,
  });
  storageWrite('nyrm_analytics_events', events.slice(-1500));
}

function applyStaticText() {
  document.documentElement.lang = state.lang === 'zh' ? 'zh-Hans' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(element => {
    element.textContent = t(element.dataset.i18n);
  });
  if (els.langToggle) els.langToggle.textContent = state.lang === 'zh' ? 'EN' : '中文';
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : fallback;
}

function money(value) {
  const number = toNumber(value, NaN);
  if (!Number.isFinite(number) || number <= 0) return 'Ask';
  if (number >= 1000) return `$${Math.round(number / 100) / 10}k`;
  return number.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fullMoney(value) {
  const number = toNumber(value, NaN);
  return Number.isFinite(number) && number > 0
    ? number.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    : t('askAgent');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function splitList(value) {
  return String(value || '').split(/[;|]/).map(item => item.trim()).filter(Boolean);
}

function unique(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function walkingLabel(meters) {
  if (!Number.isFinite(meters)) return 'Nearby';
  const miles = meters / 1609.344;
  const minutes = Math.max(1, Math.round(meters / 80));
  return `${minutes} min walk · ${miles.toFixed(1)} mi`;
}

function minRent(building) {
  const rents = building.units.map(unit => unit.priceNum).filter(value => value > 0);
  return rents.length ? Math.min(...rents) : 0;
}

function maxRent(building) {
  const rents = building.units.map(unit => unit.priceNum).filter(value => value > 0);
  return rents.length ? Math.max(...rents) : 0;
}

function bedroomText(beds) {
  const number = toNumber(beds, 0);
  if (number <= 0) return 'Studio';
  return `${number}+ bed`;
}

function bathText(baths) {
  const number = toNumber(baths, 1);
  return `${Number.isInteger(number) ? number : number.toFixed(1)} bath`;
}

function normalizePoiType(category, name = '') {
  const c = String(category || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  if (c.includes('subway_station') || c.includes('subway') || c === 'transit') return 'subway';
  if (c.includes('restaurant') || c.includes('food')) return 'restaurant';
  if (c.includes('grocery') || c.includes('supermarket') || c.includes('convenience')) return 'grocery';
  if (c.includes('coffee') || c.includes('cafe')) return 'coffee';
  if (c.includes('mall') || c.includes('shopping')) return 'mall';
  if (n.includes('university') || n.includes('college') || c.includes('university') || c.includes('school')) return 'school';
  return 'community';
}

// -----------------------------
// Data normalization
// -----------------------------
function buildData(buildingRows, unitRows, photoRows, poiRows) {
  const photosByBuilding = new Map();
  const photosByUnit = new Map();

  photoRows.forEach(photo => {
    if (!photo.photo_url) return;
    const normalized = { ...photo, photo_type: photo.photo_type || 'photo' };
    if (photo.unit_id) {
      const list = photosByUnit.get(photo.unit_id) || [];
      list.push(normalized);
      photosByUnit.set(photo.unit_id, list);
    } else if (photo.building_id) {
      const list = photosByBuilding.get(photo.building_id) || [];
      list.push(normalized);
      photosByBuilding.set(photo.building_id, list);
    }
  });

  const unitsByBuilding = new Map();
  const units = unitRows.map(unit => {
    const normalized = {
      ...unit,
      unit_id: unit.unit_id,
      building_id: unit.building_id,
      priceNum: toNumber(unit.gross_rent || unit.net_effective_rent, 0),
      grossRentNum: toNumber(unit.gross_rent, 0),
      netRentNum: toNumber(unit.net_effective_rent, NaN),
      bedsNum: toNumber(unit.beds, 0),
      bathsNum: toNumber(unit.baths, 1),
      sqftNum: toNumber(unit.sqft, NaN),
      defaultPeopleNum: toNumber(unit.default_people, NaN),
      maxPeopleNum: toNumber(unit.max_people, NaN),
      rentStepNum: toNumber(unit.rent_step_difference, 200),
      securityDepositNum: toNumber(unit.security_deposit_amount, NaN),
      brokerFeeNum: toNumber(unit.broker_fee_amount, NaN),
      amenityFeeNum: toNumber(unit.amenity_fee_amount, NaN),
      utilitiesNum: toNumber(unit.utilities_estimate_monthly, NaN),
      photos: photosByUnit.get(unit.unit_id) || [],
    };
    return normalized;
  }).filter(unit => unit.unit_id && unit.building_id && unit.priceNum > 0);

  units.forEach(unit => {
    const list = unitsByBuilding.get(unit.building_id) || [];
    list.push(unit);
    unitsByBuilding.set(unit.building_id, list);
  });

  const buildings = buildingRows.map(row => {
    const lat = toNumber(row.lat, NaN);
    const lng = toNumber(row.lng, NaN);
    const unitsForBuilding = (unitsByBuilding.get(row.building_id) || []).sort((a, b) => a.priceNum - b.priceNum);
    const photos = [...(photosByBuilding.get(row.building_id) || [])];
    if (row.primary_photo_url) {
      photos.unshift({ photo_url: row.primary_photo_url, photo_type: 'primary', caption: row.building_name });
    }
    return {
      ...row,
      id: row.building_id,
      building_name: row.building_name || row.address || row.building_id,
      lat,
      lng,
      units: unitsForBuilding,
      photos: dedupePhotos(photos),
      minRent: unitsForBuilding.length ? Math.min(...unitsForBuilding.map(unit => unit.priceNum)) : 0,
      maxRent: unitsForBuilding.length ? Math.max(...unitsForBuilding.map(unit => unit.priceNum)) : 0,
    };
  }).filter(building => building.id && Number.isFinite(building.lat) && Number.isFinite(building.lng) && building.units.length);

  const poiMap = new Map();
  poiRows.forEach(row => {
    const lat = toNumber(row.lat, NaN);
    const lng = toNumber(row.lng, NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !row.name) return;
    const type = row.poi_type || normalizePoiType(row.category || row.type || row.primary_type, row.name);
    const keyName = type === 'subway' ? String(row.name).toLowerCase().replace(/\s+/g, ' ').trim() : `${String(row.name).toLowerCase()}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
    const key = `${row.building_id || 'global'}|${type}|${keyName}`;
    const distance = toNumber(row.distance_meters, NaN);
    if (!poiMap.has(key)) poiMap.set(key, { ...row, id: row.poi_id || key, type, lat, lng, distance_meters: distance });
  });

  state.buildings = buildings;
  state.units = units;
  state.photos = photoRows;
  state.pois = [...poiMap.values()];
  state.buildingMap = new Map(buildings.map(building => [building.id, building]));
  state.unitsByBuilding = unitsByBuilding;
  state.photosByBuilding = photosByBuilding;
  state.photosByUnit = photosByUnit;
  state.filteredBuildings = buildings;
}

function dedupePhotos(photos) {
  const seen = new Set();
  return photos.filter(photo => {
    if (!photo.photo_url || seen.has(photo.photo_url)) return false;
    seen.add(photo.photo_url);
    return true;
  });
}

// -----------------------------
// Icons and markers
// -----------------------------
function rentIcon(building, active = false) {
  return L.divIcon({
    className: '',
    html: `<div class="rentMarker ${active ? 'active' : ''}">${escapeHtml(money(minRent(building)))}</div>`,
    iconSize: [82, 36],
    iconAnchor: [41, 18],
    popupAnchor: [0, -18],
  });
}

function poiIcon(type) {
  const label = {
    subway: 'M',
    university: '🎓',
    chineseStore: '🛒',
    chineseFood: '🍜',
    mall: '🛍',
    community: '•',
  }[type] || '•';
  return L.divIcon({
    className: '',
    html: `<div class="poiPin ${escapeHtml(type)}">${label}</div>`,
    iconSize: type === 'university' ? [46, 52] : [34, 42],
    iconAnchor: type === 'university' ? [23, 46] : [17, 34],
    popupAnchor: [0, -28],
  });
}

function renderBuildingMarkers(buildings = state.filteredBuildings) {
  buildingLayer.clearLayers();
  state.buildingMarkers.clear();

  const bounds = [];
  buildings.forEach(building => {
    const marker = L.marker([building.lat, building.lng], {
      icon: rentIcon(building, state.selectedId === building.id),
      zIndexOffset: state.selectedId === building.id ? 1500 : 900,
      keyboard: true,
      title: building.building_name,
    });
    marker.bindPopup(`
      <div class="popupTitle">${escapeHtml(building.building_name)}</div>
      <div class="popupSub">${escapeHtml(building.neighborhood || building.city_area || 'New York')} · ${building.units.length} ${t('units')} · ${t('from')} ${fullMoney(minRent(building))}</div>
    `);
    marker.on('click', () => selectBuilding(building.id));
    marker.on('mouseover', () => marker.setIcon(rentIcon(building, true)));
    marker.on('mouseout', () => {
      if (state.selectedId !== building.id) marker.setIcon(rentIcon(building, false));
    });
    marker.addTo(buildingLayer);
    state.buildingMarkers.set(building.id, marker);
    bounds.push([building.lat, building.lng]);
  });

  if (bounds.length) map.fitBounds(bounds, { padding: [55, 55], maxZoom: 12 });
}

function updateActiveMarker(previousId, nextId) {
  if (previousId && state.buildingMarkers.has(previousId)) {
    const previous = state.buildingMap.get(previousId);
    state.buildingMarkers.get(previousId).setIcon(rentIcon(previous, false));
    state.buildingMarkers.get(previousId).setZIndexOffset(900);
  }
  if (nextId && state.buildingMarkers.has(nextId)) {
    const next = state.buildingMap.get(nextId);
    state.buildingMarkers.get(nextId).setIcon(rentIcon(next, true));
    state.buildingMarkers.get(nextId).setZIndexOffset(1500);
    state.buildingMarkers.get(nextId).openPopup();
  }
}

function renderDefaultPoiLayer(mode = 'building') {
  poiClusterLayer.clearLayers();
  const typesByMode = {
    building: [],
    rent: [],
    school: ['school'],
    life: ['restaurant', 'grocery', 'coffee', 'mall'],
  };
  const allowed = typesByMode[mode] || typesByMode.building;
  if (!allowed.length) return;

  state.pois
    .filter(poi => allowed.includes(poi.type))
    .forEach(poi => {
      const marker = L.marker([poi.lat, poi.lng], {
        icon: poiIcon(poi.type),
        zIndexOffset: poi.type === 'school' ? 1200 : 320,
      }).bindPopup(`
        <div class="popupTitle">${escapeHtml(poi.name)}</div>
        <div class="popupSub">${escapeHtml(poi.address || poi.category || poi.primary_type || '')}</div>
      `);
      poiClusterLayer.addLayer(marker);
    });
}

function poiIcon(type) {
  const label = {
    subway: 'M',
    school: 'S',
    grocery: 'G',
    restaurant: 'R',
    coffee: 'C',
    mall: 'M',
    community: 'P',
  }[type] || 'P';
  return L.divIcon({
    className: '',
    html: `<div class="poiPin ${escapeHtml(type)}">${label}</div>`,
    iconSize: type === 'school' ? [46, 52] : [34, 42],
    iconAnchor: type === 'school' ? [23, 46] : [17, 34],
    popupAnchor: [0, -28],
  });
}

// -----------------------------
// Filters and list rendering
// -----------------------------
function populateFilters() {
  const areas = unique(state.buildings.map(building => building.neighborhood || building.city_area)).sort();
  els.areaFilter.innerHTML = `<option value="">${state.lang === 'zh' ? '全部区域' : 'All areas'}</option>`
    + areas.map(area => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`).join('');
}

function currentFilters() {
  return {
    query: els.searchInput ? els.searchInput.value.trim().toLowerCase() : '',
    area: els.areaFilter.value,
    beds: els.bedFilter.value,
    rent: toNumber(els.rentFilter.value, 0),
    sort: els.sortFilter.value,
    school: state.activeSchool,
    commuteSchool: state.commuteSchool,
    commuteMode: state.commuteMode,
    commuteMinutes: state.commuteMinutes,
  };
}

function commuteRadiusMeters(mode, minutes) {
  if (!mode || !minutes) return 0;
  if (mode === 'walk') return minutes * 80;
  return minutes * 250;
}

function selectedSchoolPoi(key = state.commuteSchool || state.activeSchool) {
  if (!key) return null;
  return findSchoolPoi(key);
}

function schoolAliases(schoolKey) {
  const key = String(schoolKey || '').toLowerCase();
  return {
    columbia: ['columbia', 'columbia university'],
    nyu: ['nyu', 'new york university'],
    baruch: ['baruch', 'baruch college'],
  }[key] || [key];
}

function renderCommuteRings() {
  commuteLayer.clearLayers();
  const schoolPoi = selectedSchoolPoi();
  if (!schoolPoi || !state.commuteMode || !state.commuteMinutes) return;
  const radius = commuteRadiusMeters(state.commuteMode, state.commuteMinutes);
  const color = state.commuteMode === 'walk' ? '#078557' : '#1769e0';
  L.circle([schoolPoi.lat, schoolPoi.lng], {
    radius,
    color,
    weight: 2,
    fillColor: color,
    fillOpacity: 0.055,
    dashArray: state.commuteMode === 'walk' ? '5 6' : '9 7',
  }).addTo(commuteLayer);
  L.marker([schoolPoi.lat, schoolPoi.lng], { icon: poiIcon('school'), zIndexOffset: 1800 })
    .bindPopup(`<div class="popupTitle">${escapeHtml(schoolPoi.name)}</div><div class="popupSub">${state.commuteMinutes} min ${escapeHtml(t(state.commuteMode === 'walk' ? 'commuteWalk' : 'commuteSubway'))}</div>`)
    .addTo(commuteLayer);
}

function fitCommuteBounds() {
  const schoolPoi = selectedSchoolPoi();
  if (!schoolPoi || !state.commuteMode || !state.commuteMinutes) return false;
  const radius = commuteRadiusMeters(state.commuteMode, state.commuteMinutes);
  const bounds = L.circle([schoolPoi.lat, schoolPoi.lng], { radius }).getBounds();
  map.fitBounds(bounds, {
    padding: [96, 96],
    maxZoom: state.commuteMode === 'walk' ? 15 : 12,
  });
  return true;
}

function setCommuteFilter({ school, mode, minutes }) {
  state.commuteSchool = school || state.commuteSchool || state.activeSchool || 'columbia';
  state.activeSchool = state.commuteSchool;
  state.commuteMode = mode || '';
  state.commuteMinutes = toNumber(minutes, 0);
  document.querySelectorAll('[data-commute-school]').forEach(button => {
    button.classList.toggle('active', button.dataset.commuteSchool === state.commuteSchool);
  });
  document.querySelectorAll('[data-commute-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.commuteMode === state.commuteMode && toNumber(button.dataset.commuteMinutes, 0) === state.commuteMinutes);
  });
  document.querySelectorAll('[data-school]').forEach(button => {
    button.classList.toggle('active', button.dataset.school === state.activeSchool);
  });
  track('commute_filter', { school: state.commuteSchool, mode: state.commuteMode, minutes: state.commuteMinutes });
  applyFilters();
}

function clearCommuteFilter() {
  state.commuteSchool = '';
  state.commuteMode = '';
  state.commuteMinutes = 0;
  state.activeSchool = '';
  commuteLayer.clearLayers();
  document.querySelectorAll('[data-commute-school], [data-commute-mode], [data-school]').forEach(button => button.classList.remove('active'));
  applyFilters();
}

function applyFilters({ fitMap = true } = {}) {
  const filters = currentFilters();
  let buildings = state.buildings.filter(building => {
    const searchable = [
      building.building_name,
      building.address,
      building.neighborhood,
      building.city_area,
      building.transit_summary,
      building.nearby_summary,
    ].join(' ').toLowerCase();

    if (filters.query && !searchable.includes(filters.query)) return false;
    if (filters.area && (building.neighborhood || building.city_area) !== filters.area) return false;
    if (filters.rent && minRent(building) > filters.rent) return false;
    if (filters.beds !== '') {
      const requested = Number(filters.beds);
      const hasBed = building.units.some(unit => requested === 2 ? unit.bedsNum >= 2 : unit.bedsNum === requested);
      if (!hasBed) return false;
    }
    if (filters.commuteSchool && filters.commuteMode && filters.commuteMinutes) {
      const schoolPoi = findSchoolPoi(filters.commuteSchool);
      const radius = commuteRadiusMeters(filters.commuteMode, filters.commuteMinutes);
      if (schoolPoi && haversineMeters(building.lat, building.lng, schoolPoi.lat, schoolPoi.lng) > radius) return false;
    } else if (filters.school) {
      const schoolPoi = findSchoolPoi(filters.school);
      if (schoolPoi) {
        const distance = haversineMeters(building.lat, building.lng, schoolPoi.lat, schoolPoi.lng);
        if (distance > 4500) return false;
      }
    }
    return true;
  });

  buildings = sortBuildings(buildings, filters.sort, filters.school);
  state.filteredBuildings = buildings;
  renderListingList(buildings);
  renderBuildingMarkers(buildings);
  updateCounts(buildings);
  renderCommuteRings();
  if (fitMap) {
    if (!(filters.commuteSchool && filters.commuteMode && filters.commuteMinutes && fitCommuteBounds())) {
      fitFilteredBounds(buildings);
    }
  }
}

function sortBuildings(buildings, sort, school) {
  const copy = [...buildings];
  const schoolPoi = school ? findSchoolPoi(school) : null;
  if (sort === 'rentAsc') return copy.sort((a, b) => minRent(a) - minRent(b));
  if (sort === 'unitsDesc') return copy.sort((a, b) => b.units.length - a.units.length);
  if (sort === 'nameAsc') return copy.sort((a, b) => a.building_name.localeCompare(b.building_name));
  return copy.sort((a, b) => {
    const scoreA = recommendedScore(a, schoolPoi);
    const scoreB = recommendedScore(b, schoolPoi);
    return scoreB - scoreA;
  });
}

function recommendedScore(building, schoolPoi) {
  let score = 0;
  score += Math.min(building.units.length, 20) * 4;
  score -= minRent(building) / 1000;
  if (building.photos.length) score += 5;
  if (building.amenities) score += 4;
  if (schoolPoi) score -= haversineMeters(building.lat, building.lng, schoolPoi.lat, schoolPoi.lng) / 500;
  return score;
}

function findSchoolPoi(schoolKey) {
  const aliases = schoolAliases(schoolKey);
  return state.pois.find(poi => {
    if (poi.type !== 'school') return false;
    const name = String(poi.name || '').toLowerCase();
    return aliases.some(alias => name.includes(alias));
  }) || SCHOOL_FALLBACKS[String(schoolKey || '').toLowerCase()] || null;
}

function fitFilteredBounds(buildings) {
  if (!buildings.length) return;
  const bounds = buildings.map(building => [building.lat, building.lng]);
  map.fitBounds(bounds, { padding: [70, 70], maxZoom: 13 });
}

function renderListingList(buildings) {
  if (!buildings.length) {
    els.listingList.innerHTML = `<div class="listingCard"><strong>${t('noResults')}</strong><div class="cardFooter"><span>${t('tryDifferent')}</span></div></div>`;
    return;
  }
  els.listingList.innerHTML = buildings.map(building => listingCardHtml(building)).join('');
}

function listingCardHtml(building) {
  const area = [building.neighborhood, building.city_area].filter(Boolean).join(' · ') || 'New York';
  const unitTypes = unique(building.units.map(unit => bedroomText(unit.bedsNum))).slice(0, 3).join(' / ');
  return `
    <button class="listingCard ${state.selectedId === building.id ? 'active' : ''}" type="button" data-building-id="${escapeHtml(building.id)}">
      <div class="listingTop">
        <div class="listingTitle">
          <strong>${escapeHtml(building.building_name)}</strong>
          <span>${escapeHtml(building.address)}</span>
        </div>
        <span class="rentBadge">${escapeHtml(money(minRent(building)))}+</span>
      </div>
      <div class="cardMeta">
        <span>${building.units.length} ${t('units')}</span>
        <span>${escapeHtml(unitTypes || 'Units')}</span>
        <span>${escapeHtml(area)}</span>
      </div>
      <div class="cardFooter">
        <span>${escapeHtml(building.transit_summary || building.nearby_summary || t('transitInfo'))}</span>
        <span>${t('view')}</span>
      </div>
    </button>
  `;
}

function updateCounts(buildings) {
  els.resultCount.textContent = `${buildings.length} ${t('buildings')}`;
  els.dataSummary.textContent = `${state.units.length} ${t('units')} · ${state.pois.length} ${t('pois')}`;
}

// -----------------------------
// Selection and drawer
// -----------------------------
function selectBuilding(id, { fly = true } = {}) {
  const building = state.buildingMap.get(id);
  if (!building) return;

  if (state.selectedId === id && !els.detailDrawer.classList.contains('hidden')) {
    closeDrawer();
    return;
  }

  const previousId = state.selectedId;
  state.selectedId = id;
  state.selectedUnitId = null;
  state.activeNearbyType = null;
  track('building_click', { building_id: id, building_name: building.building_name });

  updateActiveMarker(previousId, id);
  renderListingList(state.filteredBuildings);
  openDrawer(building);
  showNearbyToolbar(building);
  clearNearby(false);

  if (fly) {
    map.flyTo([building.lat, building.lng], Math.max(map.getZoom(), 15), {
      duration: 0.65,
      easeLinearity: 0.25,
    });
  }

  const url = new URL(location.href);
  url.searchParams.set('building', id);
  url.searchParams.delete('unit');
  history.replaceState({}, '', url);
}

function openDrawer(building) {
  els.workspace.classList.add('drawerOpen');
  els.detailDrawer.classList.remove('hidden');
  els.detailContent.innerHTML = detailHtml(building);
  requestAnimationFrame(() => map.invalidateSize());
}

function closeDrawer() {
  const previousId = state.selectedId;
  state.selectedId = null;
  state.selectedUnitId = null;
  state.activeNearbyType = null;
  updateActiveMarker(previousId, null);
  clearNearby(false);
  els.workspace.classList.remove('drawerOpen');
  els.detailDrawer.classList.add('hidden');
  els.nearbyToolbar.classList.add('hidden');
  renderListingList(state.filteredBuildings);
  const url = new URL(location.href);
  url.searchParams.delete('building');
  url.searchParams.delete('unit');
  history.replaceState({}, '', url);
  requestAnimationFrame(() => map.invalidateSize());
}

function detailHtml(building) {
  const photos = building.photos.slice(0, 4);
  const amenities = splitList(building.amenities).slice(0, 9);
  const security = splitList(building.security_features).slice(0, 4);
  const nearestTransit = nearbyItemsFor(building, 'subway', CONFIG.poiRadius.subway).slice(0, 4);
  const nearestSchools = nearbyItemsFor(building, 'school', CONFIG.poiRadius.school).slice(0, 4);
  return `
    <div class="detailContentInner">
      ${actionButtonsHtml()}
      <div class="heroPhotos">
        ${[0,1,2,3].map(index => photoTileHtml(photos[index], building, index)).join('')}
      </div>

      <section class="detailHero">
        <h2>${escapeHtml(building.building_name)}</h2>
        <p>${escapeHtml(building.address)}<br>${escapeHtml([building.neighborhood, building.city_area].filter(Boolean).join(' · ') || 'New York')}</p>
        <div class="detailPriceRow">
          <div><span>${t('startRent')}</span><br><strong>${fullMoney(minRent(building))}</strong></div>
          <span>${building.units.length} ${t('availableUnits')}</span>
        </div>
        <div class="ctaRow">
          ${building.availability_url ? `<a class="ctaButton" href="${escapeHtml(building.availability_url)}" target="_blank" rel="noreferrer">${t('checkAvailability')}</a>` : `<button class="ctaButton" type="button" data-open-lead data-lead-building="${escapeHtml(building.id)}">${t('askAvailability')}</button>`}
          <button class="ctaButton secondary" type="button" data-open-lead data-lead-building="${escapeHtml(building.id)}">${t('contact')}</button>
        </div>
      </section>

      <section>
        <div class="sectionTitle">${t('buildingOverview')}</div>
        <div class="factGrid">
          <div class="factBox"><span>${t('rentRange')}</span><strong>${fullMoney(minRent(building))} - ${fullMoney(maxRent(building))}</strong></div>
          <div class="factBox"><span>${t('lease')}</span><strong>${escapeHtml(building.lease_term_default || t('askAgent'))}</strong></div>
          <div class="factBox"><span>${t('utilities')}</span><strong>${escapeHtml(building.utilities_policy || t('askAgent'))}</strong></div>
          <div class="factBox"><span>${t('verification')}</span><strong>${escapeHtml(building.verification_status || 'CSV data')}</strong></div>
        </div>
        <p class="disclaimer">${escapeHtml(building.description || t('listingDisclaimer'))}</p>
      </section>

      <section>
        <div class="sectionTitle">${t('amenities')}</div>
        <div class="tagList">
          ${[...amenities, ...security, building.pet_policy, building.parking_info].filter(Boolean).slice(0, 14).map(item => `<span>${escapeHtml(item)}</span>`).join('') || `<span>${t('askAmenities')}</span>`}
        </div>
      </section>

      <section>
        <div class="sectionTitle">${t('availableUnitsTitle')}</div>
        <div class="unitTable">
          ${building.units.slice(0, 8).map(unit => unitRowHtml(unit)).join('')}
        </div>
      </section>

      <section>
        <div class="sectionTitle">${t('nearbyTransit')}</div>
        <div class="nearbyList">${nearbyListHtml(nearestTransit)}</div>
      </section>

      <section>
        <div class="sectionTitle">${t('nearbySchools')}</div>
        <div class="nearbyList">${nearbyListHtml(nearestSchools)}</div>
      </section>

      <p class="disclaimer"><strong>${t('important')}:</strong> ${t('platformDisclaimer')}</p>
    </div>
  `;
}

function photoTileHtml(photo, building, index) {
  if (!photo?.photo_url) return `<div class="heroPhoto empty"><span>${index === 0 ? t('buildingPhoto') : t('photo')}</span></div>`;
  return `<div class="heroPhoto"><img src="${escapeHtml(photo.photo_url)}" alt="${escapeHtml(photo.caption || building.building_name)}" loading="lazy"></div>`;
}

function unitRowHtml(unit) {
  const sqft = Number.isFinite(unit.sqftNum) ? `${unit.sqftNum} sqft` : 'sqft N/A';
  const availableText = unit.available_date || t('ask');
  return `
    <div class="unitRow" role="button" tabindex="0" data-unit-id="${escapeHtml(unit.unit_id)}">
      <div class="unitRowTop">
        <span>${escapeHtml(unit.floor_plan || t('floorPlan'))} · #${escapeHtml(unit.unit_number || unit.unit_id)}</span>
        <strong>${fullMoney(unit.priceNum)}</strong>
      </div>
      <div class="unitRowMeta">
        <span>${bedroomText(unit.bedsNum)}</span>
        <span>${bathText(unit.bathsNum)}</span>
        <span>${escapeHtml(sqft)}</span>
        <span>${t('available')}: ${escapeHtml(availableText)}</span>
      </div>
      <div class="unitRowActions">
        <button type="button" data-compare-unit="${escapeHtml(unit.unit_id)}">${t('compare')}</button>
        <button type="button" data-open-lead data-lead-unit="${escapeHtml(unit.unit_id)}">${t('contact')}</button>
      </div>
    </div>
  `;
}

function bestUnitFloorPlan(unit, building) {
  const exact = unit.photos.find(photo => String(photo.photo_type || '').toLowerCase().includes('floor')) || unit.photos[0];
  if (exact) return exact;

  const sameLayout = building.units.find(candidate =>
    candidate.unit_id !== unit.unit_id
    && candidate.floor_plan
    && unit.floor_plan
    && candidate.floor_plan.toLowerCase() === unit.floor_plan.toLowerCase()
    && candidate.photos.length
  );
  return sameLayout?.photos.find(photo => String(photo.photo_type || '').toLowerCase().includes('floor'))
    || sameLayout?.photos[0]
    || null;
}

function maxPeopleForUnit(unit) {
  const beds = Number.isFinite(unit?.bedsNum) ? Math.max(0, Math.floor(unit.bedsNum)) : 0;
  return Math.max(1, beds + 1);
}

function peopleForUnit(unit) {
  const maxPeople = maxPeopleForUnit(unit);
  const defaultPeople = Number.isFinite(unit.defaultPeopleNum) && unit.defaultPeopleNum > 0
    ? Math.floor(unit.defaultPeopleNum)
    : maxPeople;
  return Math.min(maxPeople, Math.max(1, defaultPeople));
}

function peopleOptionsHtml(unit, selectedPeople) {
  const maxPeople = maxPeopleForUnit(unit);
  return Array.from({ length: maxPeople }, (_, index) => {
    const value = index + 1;
    const label = `${value} ${value === 1 ? t('person') : t('people')}`;
    return `<option value="${value}" ${value === selectedPeople ? 'selected' : ''}>${label}</option>`;
  }).join('');
}

function defaultRoomLabels(count, unit = null) {
  if (count === 1) return [t('wholeUnit')];
  const beds = Number.isFinite(unit?.bedsNum) ? Math.max(0, Math.floor(unit.bedsNum)) : Math.max(0, count - 1);
  const bedroomLabels = [
    t('primaryBedroom'),
    t('secondBedroom'),
    t('thirdBedroom'),
    t('fourthBedroom'),
  ];
  const labels = [];
  for (let index = 0; index < count; index += 1) {
    const isLivingRoom = index >= beds && count > beds;
    if (isLivingRoom) labels.push(t('livingRoom'));
    else labels.push(bedroomLabels[index] || `${t('bedroom')} ${index + 1}`);
  }
  return labels;
}

function splitByPeople(totalMonthly, people, step = 200, unit = null) {
  const count = Math.max(1, Math.floor(toNumber(people, 1)));
  if (count === 1) return [{ label: unit?.space_1_name || t('wholeUnit'), amount: totalMonthly }];
  const labelsFromUnit = [unit?.space_1_name, unit?.space_2_name, unit?.space_3_name].filter(Boolean);
  const labels = labelsFromUnit.length >= count ? labelsFromUnit : defaultRoomLabels(count, unit);
  const offsetTotal = step * (count * (count - 1) / 2);
  const base = Math.max(0, (totalMonthly - offsetTotal) / count);
  return Array.from({ length: count }, (_, index) => ({
    label: labels[index] || `${t('bedroom')} ${index + 1}`,
    amount: base + (count - 1 - index) * step,
  }));
}

function guarantorNoteHtml(monthlyRent) {
  const threshold = toNumber(monthlyRent, 0) * 35;
  return `
    <div class="guarantorNote">
      <div class="guarantorHeader">
        <strong>${t('guarantorTitle')}</strong>
        <span>${t('guarantorIncome')}: ${fullMoney(threshold)}</span>
      </div>
      <p>${t('guarantorNote')}</p>
      <p>${t('guarantorFee')}</p>
      <p>${t('guarantorConfirm')}</p>
    </div>`;
}

function renderRentCalculator(building, unit) {
  const baseRent = unit.grossRentNum || unit.priceNum;
  const people = peopleForUnit(unit);
  const deposit = Number.isFinite(unit.securityDepositNum) ? unit.securityDepositNum : baseRent;
  const broker = Number.isFinite(unit.brokerFeeNum) ? unit.brokerFeeNum : 0;
  const fees = Number.isFinite(unit.amenityFeeNum) ? unit.amenityFeeNum : 0;
  const utilities = Number.isFinite(unit.utilitiesNum) ? unit.utilitiesNum : 180;
  return `
    <section>
      <div class="sectionTitle">${t('rentCalculator')}</div>
      <div class="calculator" id="rentCalculator">
        <div class="calcGrid">
          <label>${t('monthlyGrossRent')}<input id="calcRent" type="number" value="${Math.round(baseRent)}" readonly></label>
          <label>${t('leaseMonths')}<input id="calcLease" type="number" min="1" value="${toNumber(unit.lease_term, toNumber(building.lease_term_default, 12)) || 12}"></label>
          <label>${t('freeMonths')}<input id="calcFree" type="number" min="0" step="0.5" value="0"></label>
          <label>${t('peopleSharing')}<select id="calcPeople">${peopleOptionsHtml(unit, people)}</select></label>
          <label>${t('securityDeposit')}<input id="calcDeposit" type="number" min="0" value="${Math.round(deposit)}"></label>
          <label>${t('brokerFee')}<input id="calcBroker" type="number" min="0" value="${Math.round(broker)}"></label>
          <label>${t('amenityFees')}<input id="calcFees" type="number" min="0" value="${Math.round(fees)}"></label>
          <label>${t('utilitiesMonth')}<input id="calcUtilities" type="number" min="0" value="${Math.round(utilities)}"></label>
        </div>
        <button class="calcBtn" id="calcBtn" type="button">${t('calculate')}</button>
        <div class="calcResults" id="calcResults"></div>
        <div id="shareCalcResults"></div>
        ${guarantorNoteHtml(baseRent)}
      </div>
    </section>`;
}

function renderDynamicSplit(totalMonthly, people, moveInParts, unit) {
  const step = Number.isFinite(unit?.rentStepNum) ? unit.rentStepNum : 200;
  const shares = splitByPeople(totalMonthly, people, step, unit);
  const count = shares.length;
  const oneTimeTotal = moveInParts.deposit + moveInParts.broker + moveInParts.fees;
  const oneTimePerPerson = oneTimeTotal / count;
  const planTitle = count === 1
    ? t('privatePlan')
    : (state.lang === 'zh' ? `${count}人${t('sharedPlan')}` : `${count}-person shared plan`);
  return `<div class="shareBox">
    <div class="shareHeader"><strong>${planTitle}</strong><span>${count} ${count === 1 ? t('person') : t('people')}</span></div>
    <div class="shareRows">${shares.map(share => `<div><span>${escapeHtml(share.label)}</span><strong>${fullMoney(share.amount)}/mo</strong><em>${t('moveInEst')} ${fullMoney(share.amount + oneTimePerPerson)}</em></div>`).join('')}</div>
    <div class="moveInSplitBox">
      <div><span>${t('depositSplit')}</span><strong>${fullMoney(moveInParts.deposit / count)}</strong></div>
      <div><span>${t('brokerSplit')}</span><strong>${fullMoney(moveInParts.broker / count)}</strong></div>
      <div><span>${t('feesSplit')}</span><strong>${fullMoney(moveInParts.fees / count)}</strong></div>
      <div><span>${t('oneTimePerson')}</span><strong>${fullMoney(oneTimePerPerson)}</strong></div>
    </div>
    <p>${t('splitNote')}</p>
  </div>`;
}

function calculateRent() {
  const building = state.selectedId ? state.buildingMap.get(state.selectedId) : null;
  const unit = building?.units.find(item => item.unit_id === state.selectedUnitId);
  if (!unit) return;
  const gross = toNumber(document.getElementById('calcRent')?.value, 0);
  const lease = Math.max(1, toNumber(document.getElementById('calcLease')?.value, 12));
  const free = Math.min(lease, Math.max(0, toNumber(document.getElementById('calcFree')?.value, 0)));
  const people = Math.min(maxPeopleForUnit(unit), Math.max(1, Math.floor(toNumber(document.getElementById('calcPeople')?.value, 1))));
  const deposit = Math.max(0, toNumber(document.getElementById('calcDeposit')?.value, 0));
  const broker = Math.max(0, toNumber(document.getElementById('calcBroker')?.value, 0));
  const fees = Math.max(0, toNumber(document.getElementById('calcFees')?.value, 0));
  const utilities = Math.max(0, toNumber(document.getElementById('calcUtilities')?.value, 0));
  const netEffective = gross * Math.max(0, lease - free) / lease;
  const monthlyTotal = netEffective + utilities;
  const oneTimeFees = deposit + broker + fees;
  const moveIn = monthlyTotal + oneTimeFees;
  const result = document.getElementById('calcResults');
  if (result) {
    result.innerHTML = `
      <div><span>${t('netEffective')}</span><strong>${fullMoney(netEffective)}/mo</strong></div>
      <div><span>${t('monthlyTotal')}</span><strong>${fullMoney(monthlyTotal)}/mo</strong></div>
      <div><span>${t('moveInTotal')}</span><strong>${fullMoney(moveIn)}</strong></div>
      <div><span>${t('feesPerson')}</span><strong>${fullMoney(oneTimeFees / people)}</strong></div>
      <p>${t('formula')}</p>`;
  }
  const share = document.getElementById('shareCalcResults');
  if (share) share.innerHTML = renderDynamicSplit(monthlyTotal, people, { deposit, broker, fees }, unit);
}

function actionButtonsHtml() {
  const expandLabel = state.panelExpanded ? t('shrinkDetails') : t('expandDetails');
  return `
    <div class="drawerActions">
      <button class="iconActionBtn" type="button" data-panel-expand title="${expandLabel}" aria-label="${expandLabel}">⤢</button>
      <button class="iconActionBtn primary" type="button" data-share-link title="${t('share')}" aria-label="${t('share')}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="M8.7 10.7 15.3 6.3M8.7 13.3l6.6 4.4"></path></svg>
      </button>
    </div>`;
}

function shareUrlFor(building, unit = null) {
  const url = new URL(location.href);
  url.searchParams.set('building', building.id);
  if (unit) url.searchParams.set('unit', unit.unit_id);
  else url.searchParams.delete('unit');
  return url.toString();
}

async function copyShareLink(button) {
  const building = state.selectedId ? state.buildingMap.get(state.selectedId) : null;
  if (!building) return;
  const unit = state.selectedUnitId ? building.units.find(item => item.unit_id === state.selectedUnitId) : null;
  const link = shareUrlFor(building, unit);
  track('share_click', { building_id: building.id, unit_id: unit?.unit_id || '' });
  try {
    await navigator.clipboard.writeText(link);
    button.classList.add('copied');
    setTimeout(() => button.classList.remove('copied'), 1300);
  } catch (_) {
    window.prompt('Copy this share link:', link);
  }
}

function togglePanelExpanded() {
  state.panelExpanded = !state.panelExpanded;
  els.workspace.classList.toggle('panelExpanded', state.panelExpanded);
  requestAnimationFrame(() => map.invalidateSize());
}

function unitDetailHtml(building, unit) {
  const sqft = Number.isFinite(unit.sqftNum) ? `${unit.sqftNum} sqft` : t('askAgent');
  const floorPlan = bestUnitFloorPlan(unit, building);
  const unitFacts = [
    [t('grossRent'), fullMoney(unit.grossRentNum || unit.priceNum)],
    [t('netEffectiveRent'), Number.isFinite(unit.netRentNum) ? fullMoney(unit.netRentNum) : t('askAgent')],
    [t('bedrooms'), bedroomText(unit.bedsNum)],
    [t('bathrooms'), bathText(unit.bathsNum)],
    [t('size'), sqft],
    [t('lease'), unit.lease_term || building.lease_term_default || t('askAgent')],
    [t('available'), unit.available_date || t('availableNow')],
    [t('utilities'), Number.isFinite(unit.utilitiesNum) ? fullMoney(unit.utilitiesNum) : (building.utilities_policy || t('askAgent'))],
  ];

  return `
    <div class="detailContentInner">
      <div class="unitTopActions">
        <button class="backButton" type="button" data-back-building>${t('backBuilding')}</button>
        ${actionButtonsHtml()}
      </div>

      <section class="unitDetailHeader">
        <div>
          <span class="eyebrow">${t('availableUnit')}</span>
          <h2>${escapeHtml(unit.floor_plan || t('floorPlan'))} #${escapeHtml(unit.unit_number || unit.unit_id)}</h2>
          <p>${escapeHtml(building.building_name)}<br>${escapeHtml(building.address || '')}</p>
        </div>
        <strong>${fullMoney(unit.priceNum)}</strong>
      </section>

      <section>
        <div class="sectionTitle">${t('floorPlan')}</div>
        ${floorPlan?.photo_url
          ? `<a class="floorPlanBox" href="${escapeHtml(floorPlan.photo_url)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(floorPlan.photo_url)}" alt="${escapeHtml(floorPlan.caption || `${building.building_name} floor plan`)}" loading="lazy"></a>`
          : `<div class="floorPlanBox empty">${t('noFloorPlan')}</div>`}
      </section>

      <section>
        <div class="sectionTitle">${t('unitDetails')}</div>
        <div class="factGrid">
          ${unitFacts.map(([label, value]) => `<div class="factBox"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}
        </div>
        ${unit.concession ? `<p class="disclaimer"><strong>${t('concession')}:</strong> ${escapeHtml(unit.concession)}</p>` : ''}
      </section>

      ${renderRentCalculator(building, unit)}

      <section>
        <div class="sectionTitle">${t('feesVerification')}</div>
        <div class="factGrid">
          <div class="factBox"><span>${t('securityDeposit')}</span><strong>${Number.isFinite(unit.securityDepositNum) ? fullMoney(unit.securityDepositNum) : t('askAgent')}</strong></div>
          <div class="factBox"><span>${t('brokerFee')}</span><strong>${Number.isFinite(unit.brokerFeeNum) ? fullMoney(unit.brokerFeeNum) : t('askAgent')}</strong></div>
          <div class="factBox"><span>${t('amenityFee')}</span><strong>${Number.isFinite(unit.amenityFeeNum) ? fullMoney(unit.amenityFeeNum) : t('askAgent')}</strong></div>
          <div class="factBox"><span>${t('checked')}</span><strong>${escapeHtml(unit.source_last_checked || 'CSV data')}</strong></div>
        </div>
      </section>

      <div class="ctaRow">
        <button class="ctaButton" type="button" data-compare-unit="${escapeHtml(unit.unit_id)}">${t('compare')}</button>
        <button class="ctaButton secondary" type="button" data-open-lead data-lead-building="${escapeHtml(building.id)}" data-lead-unit="${escapeHtml(unit.unit_id)}">${t('contact')}</button>
        ${unit.source_url ? `<a class="ctaButton" href="${escapeHtml(unit.source_url)}" target="_blank" rel="noreferrer">${t('officialUnitPage')}</a>` : ''}
        ${building.availability_url ? `<a class="ctaButton secondary" href="${escapeHtml(building.availability_url)}" target="_blank" rel="noreferrer">${t('buildingAvailability')}</a>` : ''}
      </div>

      <p class="disclaimer"><strong>${t('important')}:</strong> ${t('confirmUnit')}</p>
    </div>
  `;
}

function openUnitDetail(unitId, { updateUrl = true } = {}) {
  const building = state.selectedId ? state.buildingMap.get(state.selectedId) : null;
  if (!building) return;
  const unit = building.units.find(item => item.unit_id === unitId);
  if (!unit) return;

  state.selectedUnitId = unitId;
  track('unit_click', { building_id: building.id, unit_id: unitId, floor_plan: unit.floor_plan || '' });
  els.detailContent.innerHTML = unitDetailHtml(building, unit);
  els.detailDrawer.scrollTop = 0;
  calculateRent();

  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set('building', building.id);
    url.searchParams.set('unit', unitId);
    history.replaceState({}, '', url);
  }
}

function actionButtonsHtml() {
  const expandLabel = state.panelExpanded ? t('shrinkDetails') : t('expandDetails');
  return `
    <div class="drawerActions">
      <button class="iconActionBtn" type="button" data-panel-expand title="${expandLabel}" aria-label="${expandLabel}">&#x2922;</button>
      <button class="iconActionBtn primary" type="button" data-share-link title="${t('share')}" aria-label="${t('share')}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="M8.7 10.7 15.3 6.3M8.7 13.3l6.6 4.4"></path></svg>
      </button>
    </div>`;
}

function findUnitRecord(unitId) {
  for (const building of state.buildings) {
    const unit = building.units.find(item => item.unit_id === unitId);
    if (unit) return { building, unit };
  }
  return null;
}

function compareUnitCardHtml(unitId) {
  const record = findUnitRecord(unitId);
  if (!record) return '';
  const { building, unit } = record;
  return `
    <article class="compareCard">
      <button class="compareRemove" type="button" data-compare-remove="${escapeHtml(unit.unit_id)}" aria-label="${t('remove')}">&times;</button>
      <span>${escapeHtml(building.building_name)}</span>
      <h3>${escapeHtml(unit.floor_plan || t('floorPlan'))} #${escapeHtml(unit.unit_number || unit.unit_id)}</h3>
      <strong>${fullMoney(unit.priceNum)}/mo</strong>
      <div class="compareFacts">
        <div><span>${t('unitDetails')}</span><b>${bedroomText(unit.bedsNum)} / ${bathText(unit.bathsNum)}</b></div>
        <div><span>${t('lease')}</span><b>${escapeHtml(unit.lease_term || building.lease_term_default || t('ask'))}</b></div>
        <div><span>${t('utilities')}</span><b>${Number.isFinite(unit.utilitiesNum) ? fullMoney(unit.utilitiesNum) : escapeHtml(building.utilities_policy || t('ask'))}</b></div>
        <div><span>${t('available')}</span><b>${escapeHtml(unit.available_date || t('availableNow'))}</b></div>
      </div>
      <div class="compareActions">
        <button type="button" data-open-unit="${escapeHtml(unit.unit_id)}">${t('unitDetails')}</button>
        <button type="button" data-open-lead data-lead-building="${escapeHtml(building.id)}" data-lead-unit="${escapeHtml(unit.unit_id)}">${t('contact')}</button>
      </div>
    </article>`;
}

function renderCompareDock() {
  if (!els.compareDock) return;
  if (!state.compareUnitIds.length) {
    els.compareDock.classList.add('hidden');
    els.compareDock.innerHTML = '';
    return;
  }
  els.compareDock.classList.remove('hidden');
  els.compareDock.classList.toggle('expanded', state.compareUnitIds.length >= 2);
  els.compareDock.innerHTML = `
    <div class="compareHeader">
      <div><span>${t('compareTitle')}</span><strong>${state.compareUnitIds.length}/2</strong></div>
      <button type="button" data-compare-clear>${t('clear')}</button>
    </div>
    <div class="compareCards">
      ${state.compareUnitIds.map(compareUnitCardHtml).join('')}
      ${state.compareUnitIds.length === 1 ? `<div class="comparePlaceholder">${t('compareHint')}</div>` : ''}
    </div>`;
}

function addCompareUnit(unitId) {
  if (!unitId || state.compareUnitIds.includes(unitId)) return;
  if (state.compareUnitIds.length >= 2) state.compareUnitIds.shift();
  state.compareUnitIds.push(unitId);
  track('compare_add', { unit_id: unitId });
  renderCompareDock();
}

function removeCompareUnit(unitId) {
  state.compareUnitIds = state.compareUnitIds.filter(id => id !== unitId);
  renderCompareDock();
}

function beginCompareDockDrag(event) {
  if (!els.compareDock || event.button !== 0 || event.target.closest('button')) return;
  const rect = els.compareDock.getBoundingClientRect();
  const shiftX = event.clientX - rect.left;
  const shiftY = event.clientY - rect.top;
  els.compareDock.classList.add('dragging', 'manualPosition');
  els.compareDock.style.left = `${rect.left}px`;
  els.compareDock.style.top = `${rect.top}px`;
  els.compareDock.style.right = 'auto';
  els.compareDock.style.bottom = 'auto';
  event.preventDefault();

  const move = moveEvent => {
    const width = els.compareDock.offsetWidth;
    const height = els.compareDock.offsetHeight;
    const nextLeft = Math.min(Math.max(8, moveEvent.clientX - shiftX), Math.max(8, window.innerWidth - width - 8));
    const nextTop = Math.min(Math.max(8, moveEvent.clientY - shiftY), Math.max(8, window.innerHeight - height - 8));
    els.compareDock.style.left = `${nextLeft}px`;
    els.compareDock.style.top = `${nextTop}px`;
  };

  const stop = () => {
    els.compareDock?.classList.remove('dragging');
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop, { once: true });
}

function openLeadModal({ buildingId = state.selectedId, unitId = state.selectedUnitId } = {}) {
  const building = buildingId ? state.buildingMap.get(buildingId) : null;
  const unit = unitId && building ? building.units.find(item => item.unit_id === unitId) : null;
  state.leadContext = { buildingId: building?.id || '', unitId: unit?.unit_id || '' };
  if (els.leadContext) {
    els.leadContext.textContent = [building?.building_name, unit ? `${unit.floor_plan || 'Unit'} #${unit.unit_number || unit.unit_id}` : ''].filter(Boolean).join(' - ');
  }
  if (els.leadForm) els.leadForm.reset();
  els.leadModal?.classList.remove('hidden');
  track('lead_open', state.leadContext);
}

function saveLead(form) {
  const formData = new FormData(form);
  const lead = {
    id: `lead_${Date.now()}`,
    at: new Date().toISOString(),
    building_id: state.leadContext.buildingId,
    unit_id: state.leadContext.unitId,
    name: String(formData.get('name') || '').trim(),
    wechat: String(formData.get('wechat') || '').trim(),
    school: String(formData.get('school') || '').trim(),
    budget: String(formData.get('budget') || '').trim(),
    move_date: String(formData.get('moveDate') || '').trim(),
    referred_agent: String(formData.get('agent') || '').trim(),
    notes: String(formData.get('notes') || '').trim(),
  };
  const leads = storageRead('nyrm_leads', []);
  leads.push(lead);
  storageWrite('nyrm_leads', leads);
  track('lead_submit', lead);
  els.leadModal?.classList.add('hidden');
  alert(t('leadSaved'));
}

function closeModals() {
  document.querySelectorAll('.modalOverlay').forEach(modal => modal.classList.add('hidden'));
}

function eventCounts(events) {
  return events.reduce((acc, event) => {
    acc[event.event] = (acc[event.event] || 0) + 1;
    return acc;
  }, {});
}

function topBy(events, key, limit = 5) {
  const counts = {};
  events.forEach(event => {
    const value = event[key];
    if (value) counts[value] = (counts[value] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function renderAnalyticsModal() {
  const events = storageRead('nyrm_analytics_events', []);
  const leads = storageRead('nyrm_leads', []);
  const counts = eventCounts(events);
  const topBuildings = topBy(events, 'building_id');
  const topUnits = topBy(events, 'unit_id');
  const topSchools = topBy(events, 'school');
  const conversion = counts.page_view ? Math.round((leads.length / counts.page_view) * 1000) / 10 : 0;
  const listRows = (rows, format) => rows.map(([id, count]) => `<p><b>${escapeHtml(format(id))}</b><span>${count}</span></p>`).join('') || `<p>${t('noDataYet')}</p>`;
  const recentLeadRows = leads.slice(-5).reverse().map(lead => {
    const building = state.buildingMap.get(lead.building_id);
    const unit = findUnitRecord(lead.unit_id)?.unit;
    return `<p><b>${escapeHtml(lead.name || t('leadName'))}</b><span>${escapeHtml([building?.building_name, unit?.unit_number, lead.school].filter(Boolean).join(' · ') || t('ask'))}</span></p>`;
  }).join('') || `<p>${t('noDataYet')}</p>`;
  if (els.analyticsContent) {
    els.analyticsContent.innerHTML = `
      <div class="analyticsGrid">
        <div><span>${t('visits')}</span><strong>${counts.page_view || 0}</strong></div>
        <div><span>${t('buildingClicks')}</span><strong>${counts.building_click || 0}</strong></div>
        <div><span>${t('unitClicks')}</span><strong>${counts.unit_click || 0}</strong></div>
        <div><span>${t('shareClicks')}</span><strong>${counts.share_click || 0}</strong></div>
        <div><span>${t('leadOpens')}</span><strong>${counts.lead_open || 0}</strong></div>
        <div><span>${t('leadSubmits')}</span><strong>${leads.length}</strong></div>
        <div><span>${t('conversionRate')}</span><strong>${conversion}%</strong></div>
        <div><span>${t('crmReady')}</span><strong>JSON</strong></div>
      </div>
      <div class="analyticsLists">
        <section><h3>${t('topBuildings')}</h3>${listRows(topBuildings, id => state.buildingMap.get(id)?.building_name || id)}</section>
        <section><h3>${t('topUnits')}</h3>${listRows(topUnits, id => id)}</section>
        <section><h3>${t('schoolIntent')}</h3>${listRows(topSchools, id => id)}</section>
        <section><h3>${t('recentLeads')}</h3>${recentLeadRows}</section>
      </div>`;
  }
  els.analyticsModal?.classList.remove('hidden');
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderPolicy(type = 'disclaimer') {
  const zh = state.lang === 'zh';
  const content = {
    disclaimer: zh
      ? `<p>本平台是租房信息发现和线索提交工具，不收取租金、押金，不签署租约。所有价格、空房、费用、户型图、设施和通勤时间都需要与中介、业主或楼盘管理方最终确认。</p><p>地图通勤圈层是估算展示，不构成保证。</p>`
      : `<p>This platform is an information discovery and lead submission tool. It does not collect rent, deposits, or sign leases. Prices, availability, fees, floor plans, amenities, and commute estimates must be confirmed with the agent, owner, or property management.</p><p>Map commute rings are estimates and are not guarantees.</p>`,
    fees: zh
      ? `<p>展示的租金计算器仅为估算。可能费用包括但不限于：申请费、押金、设施费、宠物费、停车费、水电网、中介费和租期优惠差异。所有费用以书面报价和租约为准。</p>`
      : `<p>The rent calculator is an estimate only. Possible costs include application fees, deposits, amenity fees, pet fees, parking, utilities, broker fees, and lease-term concessions. Written quotes and lease documents control.</p>`,
    privacy: zh
      ? `<p>试用版会把姓名、微信、学校、预算、入住时间和咨询内容保存在本浏览器本地。正式版接入 CRM 前，应提供隐私政策、删除请求方式、访问权限控制和数据安全措施。</p>`
      : `<p>The trial stores name, WeChat, school, budget, move-in date, and inquiry notes locally in this browser. Before CRM launch, provide a privacy policy, deletion request process, access controls, and data security safeguards.</p>`,
    fairHousing: zh
      ? `<p>平台和合作方应遵守公平住房要求，不基于受保护类别进行歧视性展示、筛选、广告或服务。学校/通勤筛选应作为用户便利功能，而不是限制可居住人群。</p>`
      : `<p>The platform and partners should follow fair housing requirements and avoid discriminatory display, filtering, advertising, or service based on protected classes. School and commute filters should support user convenience, not restrict who may live where.</p>`,
  };
  if (els.policyContent) els.policyContent.innerHTML = content[type] || content.disclaimer;
  document.querySelectorAll('[data-policy-tab]').forEach(button => button.classList.toggle('active', button.dataset.policyTab === type));
}

function renderPolicy(type = 'disclaimer') {
  const zh = state.lang === 'zh';
  const content = {
    disclaimer: zh
      ? `<h3>平台角色</h3><p>本平台是租房信息发现、户型对比和线索提交工具，不收取租金、押金，不代表用户签署租约，也不保证任何房源可租状态。</p><h3>信息确认</h3><p>价格、空房、费用、户型图、设施、通勤时间和优惠活动都需要与中介、业主、官网或楼盘管理方最终确认。学校通勤圈层是估算展示，不构成承诺。</p>`
      : `<h3>Platform role</h3><p>This platform is an information discovery, unit comparison, and lead submission tool. It does not collect rent or deposits, sign leases, or guarantee availability.</p><h3>Confirm details</h3><p>Prices, availability, fees, floor plans, amenities, commute estimates, and concessions must be confirmed with the agent, owner, official site, or property management. Commute rings are estimates, not guarantees.</p>`,
    fees: zh
      ? `<h3>费用说明</h3><p>租金计算器仅用于预估。可能费用包括申请费、押金、设施费、宠物费、停车费、水电网、中介费、租期优惠差异、第三方担保费和搬入前一次性费用。</p><p>纽约租房通常需要租客或担保人达到收入要求；若不满足，第三方担保公司可能收取不退还担保费，具体比例按信用和申请材料确认。</p><p>所有费用以书面报价、楼盘官方确认和租约文件为准。若某项费用显示为“咨询中介”，表示当前数据表没有可靠数值。</p>`
      : `<h3>Fee disclosure</h3><p>The rent calculator is an estimate only. Possible costs include application fees, deposits, amenity fees, pet fees, parking, utilities, broker fees, lease-term concessions, third-party guarantor fees, and move-in one-time costs.</p><p>NYC rentals commonly require the renter or guarantor to meet income qualifications; when that is not met, a guarantor company may charge a non-refundable fee based on credit and application profile.</p><p>Written quotes, official property confirmation, and lease documents control. “Ask agent” means the current data table does not contain a reliable value.</p>`,
    privacy: zh
      ? `<h3>试用版数据</h3><p>当前试用版把姓名、微信、学校、预算、入住时间、感兴趣户型和备注保存在本浏览器本地，方便导出给 CRM 或表格。</p><h3>正式版要求</h3><p>接入 CRM 前需要补充正式隐私政策、删除请求入口、员工访问权限控制、数据保留期限、加密/备份策略和第三方服务说明。</p>`
      : `<h3>Trial data</h3><p>The trial stores name, WeChat, school, budget, move-in date, interested unit, and inquiry notes locally in this browser for export into a CRM or spreadsheet.</p><h3>Production requirements</h3><p>Before CRM launch, add a formal privacy policy, deletion request process, employee access controls, retention rules, encryption/backup practices, and third-party processor disclosures.</p>`,
    fairHousing: zh
      ? `<h3>公平住房提示</h3><p>平台和合作中介应遵守公平住房要求，不基于受保护类别进行歧视性展示、筛选、广告投放、推荐或服务差异。</p><p>学校和通勤筛选只用于帮助用户理解位置便利性，不应限制谁可以查看、咨询或申请任何房源。</p>`
      : `<h3>Fair Housing notice</h3><p>The platform and partner agents should follow fair housing requirements and avoid discriminatory display, filtering, advertising, recommendations, or service differences based on protected classes.</p><p>School and commute filters are for user convenience and should not restrict who can view, inquire about, or apply for any listing.</p>`,
  };
  if (els.policyContent) els.policyContent.innerHTML = content[type] || content.disclaimer;
  document.querySelectorAll('[data-policy-tab]').forEach(button => button.classList.toggle('active', button.dataset.policyTab === type));
}

function nearbyListHtml(items) {
  if (!items.length) return `<div class="nearbyItem"><strong>${t('noNearbyData')}</strong><span>${t('runPoiUpdate')}</span></div>`;
  return items.map(item => `
    <div class="nearbyItem">
      <strong>${escapeHtml(item.name)}</strong>
      <span>${walkingLabel(item.distance)}</span>
    </div>
  `).join('');
}

function showNearbyToolbar(building) {
  els.nearbyToolbar.classList.remove('hidden');
  els.nearbyBuildingName.textContent = building.building_name;
}

// -----------------------------
// Nearby local POI tools
// -----------------------------
function nearbyItemsFor(building, type, radiusMeters) {
  return state.pois
    .filter(poi => poi.type === type && (!poi.building_id || poi.building_id === building.id))
    .map(poi => ({
      ...poi,
      distance: Number.isFinite(poi.distance_meters) ? poi.distance_meters : haversineMeters(building.lat, building.lng, poi.lat, poi.lng),
    }))
    .filter(poi => poi.distance <= radiusMeters)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, type === 'subway' ? 4 : CONFIG.maxNearbyResults);
}

function handleNearby(type) {
  const building = state.selectedId ? state.buildingMap.get(state.selectedId) : null;
  if (!building) return;
  if (type === 'clear') {
    clearNearby(true);
    return;
  }

  state.activeNearbyType = type;
  document.querySelectorAll('[data-nearby]').forEach(button => {
    button.classList.toggle('active', button.dataset.nearby === type);
  });

  nearbyLayer.clearLayers();
  radiusLayer.clearLayers();
  if (map.hasLayer(subwayLineLayer)) map.removeLayer(subwayLineLayer);
  if (type === 'subway') subwayLineLayer.addTo(map);

  const radius = CONFIG.poiRadius[type] || 1000;
  L.circle([building.lat, building.lng], {
    radius,
    color: '#1769e0',
    weight: 2,
    fillColor: '#1769e0',
    fillOpacity: 0.055,
    dashArray: '6 6',
  }).addTo(radiusLayer);

  const items = nearbyItemsFor(building, type, radius);
  items.forEach(item => {
    L.marker([item.lat, item.lng], { icon: poiIcon(item.type), zIndexOffset: 1000 })
      .bindPopup(`<div class="popupTitle">${escapeHtml(item.name)}</div><div class="popupSub">${walkingLabel(item.distance)}<br>${escapeHtml(item.address || item.category || '')}</div>`)
      .addTo(nearbyLayer);
  });

  const layers = [...nearbyLayer.getLayers(), state.buildingMarkers.get(building.id)].filter(Boolean);
  if (layers.length > 1) {
    map.fitBounds(L.featureGroup(layers).getBounds(), { padding: [72, 72], maxZoom: type === 'subway' ? 14 : 16 });
  }
}

function clearNearby(resetButtons = true) {
  nearbyLayer.clearLayers();
  radiusLayer.clearLayers();
  if (map.hasLayer(subwayLineLayer)) map.removeLayer(subwayLineLayer);
  state.activeNearbyType = null;
  if (resetButtons) document.querySelectorAll('[data-nearby]').forEach(button => button.classList.remove('active'));
}

// -----------------------------
// Events
// -----------------------------
function bindEvents() {
  els.searchForm?.addEventListener('submit', event => {
      event.preventDefault();
      applyFilters();
    });
  [els.areaFilter, els.bedFilter, els.rentFilter, els.sortFilter].forEach(element => {
    element?.addEventListener('change', () => applyFilters());
  });
  els.searchInput?.addEventListener('input', debounce(() => applyFilters({ fitMap: false }), 180));

  els.resetFilters?.addEventListener('click', () => {
    if (els.searchInput) els.searchInput.value = '';
    if (els.areaFilter) els.areaFilter.value = '';
    if (els.bedFilter) els.bedFilter.value = '';
    if (els.rentFilter) els.rentFilter.value = '';
    if (els.sortFilter) els.sortFilter.value = 'recommended';
    state.activeSchool = '';
    state.commuteSchool = '';
    state.commuteMode = '';
    state.commuteMinutes = 0;
    commuteLayer.clearLayers();
    document.querySelectorAll('[data-school]').forEach(button => button.classList.remove('active'));
    document.querySelectorAll('[data-commute-school], [data-commute-mode]').forEach(button => button.classList.remove('active'));
    applyFilters();
  });

  els.listingList?.addEventListener('click', event => {
    const card = event.target.closest('[data-building-id]');
    if (card) selectBuilding(card.dataset.buildingId);
  });

  els.closeDrawer.addEventListener('click', closeDrawer);

  els.detailContent.addEventListener('click', event => {
    const compareButton = event.target.closest('[data-compare-unit]');
    if (compareButton) {
      event.stopPropagation();
      addCompareUnit(compareButton.dataset.compareUnit);
      return;
    }

    const leadButton = event.target.closest('[data-open-lead]');
    if (leadButton) {
      event.stopPropagation();
      openLeadModal({ buildingId: leadButton.dataset.leadBuilding || state.selectedId, unitId: leadButton.dataset.leadUnit || state.selectedUnitId });
      return;
    }

    const unitButton = event.target.closest('[data-unit-id]');
    if (unitButton) {
      openUnitDetail(unitButton.dataset.unitId);
      return;
    }

    if (event.target.closest('[data-back-building]')) {
      const building = state.selectedId ? state.buildingMap.get(state.selectedId) : null;
      if (!building) return;
      state.selectedUnitId = null;
      els.detailContent.innerHTML = detailHtml(building);
      els.detailDrawer.scrollTop = 0;
      const url = new URL(location.href);
      url.searchParams.set('building', building.id);
      url.searchParams.delete('unit');
      history.replaceState({}, '', url);
      return;
    }

    if (event.target.closest('#calcBtn')) {
      calculateRent();
      return;
    }

    const shareButton = event.target.closest('[data-share-link]');
    if (shareButton) {
      copyShareLink(shareButton);
      return;
    }

    if (event.target.closest('[data-panel-expand]')) {
      togglePanelExpanded();
    }
  });

  els.detailContent.addEventListener('input', event => {
    if (event.target.closest('#rentCalculator')) calculateRent();
  });

  els.detailContent.addEventListener('change', event => {
    if (event.target.closest('#rentCalculator')) calculateRent();
  });

  els.langToggle?.addEventListener('click', () => {
    state.lang = state.lang === 'zh' ? 'en' : 'zh';
    localStorage.setItem('nyrm_lang', state.lang);
    applyStaticText();
    populateFilters();
    updateCounts(state.filteredBuildings);
    renderCompareDock();
    const building = state.selectedId ? state.buildingMap.get(state.selectedId) : null;
    if (building && state.selectedUnitId) openUnitDetail(state.selectedUnitId, { updateUrl: false });
    else if (building) els.detailContent.innerHTML = detailHtml(building);
    const openPolicyTab = document.querySelector('[data-policy-tab].active')?.dataset.policyTab;
    if (openPolicyTab && !els.policyModal?.classList.contains('hidden')) renderPolicy(openPolicyTab);
  });

  document.querySelectorAll('[data-commute-school]').forEach(button => {
    button.addEventListener('click', () => setCommuteFilter({ school: button.dataset.commuteSchool, mode: state.commuteMode || 'walk', minutes: state.commuteMinutes || 15 }));
  });

  document.querySelectorAll('[data-commute-mode]').forEach(button => {
    button.addEventListener('click', () => setCommuteFilter({
      school: state.commuteSchool || state.activeSchool || 'columbia',
      mode: button.dataset.commuteMode,
      minutes: button.dataset.commuteMinutes,
    }));
  });

  document.querySelectorAll('[data-commute-clear]').forEach(button => {
    button.addEventListener('click', clearCommuteFilter);
  });

  els.compareDock?.addEventListener('click', event => {
    const removeButton = event.target.closest('[data-compare-remove]');
    if (removeButton) {
      removeCompareUnit(removeButton.dataset.compareRemove);
      return;
    }
    if (event.target.closest('[data-compare-clear]')) {
      state.compareUnitIds = [];
      renderCompareDock();
      return;
    }
    const openButton = event.target.closest('[data-open-unit]');
    if (openButton) {
      const record = findUnitRecord(openButton.dataset.openUnit);
      if (record) {
        if (state.selectedId !== record.building.id) selectBuilding(record.building.id);
        openUnitDetail(openButton.dataset.openUnit);
      }
      return;
    }
    const leadButton = event.target.closest('[data-open-lead]');
    if (leadButton) openLeadModal({ buildingId: leadButton.dataset.leadBuilding, unitId: leadButton.dataset.leadUnit });
  });

  els.compareDock?.addEventListener('pointerdown', event => {
    if (event.target.closest('.compareHeader')) beginCompareDockDrag(event);
  });

  els.leadForm?.addEventListener('submit', event => {
    event.preventDefault();
    saveLead(event.currentTarget);
  });

  document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', closeModals));
  document.querySelectorAll('.modalOverlay').forEach(modal => {
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModals();
    });
  });

  els.analyticsButton?.addEventListener('click', renderAnalyticsModal);
  els.policyButton?.addEventListener('click', () => {
    renderPolicy('disclaimer');
    els.policyModal?.classList.remove('hidden');
  });
  document.querySelectorAll('[data-policy-tab]').forEach(button => {
    button.addEventListener('click', () => renderPolicy(button.dataset.policyTab));
  });
  document.querySelector('[data-export-analytics]')?.addEventListener('click', () => downloadJson('ny-rental-analytics.json', storageRead('nyrm_analytics_events', [])));
  document.querySelector('[data-export-leads]')?.addEventListener('click', () => downloadJson('ny-rental-leads.json', storageRead('nyrm_leads', [])));

  document.querySelectorAll('[data-school]').forEach(button => {
    button.addEventListener('click', () => {
      const school = button.dataset.school;
      state.activeSchool = school === 'clear' ? '' : school;
      state.commuteSchool = state.activeSchool;
      if (!state.activeSchool) {
        state.commuteMode = '';
        state.commuteMinutes = 0;
        commuteLayer.clearLayers();
      }
      document.querySelectorAll('[data-school]').forEach(btn => btn.classList.toggle('active', btn === button && school !== 'clear'));
      document.querySelectorAll('[data-commute-school]').forEach(btn => btn.classList.toggle('active', btn.dataset.commuteSchool === state.activeSchool));
      if (!state.activeSchool) document.querySelectorAll('[data-commute-mode]').forEach(btn => btn.classList.remove('active'));
      track('school_filter', { school: state.activeSchool });
      applyFilters();
    });
  });

  document.querySelectorAll('[data-map-mode]').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-map-mode]').forEach(btn => btn.classList.toggle('active', btn === button));
      renderDefaultPoiLayer(button.dataset.mapMode);
    });
  });

  document.querySelectorAll('[data-nearby]').forEach(button => {
    button.addEventListener('click', () => handleNearby(button.dataset.nearby));
  });

  window.addEventListener('resize', debounce(() => map.invalidateSize(), 120));
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function openInitialRoute() {
  const params = new URLSearchParams(location.search);
  const buildingId = params.get('building');
  const unitId = params.get('unit');
  if (buildingId && state.buildingMap.has(buildingId)) {
    selectBuilding(buildingId, { fly: false });
    if (unitId) openUnitDetail(unitId);
    map.setView([state.buildingMap.get(buildingId).lat, state.buildingMap.get(buildingId).lng], 15);
  }
}

// -----------------------------
// Initialize
// -----------------------------
async function init() {
  try {
    const [buildingRows, unitRows, photoRows, communityPoiRows, googlePoiRows] = await Promise.all([
      loadCSV('buildings.csv'),
      loadCSV('units.csv'),
      loadCSV('photos.csv'),
      loadCSV('community_pois.csv'),
      loadCSV('building_google_nearby_pois_500m.csv'),
    ]);

    const poiRows = [...communityPoiRows, ...googlePoiRows];
    buildData(buildingRows, unitRows, photoRows, poiRows);
    populateFilters();
    applyStaticText();
    bindEvents();
    renderDefaultPoiLayer('building');
    applyFilters();
    renderCompareDock();
    openInitialRoute();
    track('page_view', { path: location.pathname, query: location.search });

    console.info('NY Rental Map loaded', {
      buildings: state.buildings.length,
      units: state.units.length,
      pois: state.pois.length,
    });
  } catch (error) {
    console.error(error);
    els.resultCount.textContent = 'Load failed';
    els.dataSummary.textContent = 'Check console';
    els.listingList.innerHTML = `
      <div class="listingCard">
        <strong>Could not load CSV files</strong>
        <div class="cardFooter"><span>${escapeHtml(error.message || String(error))}</span></div>
      </div>`;
    alert(`Could not load CSV files. Run this folder with:\npython -m http.server 5500\n\nError: ${error.message || error}`);
  }
}

init();
