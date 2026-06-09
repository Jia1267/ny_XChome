'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Languages, Maximize2, Minimize2, Phone, Scale, Share2, ShieldCheck, X } from 'lucide-react';
import { MapCanvas } from './MapCanvas';
import { compactMoney, distanceMeters, money } from '@/lib/format';
import type { AnalyticsEvent, Building, CommuteMode, Language, Lead, PoiType, RentalDataset, RentalUnit, SchoolId, TrustInfo, TrustStatus } from '@/lib/types';

type RentalAppProps = {
  dataset: RentalDataset;
};

type DetailStage = 'full' | 'half';

const copy = {
  en: {
    subtitle: 'Student-friendly apartment discovery',
    buildings: 'buildings',
    units: 'units',
    poisLoaded: 'nearby POIs loaded',
    mapView: 'Map view',
    building: 'Building',
    schools: 'Schools',
    life: 'Life',
    commuteTitle: 'School commute rings',
    clear: 'Clear',
    all: 'All',
    walk5: 'Walk 5m',
    walk15: 'Walk 15m',
    subway20: 'Subway 20m',
    subway40: 'Subway 40m',
    subway60: 'Subway 60m',
    overview: 'Building overview',
    trust: 'Listing confidence',
    lastUpdated: 'Last updated',
    source: 'Source',
    priceVerified: 'Price',
    feesVerified: 'Fees',
    availabilityVerified: 'Availability',
    availabilityChecked: 'Availability checked',
    contact: 'Contact',
    availableUnits: 'Available units',
    unitDetails: 'Unit details',
    compare: 'Compare',
    contactAgent: 'Contact agent',
    rentCalculator: 'Rent calculator',
    peopleSharing: 'People sharing',
    netEffective: 'Net effective',
    monthlyTotal: 'Monthly total',
    moveInTotal: 'Move-in total',
    feesPerPerson: 'Fees / person',
    primaryBedroom: 'Primary bedroom',
    secondBedroom: 'Second bedroom',
    thirdBedroom: 'Third bedroom',
    fourthBedroom: 'Fourth bedroom',
    livingRoom: 'Living room',
    wholeUnit: 'Whole unit',
    guarantorTitle: 'NY guarantor check',
    guarantorText: 'Many NYC rentals ask a renter or guarantor to show annual income around 35x monthly rent. If not, a third-party guarantor company may charge a non-refundable fee based on credit and application profile, generally not more than one month of rent. Confirm requirements with the agent or building.',
    nearby: 'Nearby',
    restaurants: 'Restaurants',
    grocery: 'Grocery',
    coffee: 'Coffee',
    subway: 'Subway',
    nearbyFacilities: 'Nearby facilities',
    noNearbyData: 'No nearby data loaded',
    walk: 'walk',
    analytics: 'Analytics',
    legal: 'Legal',
    share: 'Share',
    expand: 'Expand',
    close: 'Close',
    backToBuilding: 'Back to building',
    leadTitle: 'Ask availability',
    leadFine: 'By submitting, you agree to be contacted about this rental inquiry. Production leads are sent to the configured private Google Sheet.',
    name: 'Name',
    wechat: 'WeChat',
    school: 'School',
    budget: 'Budget',
    moveIn: 'Move-in date',
    interest: 'Interested unit',
    notes: 'Notes',
    submit: 'Submit inquiry',
    cancel: 'Cancel',
    analyticsTitle: 'Trial analytics dashboard',
    pageViews: 'Page views',
    buildingClicks: 'Building clicks',
    unitClicks: 'Unit clicks',
    shares: 'Share clicks',
    contacts: 'Contact clicks',
    conversion: 'Lead conversion',
    topSchools: 'Top schools',
    topBuildings: 'Top buildings',
    topBudgets: 'Top budgets',
    recentLeads: 'Recent leads',
    noData: 'No data yet',
    compareTitle: 'Compare units',
    selectSecond: 'Select one more unit to compare.',
    officialSite: 'Official site',
    availableNow: 'Available now',
    feesNote: 'Fees, concessions, guarantor requirements, and availability must be confirmed before applying.',
    verified: 'Verified',
    provided: 'Provided',
    needs_confirmation: 'Confirm',
    unknown: 'Unknown'
  },
  zh: {
    subtitle: '面向学生的纽约租房发现工具',
    buildings: '栋楼',
    units: '个户型',
    poisLoaded: '个周边设施',
    mapView: '地图',
    building: '楼盘',
    schools: '学校',
    life: '生活',
    commuteTitle: '学校通勤圈层',
    clear: '清除',
    all: '全部',
    walk5: '步行 5 分钟',
    walk15: '步行 15 分钟',
    subway20: '地铁 20 分钟',
    subway40: '地铁 40 分钟',
    subway60: '地铁 60 分钟',
    overview: '楼盘信息',
    trust: '房源可信度',
    lastUpdated: '最后更新',
    source: '数据来源',
    priceVerified: '价格',
    feesVerified: '费用',
    availabilityVerified: '可租状态',
    availabilityChecked: '可租确认时间',
    contact: '联系人',
    availableUnits: '可租户型',
    unitDetails: '户型详情',
    compare: '对比',
    contactAgent: '咨询中介',
    rentCalculator: '租金计算器',
    peopleSharing: '合住人数',
    netEffective: '净有效租金',
    monthlyTotal: '每月总计',
    moveInTotal: '入住预估',
    feesPerPerson: '每人一次性费用',
    primaryBedroom: '主卧',
    secondBedroom: '次卧',
    thirdBedroom: '第三卧室',
    fourthBedroom: '第四卧室',
    livingRoom: '客厅',
    wholeUnit: '整套',
    guarantorTitle: '纽约担保要求',
    guarantorText: '纽约很多公寓会要求租客或担保人的年收入达到月租约 35 倍。如果达不到，可能需要使用第三方担保公司并支付一次性不退还担保费，费用通常根据信用分和申请条件变化，一般不超过一个月租金。具体要求请和中介或楼盘确认。',
    nearby: '附近',
    restaurants: '餐厅',
    grocery: '超市',
    coffee: '咖啡',
    subway: '地铁',
    nearbyFacilities: '附近设施',
    noNearbyData: '暂无附近数据',
    walk: '步行',
    analytics: '数据',
    legal: '法律',
    share: '分享',
    expand: '放大',
    close: '关闭',
    backToBuilding: '返回楼盘',
    leadTitle: '咨询房源',
    leadFine: '提交后代表你同意就本次租房咨询被联系。试用版会保存在本地或配置的服务端存储中。',
    name: '姓名',
    wechat: '微信',
    school: '学校',
    budget: '预算',
    moveIn: '入住时间',
    interest: '感兴趣户型',
    notes: '备注',
    submit: '提交咨询',
    cancel: '取消',
    analyticsTitle: '试用版数据面板',
    pageViews: '访问量',
    buildingClicks: '楼盘点击',
    unitClicks: '户型点击',
    shares: '分享点击',
    contacts: '咨询点击',
    conversion: 'Lead 转化率',
    topSchools: '热门学校',
    topBuildings: '热门楼盘',
    topBudgets: '热门预算',
    recentLeads: '最新 leads',
    noData: '暂无数据',
    compareTitle: '户型对比',
    selectSecond: '再选择一个户型即可对比。',
    officialSite: '官网',
    availableNow: 'Available now',
    feesNote: '费用、优惠、担保要求和可租状态申请前必须再次确认。',
    verified: '已确认',
    provided: '已提供',
    needs_confirmation: '需确认',
    unknown: '未知'
  }
};

type CopyKey = keyof typeof copy.en;

const zhCopy: Record<CopyKey, string> = {
  subtitle: '面向学生的纽约租房发现工具',
  buildings: '栋楼',
  units: '个户型',
  poisLoaded: '个周边设施',
  mapView: '地图',
  building: '楼盘',
  schools: '学校',
  life: '生活',
  commuteTitle: '学校通勤圈层',
  clear: '清除',
  all: '全部',
  walk5: '步行 5 分钟',
  walk15: '步行 15 分钟',
  subway20: '地铁 20 分钟',
  subway40: '地铁 40 分钟',
  subway60: '地铁 60 分钟',
  overview: '楼盘信息',
  trust: '房源可信度',
  lastUpdated: '最后更新',
  source: '数据来源',
  priceVerified: '价格',
  feesVerified: '费用',
  availabilityVerified: '可租状态',
  availabilityChecked: '可租确认时间',
  contact: '联系人',
  availableUnits: '可租户型',
  unitDetails: '户型详情',
  compare: '对比',
  contactAgent: '咨询中介',
  rentCalculator: '租金计算器',
  peopleSharing: '合住人数',
  netEffective: '净有效租金',
  monthlyTotal: '每月总计',
  moveInTotal: '入住预估',
  feesPerPerson: '每人一次性费用',
  primaryBedroom: '主卧',
  secondBedroom: '次卧',
  thirdBedroom: '第三卧室',
  fourthBedroom: '第四卧室',
  livingRoom: '客厅',
  wholeUnit: '整套',
  guarantorTitle: '纽约担保要求',
  guarantorText: '纽约很多公寓会要求租客或担保人的年收入达到月租约 35 倍。如果达不到，可能需要使用第三方担保公司并支付一次性不退还担保费，费用通常根据信用分和申请条件变化，一般不超过一个月租金。具体要求请和中介或楼盘确认。',
  nearby: '附近',
  restaurants: '餐厅',
  grocery: '超市',
  coffee: '咖啡',
  subway: '地铁',
  nearbyFacilities: '附近设施',
  noNearbyData: '暂无附近数据',
  walk: '步行',
  analytics: '数据',
  legal: '法律',
  share: '分享',
  expand: '放大',
  close: '关闭',
  backToBuilding: '返回楼盘',
  leadTitle: '咨询房源',
  leadFine: '提交后代表你同意就本次租房咨询被联系。试用版会保存在本地或配置的服务端存储中。',
  name: '姓名',
  wechat: '微信',
  school: '学校',
  budget: '预算',
  moveIn: '入住时间',
  interest: '感兴趣户型',
  notes: '备注',
  submit: '提交咨询',
  cancel: '取消',
  analyticsTitle: '试用版数据面板',
  pageViews: '访问量',
  buildingClicks: '楼盘点击',
  unitClicks: '户型点击',
  shares: '分享点击',
  contacts: '咨询点击',
  conversion: 'Lead 转化率',
  topSchools: '热门学校',
  topBuildings: '热门楼盘',
  topBudgets: '热门预算',
  recentLeads: '最新 leads',
  noData: '暂无数据',
  compareTitle: '户型对比',
  selectSecond: '再选择一个户型即可对比。',
  officialSite: '官网',
  availableNow: 'Available now',
  feesNote: '费用、优惠、担保要求和可租状态在申请前必须再次确认。',
  verified: '已确认',
  provided: '已提供',
  needs_confirmation: '需确认',
  unknown: '未知'
};

Object.assign(copy.zh, zhCopy);

const commuteRadiusMeters: Record<CommuteMode, number> = {
  none: Infinity,
  walk5: 400,
  walk15: 1200,
  subway20: 6000,
  subway40: 13000,
  subway60: 20000
};

function statusLabel(status: TrustStatus, t: (key: CopyKey) => string) {
  return t(status);
}

function bedroomsLabel(unit: RentalUnit) {
  if (unit.beds <= 0) return 'Studio';
  return `${unit.beds} bed`;
}

function bathroomLabel(unit: RentalUnit) {
  return unit.baths ? `${unit.baths} bath` : 'Bath N/A';
}

function unitTitle(unit: RentalUnit) {
  return `${unit.floorPlan || bedroomsLabel(unit)}${unit.unitNumber ? ` #${unit.unitNumber}` : ''}`;
}

function roomLabels(unit: RentalUnit, people: number, t: (key: CopyKey) => string) {
  if (people === 1) return [t('wholeUnit')];
  const labels = [t('primaryBedroom'), t('secondBedroom'), t('thirdBedroom'), t('fourthBedroom')];
  const result: string[] = [];
  for (let index = 0; index < people; index += 1) {
    result.push(index >= unit.beds ? t('livingRoom') : labels[index] || `Bedroom ${index + 1}`);
  }
  return result;
}

function splitMonthly(total: number, people: number, step: number) {
  if (people <= 1) return [Math.round(total)];
  const differenceTotal = step * ((people * (people - 1)) / 2);
  const base = Math.max(0, (total - differenceTotal) / people);
  return Array.from({ length: people }, (_, index) => Math.round(base + (people - 1 - index) * step));
}

function countBy<T>(items: T[], keyFn: (item: T) => string | undefined) {
  const counts = new Map<string, number>();
  items.forEach(item => {
    const key = keyFn(item);
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function trustItems(trust: TrustInfo, t: (key: CopyKey) => string) {
  return [
    { label: t('lastUpdated'), value: trust.lastUpdated },
    { label: t('source'), value: trust.sourceName },
    { label: t('priceVerified'), value: statusLabel(trust.priceStatus, t) },
    { label: t('feesVerified'), value: statusLabel(trust.feeStatus, t) },
    { label: t('availabilityVerified'), value: statusLabel(trust.availabilityStatus, t) },
    { label: t('availabilityChecked'), value: trust.availabilityCheckedAt },
    { label: t('contact'), value: trust.contactName }
  ];
}

const nearbyTypeLabels = {
  restaurant: 'restaurants',
  grocery: 'grocery',
  coffee: 'coffee',
  subway: 'subway'
} as const satisfies Record<PoiType, CopyKey>;

function nearbyPoisFor(building: Building, type?: PoiType, limit = 6) {
  const typedPois = building.pois.filter(poi => (!type || poi.type === type) && poi.distanceMeters <= 520);
  const googlePois = typedPois.filter(poi => poi.source.toLowerCase().includes('google'));
  const preferred = googlePois.length ? googlePois : typedPois;
  const seen = new Set<string>();
  return preferred
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .filter(poi => {
      const key = `${poi.type}|${poi.name.toLowerCase().replace(/\s+/g, ' ').trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function defaultDetailStageForViewport(): DetailStage {
  if (isMobileViewport()) return 'half';
  return 'full';
}

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches;
}

export function RentalApp({ dataset }: RentalAppProps) {
  const [language, setLanguage] = useState<Language>('en');
  const [selectedSchoolId, setSelectedSchoolId] = useState<SchoolId>('all');
  const [commuteMode, setCommuteMode] = useState<CommuteMode>('none');
  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [activePoiType, setActivePoiType] = useState<PoiType | ''>('');
  const [mapMode, setMapMode] = useState<'map' | 'building' | 'schools' | 'life'>('building');
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [leadContext, setLeadContext] = useState<{ buildingId?: string; unitId?: string } | null>(null);
  const [detailStage, setDetailStage] = useState<DetailStage>('full');
  const [mobileModeOpen, setMobileModeOpen] = useState(false);
  const [mobileCommuteOpen, setMobileCommuteOpen] = useState(false);
  const [nearbyMenuOpen, setNearbyMenuOpen] = useState(false);
  const [buildingDetails, setBuildingDetails] = useState<Record<string, Building>>({});
  const [loadingBuildingId, setLoadingBuildingId] = useState('');
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);

  const t = useCallback((key: CopyKey) => copy[language][key], [language]);

  useEffect(() => {
    const storedEvents = localStorage.getItem('nyrm_v2_analytics_events');
    const storedLeads = localStorage.getItem('nyrm_v2_leads');
    if (storedEvents) setEvents(JSON.parse(storedEvents));
    if (storedLeads) setLeads(JSON.parse(storedLeads));
  }, []);

  const track = useCallback((type: string, payload: Partial<AnalyticsEvent> = {}) => {
    const event: AnalyticsEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      createdAt: new Date().toISOString(),
      ...payload
    };
    setEvents(current => {
      const next = [...current, event].slice(-3000);
      localStorage.setItem('nyrm_v2_analytics_events', JSON.stringify(next));
      return next;
    });
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    track('page_view', { source: 'home' });
  }, [track]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const buildingPathMatch = window.location.pathname.match(/^\/buildings\/([^/?#]+)/);
    const buildingId = params.get('building') || (buildingPathMatch ? decodeURIComponent(buildingPathMatch[1]) : '');
    const unitId = params.get('unit') || '';
    if (buildingId) setSelectedBuildingId(buildingId);
    if (unitId) setSelectedUnitId(unitId);
    if (buildingId || unitId) setDetailStage(defaultDetailStageForViewport());
  }, []);

  const loadedBuildings = useMemo(() => Object.values(buildingDetails), [buildingDetails]);
  const allBuildings = useMemo(() => {
    const byId = new Map(dataset.buildings.map(building => [building.id, building]));
    loadedBuildings.forEach(building => byId.set(building.id, building));
    return [...byId.values()];
  }, [dataset.buildings, loadedBuildings]);
  const allUnits = useMemo(() => {
    const byId = new Map(dataset.units.map(unit => [unit.id, unit]));
    loadedBuildings.flatMap(building => building.units).forEach(unit => byId.set(unit.id, unit));
    return [...byId.values()];
  }, [dataset.units, loadedBuildings]);

  const selectedBuilding = useMemo(
    () => buildingDetails[selectedBuildingId] || dataset.buildings.find(building => building.id === selectedBuildingId) || null,
    [buildingDetails, dataset.buildings, selectedBuildingId]
  );

  const selectedUnit = useMemo(() => {
    if (!selectedUnitId) return null;
    return allUnits.find(unit => unit.id === selectedUnitId) || null;
  }, [allUnits, selectedUnitId]);

  const filteredBuildings = useMemo(() => {
    if (selectedSchoolId === 'all' || commuteMode === 'none') return dataset.buildings;
    const school = dataset.schools.find(item => item.id === selectedSchoolId);
    if (!school) return dataset.buildings;
    const radius = commuteRadiusMeters[commuteMode];
    return dataset.buildings.filter(building => distanceMeters(school, building) <= radius);
  }, [dataset.buildings, dataset.schools, selectedSchoolId, commuteMode]);

  const loadBuildingDetail = useCallback(async (buildingId: string) => {
    if (!buildingId || buildingDetails[buildingId]) return;
    setLoadingBuildingId(buildingId);
    try {
      const response = await fetch(`/api/buildings/${encodeURIComponent(buildingId)}`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json() as { building?: Building };
      if (data.building) {
        setBuildingDetails(current => ({ ...current, [buildingId]: data.building as Building }));
      }
    } finally {
      setLoadingBuildingId(current => (current === buildingId ? '' : current));
    }
  }, [buildingDetails]);

  useEffect(() => {
    if (selectedBuildingId) {
      loadBuildingDetail(selectedBuildingId);
    }
  }, [loadBuildingDetail, selectedBuildingId]);

  const activePois = useMemo(() => {
    if (selectedBuilding && activePoiType) return nearbyPoisFor(selectedBuilding, activePoiType, 18);
    if (selectedBuilding && mapMode === 'life') return nearbyPoisFor(selectedBuilding, undefined, 28);
    if (mapMode === 'life') {
      const seen = new Set<string>();
      return dataset.pois
        .filter(poi => ['restaurant', 'grocery', 'coffee'].includes(poi.type))
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .filter(poi => {
          const key = `${poi.buildingId}|${poi.type}|${poi.name}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 120);
    }
    return [];
  }, [dataset.pois, selectedBuilding, activePoiType, mapMode]);

  const selectBuilding = useCallback((buildingId: string) => {
    setSelectedUnitId('');
    setSelectedBuildingId(current => {
      const next = current === buildingId ? '' : buildingId;
      if (next) {
        setDetailStage(defaultDetailStageForViewport());
        setActivePoiType('');
        setNearbyMenuOpen(false);
        track('building_click', { buildingId: next, schoolId: selectedSchoolId });
      } else {
        setDetailStage('full');
        setActivePoiType('');
        setNearbyMenuOpen(false);
      }
      return next;
    });
  }, [selectedSchoolId, track]);

  function openUnit(unitId: string) {
    const unit = allUnits.find(item => item.id === unitId);
    setSelectedUnitId(unitId);
    setDetailStage(defaultDetailStageForViewport());
    setNearbyMenuOpen(false);
    if (unit) {
      setSelectedBuildingId(unit.buildingId);
      track('unit_click', { buildingId: unit.buildingId, unitId });
    }
  }

  function openLead(context: { buildingId?: string; unitId?: string }) {
    setLeadContext(context);
    track('contact_click', context);
  }

  function addCompare(unitId: string) {
    setCompareIds(current => {
      if (current.includes(unitId)) return current;
      const next = [...current, unitId].slice(-2);
      return next;
    });
    const unit = allUnits.find(item => item.id === unitId);
    track('compare_add', { unitId, buildingId: unit?.buildingId });
  }

  async function shareCurrent() {
    const params = new URLSearchParams();
    if (selectedUnitId) params.set('unit', selectedUnitId);
    const path = selectedBuildingId ? `/buildings/${encodeURIComponent(selectedBuildingId)}` : window.location.pathname;
    const url = `${window.location.origin}${path}${params.toString() ? `?${params.toString()}` : ''}`;
    track('share_click', { buildingId: selectedBuildingId, unitId: selectedUnitId });
    if (navigator.share) {
      await navigator.share({ title: selectedUnit ? unitTitle(selectedUnit) : selectedBuilding?.name || 'NY Rental Map', url }).catch(() => undefined);
    } else {
      await navigator.clipboard?.writeText(url).catch(() => undefined);
    }
  }

  function changeSchool(schoolId: SchoolId) {
    setSelectedSchoolId(schoolId);
    track('school_filter_click', { schoolId });
  }

  function changeCommute(mode: CommuteMode) {
    setCommuteMode(mode);
    setMobileCommuteOpen(false);
    track('commute_filter_click', { schoolId: selectedSchoolId, metadata: { mode } });
  }

  function chooseNearbyType(type: PoiType | '') {
    setActivePoiType(type);
    setNearbyMenuOpen(false);
    setMobileModeOpen(false);
    if (type) {
      setMapMode('life');
      if (isMobileViewport()) setDetailStage('half');
      track('nearby_filter_click', { buildingId: selectedBuildingId, metadata: { type } });
    } else {
      setMapMode('building');
    }
  }

  function switchMapMode(mode: 'map' | 'building' | 'schools' | 'life') {
    setMapMode(mode);
    setMobileModeOpen(false);
    setNearbyMenuOpen(false);
    if (mode === 'map') {
      setCommuteMode('none');
      setActivePoiType('');
    }
    if (mode === 'building') {
      setActivePoiType('');
    }
    if (mode === 'schools' && commuteMode === 'none') {
      setCommuteMode('walk15');
    }
    if (mode === 'life' && selectedBuilding) {
      setActivePoiType('restaurant');
    }
    track('map_mode_click', { metadata: { mode } });
  }

  const showNearbyRadius = Boolean(selectedBuilding && (activePoiType || mapMode === 'life'));
  const showRailLayer = activePoiType === 'subway' || commuteMode.startsWith('subway');
  const detailHiddenByCompare = compareIds.length >= 2;
  const selectedSchool = dataset.schools.find(school => school.id === selectedSchoolId);
  const mapModeLabel = mapMode === 'map' ? t('mapView') : mapMode === 'building' ? t('building') : mapMode === 'schools' ? t('schools') : t('life');
  const commuteSummary = commuteMode === 'none'
    ? t('commuteTitle')
    : `${selectedSchool?.shortName || selectedSchool?.name || t('all')} - ${t(commuteMode)}`;

  return (
    <div className="appRoot">
      <header className="topbar">
        <div className="brand">
          <div className="brandMark">NY</div>
          <div>
            <h1>NY Rental Map</h1>
            <p>{dataset.summary.buildingCount} {t('buildings')} · {dataset.summary.unitCount} {t('units')} · {dataset.summary.poiCount} {t('poisLoaded')}</p>
          </div>
        </div>
        <nav className="topActions">
          <button type="button" onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}><Languages size={18} />{language === 'en' ? '中文' : 'EN'}</button>
          <Link href="/legal"><ShieldCheck size={18} />{t('legal')}</Link>
        </nav>
      </header>

      <main className={`mapShell ${selectedBuilding ? `detailStage-${detailStage}` : ''} ${mobileModeOpen ? 'mobileModeOpen' : ''} ${mobileCommuteOpen ? 'mobileCommuteOpen' : ''}`}>
        <MapCanvas
          buildings={filteredBuildings}
          selectedBuildingId={selectedBuildingId}
          selectedSchoolId={selectedSchoolId}
          commuteMode={commuteMode}
          schools={dataset.schools}
          pois={activePois}
          showSchoolMarkers={mapMode === 'schools' || commuteMode !== 'none'}
          showNearbyRadius={showNearbyRadius}
          showRailLayer={showRailLayer}
          onSelectBuilding={selectBuilding}
        />

        <section className={`floatingControls modeTabs ${selectedBuilding ? 'withNearby' : ''} ${mobileModeOpen ? 'mobileOpen' : 'mobileCollapsed'} ${nearbyMenuOpen ? 'nearbyOpen' : ''}`}>
          <button
            className="mobilePanelToggle"
            type="button"
            aria-expanded={selectedBuilding ? nearbyMenuOpen : mobileModeOpen}
            onClick={() => {
              setMobileCommuteOpen(false);
              if (selectedBuilding) {
                setMobileModeOpen(value => {
                  const next = !value;
                  setNearbyMenuOpen(next);
                  return next;
                });
              } else {
                setMobileModeOpen(value => !value);
              }
            }}
          >
            <span>{t('mapView')}</span>
            <strong>{selectedBuilding ? t('nearby') : mapModeLabel}</strong>
          </button>
          <div className="modeButtonRow">
            <button className={mapMode === 'map' ? 'active' : 'ghost'} type="button" onClick={() => switchMapMode('map')}>{t('mapView')}</button>
            <button className={mapMode === 'building' ? 'active' : ''} type="button" onClick={() => switchMapMode('building')}>{t('building')}</button>
            <button className={mapMode === 'schools' ? 'active' : ''} type="button" onClick={() => switchMapMode('schools')}>{t('schools')}</button>
            <button className={mapMode === 'life' ? 'active' : ''} type="button" onClick={() => switchMapMode('life')}>{t('life')}</button>
          </div>
          {selectedBuilding && nearbyMenuOpen && (
            <div className="nearbyMenu">
              {(['grocery', 'restaurant', 'coffee', 'subway'] as PoiType[]).map(type => (
                <button key={type} className={activePoiType === type ? 'active' : ''} type="button" onClick={() => chooseNearbyType(type)}>
                  {type === 'restaurant' ? t('restaurants') : type === 'grocery' ? t('grocery') : type === 'coffee' ? t('coffee') : t('subway')}
                </button>
              ))}
              <button type="button" onClick={() => chooseNearbyType('')}>{t('clear')}</button>
            </div>
          )}
        </section>

        {!selectedBuilding && <section className={`floatingControls commutePanel ${mobileCommuteOpen ? 'mobileOpen' : 'mobileCollapsed'}`}>
          <button className="mobilePanelToggle" type="button" aria-expanded={mobileCommuteOpen} onClick={() => { setMobileCommuteOpen(value => !value); setMobileModeOpen(false); }}>
            <span>{t('schools')}</span>
            <strong>{commuteSummary}</strong>
          </button>
          <div className="commutePanelBody">
            <div className="panelHeader">
              <strong>{t('commuteTitle')}</strong>
              <button type="button" onClick={() => { setCommuteMode('none'); setSelectedSchoolId('all'); }}>{t('clear')}</button>
            </div>
            <div className="schoolChipRow">
              {[{ id: 'all', label: t('all') }, { id: 'columbia', label: 'Columbia' }, { id: 'nyu', label: 'NYU' }, { id: 'baruch', label: 'Baruch' }, { id: 'pratt', label: 'Pratt' }].map(item => (
                <button key={item.id} className={selectedSchoolId === item.id ? 'active' : ''} type="button" onClick={() => changeSchool(item.id as SchoolId)}>
                  {item.label}
                </button>
              ))}
            </div>
            <div className="chipGrid">
              {(['walk5', 'walk15', 'subway20', 'subway40', 'subway60'] as Exclude<CommuteMode, 'none'>[]).map(mode => (
                <button key={mode} className={commuteMode === mode ? 'active' : ''} type="button" onClick={() => changeCommute(mode)}>
                  {t(mode)}
                </button>
              ))}
            </div>
          </div>
        </section>}

        {selectedBuilding && (
          <section className="nearbyDock desktopNearbyDock" aria-label="Nearby tools">
            <div>
              <span>{t('nearby')}</span>
              <strong>{selectedBuilding.name}</strong>
            </div>
            {(['restaurant', 'grocery', 'coffee', 'subway'] as PoiType[]).map(type => (
              <button key={type} className={activePoiType === type ? 'active' : ''} type="button" onClick={() => chooseNearbyType(type)}>
                {type === 'restaurant' ? t('restaurants') : type === 'grocery' ? t('grocery') : type === 'coffee' ? t('coffee') : t('subway')}
              </button>
            ))}
            <button type="button" onClick={() => chooseNearbyType('')}>{t('clear')}</button>
          </section>
        )}

        {(mapMode === 'schools' || mapMode === 'life' || commuteMode !== 'none' || activePoiType) && (
          <MapLegend t={t} />
        )}

        {selectedBuilding && !detailHiddenByCompare && (
          <DetailPanel
            building={selectedBuilding}
            unit={selectedUnit}
            language={language}
            stage={detailStage}
            loading={loadingBuildingId === selectedBuilding.id}
            t={t}
            onClose={() => { setSelectedBuildingId(''); setSelectedUnitId(''); setDetailStage('full'); setNearbyMenuOpen(false); }}
            onBack={() => setSelectedUnitId('')}
            onStageChange={setDetailStage}
            onShare={shareCurrent}
            onOpenUnit={openUnit}
            onCompare={addCompare}
            onLead={openLead}
          />
        )}

        {!!compareIds.length && (
          <CompareDock
            units={compareIds.map(id => allUnits.find(unit => unit.id === id)).filter((unit): unit is RentalUnit => Boolean(unit))}
            buildings={allBuildings}
            language={language}
            t={t}
            onRemove={unitId => setCompareIds(ids => ids.filter(id => id !== unitId))}
            onClear={() => setCompareIds([])}
            onLead={openLead}
          />
        )}

        {selectedBuilding && !detailHiddenByCompare && (
          <div className="mobileContactBar">
            <div>
              <span>{selectedUnit ? unitTitle(selectedUnit) : selectedBuilding.name}</span>
              <strong>{money(selectedUnit?.grossRent || selectedBuilding.startingRent)}</strong>
            </div>
            <button type="button" onClick={() => openLead({ buildingId: selectedBuilding.id, unitId: selectedUnit?.id })}><Phone size={18} />{t('contactAgent')}</button>
          </div>
        )}
      </main>

      {leadContext && (
        <LeadModal
          building={selectedBuilding || allBuildings.find(item => item.id === leadContext.buildingId) || null}
          unit={selectedUnit || allUnits.find(item => item.id === leadContext.unitId) || null}
          context={leadContext}
          t={t}
          onCancel={() => setLeadContext(null)}
          onSaved={lead => {
            setLeads(current => {
              const next = [...current, lead];
              localStorage.setItem('nyrm_v2_leads', JSON.stringify(next));
              return next;
            });
            track('lead_submit', { buildingId: lead.buildingId, unitId: lead.unitId, schoolId: lead.school as SchoolId, budget: lead.budget });
            setLeadContext(null);
          }}
        />
      )}

    </div>
  );
}

function DetailPanel({
  building,
  unit,
  language,
  stage,
  loading,
  t,
  onClose,
  onBack,
  onStageChange,
  onShare,
  onOpenUnit,
  onCompare,
  onLead
}: {
  building: Building;
  unit: RentalUnit | null;
  language: Language;
  stage: DetailStage;
  loading: boolean;
  t: (key: CopyKey) => string;
  onClose: () => void;
  onBack: () => void;
  onStageChange: (stage: DetailStage) => void;
  onShare: () => void;
  onOpenUnit: (unitId: string) => void;
  onCompare: (unitId: string) => void;
  onLead: (context: { buildingId?: string; unitId?: string }) => void;
}) {
  const heroUrl = unit?.photos.find(photo => photo.type.includes('floor'))?.url
    || building.primaryPhotoUrl
    || building.photos[0]?.url;
  const nextStage: DetailStage = stage === 'half' ? 'full' : 'half';

  return (
    <aside className={`detailPanel stage-${stage}`}>
      <div className="panelToolbar">
        {unit && <button type="button" onClick={onBack}><ArrowLeft size={18} />{t('backToBuilding')}</button>}
        <div className="panelActions">
          <button className="panelExpandButton" type="button" aria-label={stage === 'half' ? t('expand') : 'Collapse'} onClick={() => onStageChange(nextStage)}>
            {stage === 'half' ? <Maximize2 size={18} /> : <Minimize2 size={18} />}
          </button>
          <button type="button" aria-label={t('share')} onClick={onShare}><Share2 size={18} /></button>
          <button type="button" aria-label={t('close')} onClick={onClose}><X size={18} /></button>
        </div>
      </div>

      {heroUrl && (
        <div className="heroImage">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroUrl} alt={unit ? unitTitle(unit) : building.name} loading="lazy" />
        </div>
      )}

      {unit ? (
        <UnitDetail building={building} unit={unit} language={language} t={t} onCompare={onCompare} onLead={onLead} />
      ) : (
        <BuildingDetail building={building} loading={loading} t={t} onOpenUnit={onOpenUnit} onCompare={onCompare} onLead={onLead} />
      )}
    </aside>
  );
}

function TrustGrid({ trust, t }: { trust: TrustInfo; t: (key: CopyKey) => string }) {
  return (
    <section className="trustGrid" aria-label="Listing confidence">
      {trustItems(trust, t).map(item => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value || t('unknown')}</strong>
        </div>
      ))}
    </section>
  );
}

function MapLegend({ t }: { t: (key: CopyKey) => string }) {
  const rows = [
    { className: 'building', label: t('building'), text: 'B' },
    { className: 'school', label: t('schools'), text: 'CU' },
    { className: 'restaurant', label: t('restaurants'), text: 'R' },
    { className: 'grocery', label: t('grocery'), text: 'G' },
    { className: 'coffee', label: t('coffee'), text: 'C' },
    { className: 'subway', label: t('subway'), text: 'M' }
  ];

  return (
    <section className="mapLegend" aria-label="Map legend">
      {rows.map(row => (
        <div key={row.className}>
          <span className={`legendDot ${row.className}`}>{row.text}</span>
          <strong>{row.label}</strong>
        </div>
      ))}
    </section>
  );
}

function BuildingDetail({ building, loading, t, onOpenUnit, onCompare, onLead }: {
  building: Building;
  loading: boolean;
  t: (key: CopyKey) => string;
  onOpenUnit: (unitId: string) => void;
  onCompare: (unitId: string) => void;
  onLead: (context: { buildingId?: string; unitId?: string }) => void;
}) {
  return (
    <div className="detailContent">
      <section className="buildingHero">
        <div>
          <p className="eyebrow">{t('overview')}</p>
          <h2>{building.name}</h2>
          <p>{building.address}</p>
          <p>{[building.neighborhood, building.cityArea].filter(Boolean).join(' · ')}</p>
        </div>
        <strong>{compactMoney(building.startingRent)}+</strong>
      </section>

      <h3>{t('trust')}</h3>
      <TrustGrid trust={building.trust} t={t} />

      <section className="factGrid">
        <div><span>Rent range</span><strong>{building.rentRange}</strong></div>
        <div><span>Lease</span><strong>{building.leaseTermDefault || 'Ask agent'}</strong></div>
        <div><span>Utilities</span><strong>{building.utilitiesPolicy || 'Ask agent'}</strong></div>
        <div><span>Availability</span><strong>{t('availableNow')}</strong></div>
      </section>

      {building.description && <p className="description">{building.description}</p>}

      <section>
        <h3>Amenities and policies</h3>
        <div className="tagList">
          {building.amenities.slice(0, 14).map(item => <span key={item}>{item}</span>)}
          {building.petPolicy && <span>{building.petPolicy}</span>}
          {building.securityFeatures && <span>{building.securityFeatures}</span>}
        </div>
      </section>

      <NearbyFacilities building={building} t={t} />

      <section>
        <h3>{t('availableUnits')}</h3>
        <div className="unitList">
          {loading && !building.units.length && (
            <article className="unitCard loading">
              <div>
                <strong>Loading details...</strong>
                <p>Units, photos, and nearby POIs are loading on demand.</p>
              </div>
            </article>
          )}
          {!loading && !building.units.length && (
            <article className="unitCard loading">
              <div>
                <strong>No units loaded</strong>
                <p>Try again in a moment.</p>
              </div>
            </article>
          )}
          {building.units.map(unit => (
            <article key={unit.id} className="unitCard" onClick={() => onOpenUnit(unit.id)}>
              <div>
                <strong>{unitTitle(unit)}</strong>
                <p>{bedroomsLabel(unit)} · {bathroomLabel(unit)} · {t('availableNow')}</p>
              </div>
              <div className="unitCardActions">
                <span>{money(unit.grossRent)}</span>
                <button type="button" onClick={event => { event.stopPropagation(); onCompare(unit.id); }}>
                  <Scale size={15} />{t('compare')}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="actionRow">
        {building.availabilityUrl && <a className="primaryButton" href={building.availabilityUrl} target="_blank" rel="noreferrer">{t('officialSite')} <ExternalLink size={16} /></a>}
        <button className="secondaryButton" type="button" onClick={() => onLead({ buildingId: building.id })}>{t('contactAgent')}</button>
      </div>
    </div>
  );
}

function UnitDetail({ building, unit, language, t, onCompare, onLead }: {
  building: Building;
  unit: RentalUnit;
  language: Language;
  t: (key: CopyKey) => string;
  onCompare: (unitId: string) => void;
  onLead: (context: { buildingId?: string; unitId?: string }) => void;
}) {
  const floorPlan = unit.photos.find(photo => photo.type.includes('floor'))?.url;
  return (
    <div className="detailContent">
      <section className="buildingHero unitHero">
        <div>
          <p className="eyebrow">{t('availableNow')}</p>
          <h2>{unitTitle(unit)}</h2>
          <p>{building.name}</p>
          <p>{building.address}</p>
        </div>
        <strong>{money(unit.grossRent)}</strong>
      </section>

      <h3>{t('trust')}</h3>
      <TrustGrid trust={unit.trust} t={t} />

      {floorPlan && (
        <section>
          <h3>Floor plan</h3>
          <div className="floorPlanBox">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={floorPlan} alt={`${unitTitle(unit)} floor plan`} loading="lazy" />
          </div>
        </section>
      )}

      <section className="factGrid">
        <div><span>Gross rent</span><strong>{money(unit.grossRent)}</strong></div>
        <div><span>Net effective</span><strong>{money(unit.netEffectiveRent)}</strong></div>
        <div><span>Bedrooms</span><strong>{bedroomsLabel(unit)}</strong></div>
        <div><span>Bathrooms</span><strong>{bathroomLabel(unit)}</strong></div>
        <div><span>Lease</span><strong>{unit.leaseTerm || building.leaseTermDefault || 'Ask agent'}</strong></div>
        <div><span>Available</span><strong>{t('availableNow')}</strong></div>
      </section>

      <RentCalculator unit={unit} language={language} t={t} />

      <p className="notice">{t('feesNote')}</p>

      <NearbyFacilities building={building} t={t} compact />

      <div className="actionRow">
        <button className="secondaryButton" type="button" onClick={() => onCompare(unit.id)}><Scale size={16} />{t('compare')}</button>
        <button className="primaryButton" type="button" onClick={() => onLead({ buildingId: building.id, unitId: unit.id })}><Phone size={16} />{t('contactAgent')}</button>
      </div>
    </div>
  );
}

function NearbyFacilities({ building, t, compact = false }: { building: Building; t: (key: CopyKey) => string; compact?: boolean }) {
  const types: PoiType[] = ['subway', 'grocery', 'coffee', 'restaurant'];
  return (
    <section className={`nearbySection ${compact ? 'compact' : ''}`}>
      <h3>{t('nearbyFacilities')}</h3>
      <div className="nearbyColumns">
        {types.map(type => {
          const rows = nearbyPoisFor(building, type, compact ? 3 : 4);
          return (
            <article key={type} className="nearbyColumn">
              <div className="nearbyColumnTitle">
                <span className={`poiDot ${type}`}>{type === 'subway' ? 'M' : type === 'restaurant' ? 'R' : type === 'grocery' ? 'G' : 'C'}</span>
                <strong>{t(nearbyTypeLabels[type])}</strong>
              </div>
              {rows.length ? rows.map(poi => (
                <div className="nearbyRow" key={poi.id}>
                  <strong>{poi.name}</strong>
                  <span>{Math.round(poi.distanceMeters)}m</span>
                </div>
              )) : (
                <div className="nearbyRow empty">
                  <strong>{t('noNearbyData')}</strong>
                  <span>500m</span>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function RentCalculator({ unit, language, t }: { unit: RentalUnit; language: Language; t: (key: CopyKey) => string }) {
  const [people, setPeople] = useState(unit.defaultPeople || unit.maxPeople);
  const [freeMonths, setFreeMonths] = useState(0);
  const [utilities, setUtilities] = useState(unit.utilitiesEstimateMonthly || 180);
  const leaseMonths = Number.parseInt(unit.leaseTerm, 10) || 12;
  const gross = unit.grossRent;
  const paidMonths = Math.max(0, leaseMonths - freeMonths);
  const netEffective = Math.round((gross * paidMonths) / leaseMonths);
  const monthlyTotal = netEffective + utilities;
  const deposit = unit.securityDepositAmount ?? gross;
  const broker = unit.brokerFeeAmount ?? 0;
  const fees = unit.amenityFeeAmount ?? 0;
  const moveInTotal = monthlyTotal + deposit + broker + fees;
  const split = splitMonthly(monthlyTotal, people, unit.rentStepDifference || 200);
  const labels = roomLabels(unit, people, t);
  const oneTimePerPerson = Math.round((deposit + broker + fees) / people);
  const guarantorIncome = gross * 35;

  return (
    <section className="calculator">
      <div className="sectionHeader">
        <h3>{t('rentCalculator')}</h3>
        <label>
          {t('peopleSharing')}
          <select value={people} onChange={event => setPeople(Number(event.target.value))}>
            {Array.from({ length: unit.maxPeople }, (_, index) => index + 1).map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="calcInputs">
        <label>
          Free months
          <input type="number" min={0} max={leaseMonths} value={freeMonths} onChange={event => setFreeMonths(Number(event.target.value))} />
        </label>
        <label>
          Utilities / month
          <input type="number" min={0} value={utilities} onChange={event => setUtilities(Number(event.target.value))} />
        </label>
      </div>
      <div className="calcSummary">
        <div><span>{t('netEffective')}</span><strong>{money(netEffective)}/mo</strong></div>
        <div><span>{t('monthlyTotal')}</span><strong>{money(monthlyTotal)}/mo</strong></div>
        <div><span>{t('moveInTotal')}</span><strong>{money(moveInTotal)}</strong></div>
        <div><span>{t('feesPerPerson')}</span><strong>{money(oneTimePerPerson)}</strong></div>
      </div>
      <div className="splitBox">
        <div className="splitHeader">
          <strong>{people}-person shared plan</strong>
          <span>{language === 'zh' ? '每级差 $200' : '$200 step-down rule'}</span>
        </div>
        <div className="roomGrid">
          {split.map((amount, index) => (
            <div key={`${labels[index]}-${index}`}>
              <span>{labels[index]}</span>
              <strong>{money(amount)}/mo</strong>
              <small>Move-in est. {money(amount + oneTimePerPerson)}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="guarantorNote">
        <strong>{t('guarantorTitle')}: {money(guarantorIncome)} income target</strong>
        <p>{t('guarantorText')}</p>
      </div>
    </section>
  );
}

function CompareDock({ units, buildings, language, t, onRemove, onClear, onLead }: {
  units: RentalUnit[];
  buildings: Building[];
  language: Language;
  t: (key: CopyKey) => string;
  onRemove: (unitId: string) => void;
  onClear: () => void;
  onLead: (context: { buildingId?: string; unitId?: string }) => void;
}) {
  const expanded = units.length >= 2;
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const [mobilePosition, setMobilePosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (expanded) setMobilePosition(null);
  }, [expanded]);

  const compactStyle: CSSProperties | undefined = !expanded && mobilePosition
    ? { left: mobilePosition.x, top: mobilePosition.y, right: 'auto', bottom: 'auto' }
    : undefined;

  function startMobileDrag(event: ReactPointerEvent<HTMLElement>) {
    if (expanded || typeof window === 'undefined' || !window.matchMedia('(max-width: 760px)').matches) return;
    if ((event.target as HTMLElement).closest('button')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveMobileDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || typeof window === 'undefined') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX - drag.offsetX, 8), window.innerWidth - rect.width - 8);
    const y = Math.min(Math.max(event.clientY - drag.offsetY, 84), window.innerHeight - rect.height - 12);
    setMobilePosition({ x, y });
  }

  function endMobileDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <aside
      className={`compareDock ${expanded ? 'expanded' : 'compact'}`}
      style={compactStyle}
      onPointerDown={startMobileDrag}
      onPointerMove={moveMobileDrag}
      onPointerUp={endMobileDrag}
      onPointerCancel={endMobileDrag}
    >
      <header className="compareHeader">
        <div>
          <span>{t('compareTitle')}</span>
          <strong>{units.length}/2</strong>
        </div>
        <button className="compareClearButton" type="button" onClick={onClear}>{t('clear')}</button>
      </header>
      <div className={expanded ? 'compareFullGrid' : 'compareMiniGrid'}>
        {units.map(unit => {
          const building = buildings.find(item => item.id === unit.buildingId);
          if (!building) return null;
          return expanded ? (
            <CompareFullCard
              key={unit.id}
              building={building}
              unit={unit}
              language={language}
              t={t}
              onRemove={onRemove}
              onLead={onLead}
            />
          ) : (
            <CompareMiniCard
              key={unit.id}
              building={building}
              unit={unit}
              t={t}
              onRemove={onRemove}
              onLead={onLead}
            />
          );
        })}
      </div>
    </aside>
  );
}

function CompareMiniCard({ building, unit, t, onRemove, onLead }: {
  building: Building;
  unit: RentalUnit;
  t: (key: CopyKey) => string;
  onRemove: (unitId: string) => void;
  onLead: (context: { buildingId?: string; unitId?: string }) => void;
}) {
  return (
    <article className="compareMiniCard">
      <button className="compareRemoveButton mini" type="button" aria-label={t('close')} onClick={() => onRemove(unit.id)}><X size={16} /></button>
      <span>{building.name}</span>
      <h3>{unitTitle(unit)}</h3>
      <strong>{money(unit.grossRent)}/mo</strong>
      <div className="compareMiniMeta">
        <div><span>Bed / bath</span><strong>{bedroomsLabel(unit)} / {bathroomLabel(unit)}</strong></div>
        <div><span>Lease</span><strong>{unit.leaseTerm || 'Ask'}</strong></div>
        <div><span>Updated</span><strong>{unit.trust.lastUpdated}</strong></div>
        <div><span>Fees</span><strong>{statusLabel(unit.trust.feeStatus, t)}</strong></div>
      </div>
      <button className="primaryButton" type="button" onClick={() => onLead({ buildingId: unit.buildingId, unitId: unit.id })}>{t('contactAgent')}</button>
    </article>
  );
}

function CompareFullCard({ building, unit, language, t, onRemove, onLead }: {
  building: Building;
  unit: RentalUnit;
  language: Language;
  t: (key: CopyKey) => string;
  onRemove: (unitId: string) => void;
  onLead: (context: { buildingId?: string; unitId?: string }) => void;
}) {
  const floorPlan = unit.photos.find(photo => photo.type.includes('floor'))?.url;

  return (
    <article className="compareFullCard">
      <button className="compareRemoveButton" type="button" aria-label={t('close')} onClick={() => onRemove(unit.id)}><X size={16} /></button>
      <section className="buildingHero unitHero compareHero">
        <div>
          <p className="eyebrow">{t('availableNow')}</p>
          <h2>{unitTitle(unit)}</h2>
          <p>{building.name}</p>
          <p>{building.address}</p>
        </div>
        <strong>{money(unit.grossRent)}</strong>
      </section>

      <h3>{t('trust')}</h3>
      <TrustGrid trust={unit.trust} t={t} />

      {floorPlan && (
        <section>
          <h3>Floor plan</h3>
          <div className="floorPlanBox">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={floorPlan} alt={`${unitTitle(unit)} floor plan`} loading="lazy" />
          </div>
        </section>
      )}

      <section className="factGrid">
        <div><span>Gross rent</span><strong>{money(unit.grossRent)}</strong></div>
        <div><span>Net effective</span><strong>{money(unit.netEffectiveRent)}</strong></div>
        <div><span>Bedrooms</span><strong>{bedroomsLabel(unit)}</strong></div>
        <div><span>Bathrooms</span><strong>{bathroomLabel(unit)}</strong></div>
        <div><span>Lease</span><strong>{unit.leaseTerm || building.leaseTermDefault || 'Ask agent'}</strong></div>
        <div><span>Available</span><strong>{t('availableNow')}</strong></div>
      </section>

      <RentCalculator unit={unit} language={language} t={t} />
      <p className="notice">{t('feesNote')}</p>
      <NearbyFacilities building={building} t={t} compact />
      <button className="primaryButton" type="button" onClick={() => onLead({ buildingId: building.id, unitId: unit.id })}>{t('contactAgent')}</button>
    </article>
  );
}

function LeadModal({ building, unit, context, t, onCancel, onSaved }: {
  building: Building | null;
  unit: RentalUnit | null;
  context: { buildingId?: string; unitId?: string };
  t: (key: CopyKey) => string;
  onCancel: () => void;
  onSaved: (lead: Lead) => void;
}) {
  async function submit(formData: FormData) {
    const lead: Lead = {
      id: `lead_${Date.now()}`,
      createdAt: new Date().toISOString(),
      name: String(formData.get('name') || ''),
      wechat: String(formData.get('wechat') || ''),
      school: String(formData.get('school') || ''),
      budget: String(formData.get('budget') || ''),
      moveInDate: String(formData.get('moveInDate') || ''),
      interestedUnit: String(formData.get('interestedUnit') || ''),
      notes: String(formData.get('notes') || ''),
      buildingId: context.buildingId,
      unitId: context.unitId,
      source: 'trial_site'
    };
    await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead)
    }).catch(() => undefined);
    onSaved(lead);
  }

  return (
    <div className="modalBackdrop">
      <form
        className="leadModal"
        onSubmit={event => {
          event.preventDefault();
          submit(new FormData(event.currentTarget));
        }}
      >
        <button className="modalClose" type="button" onClick={onCancel}><X size={18} /></button>
        <p className="eyebrow">{building?.name}</p>
        <h2>{t('leadTitle')}</h2>
        <p>{unit ? unitTitle(unit) : building?.address}</p>
        <div className="formGrid">
          <label>{t('name')}<input name="name" required /></label>
          <label>{t('wechat')}<input name="wechat" required /></label>
          <label>{t('school')}<input name="school" /></label>
          <label>{t('budget')}<input name="budget" placeholder="$3,500 - $4,500" /></label>
          <label>{t('moveIn')}<input name="moveInDate" type="date" /></label>
          <label>{t('interest')}<input name="interestedUnit" defaultValue={unit ? unitTitle(unit) : building?.name} /></label>
          <label className="wide">{t('notes')}<textarea name="notes" rows={3} /></label>
        </div>
        <p className="finePrint">{t('leadFine')}</p>
        <div className="actionRow">
          <button className="secondaryButton" type="button" onClick={onCancel}>{t('cancel')}</button>
          <button className="primaryButton" type="submit">{t('submit')}</button>
        </div>
      </form>
    </div>
  );
}

function AnalyticsPanel({ dataset, events, leads, t, onClose }: {
  dataset: RentalDataset;
  events: AnalyticsEvent[];
  leads: Lead[];
  t: (key: CopyKey) => string;
  onClose: () => void;
}) {
  const counts = {
    page: events.filter(event => event.type === 'page_view').length,
    building: events.filter(event => event.type === 'building_click').length,
    unit: events.filter(event => event.type === 'unit_click').length,
    share: events.filter(event => event.type === 'share_click').length,
    contact: events.filter(event => event.type === 'contact_click').length
  };
  const conversion = counts.page ? Math.round((leads.length / counts.page) * 1000) / 10 : 0;
  const topSchools = countBy(events, event => event.schoolId);
  const topBuildings = countBy(events, event => event.buildingId).map(([id, count]) => [dataset.buildings.find(item => item.id === id)?.name || id, count] as [string, number]);
  const topBudgets = countBy(leads, lead => lead.budget);

  return (
    <div className="modalBackdrop">
      <section className="analyticsPanel">
        <button className="modalClose" type="button" onClick={onClose}><X size={18} /></button>
        <p className="eyebrow">Operator view</p>
        <h2>{t('analyticsTitle')}</h2>
        <div className="analyticsGrid">
          <div><span>{t('pageViews')}</span><strong>{counts.page}</strong></div>
          <div><span>{t('buildingClicks')}</span><strong>{counts.building}</strong></div>
          <div><span>{t('unitClicks')}</span><strong>{counts.unit}</strong></div>
          <div><span>{t('shares')}</span><strong>{counts.share}</strong></div>
          <div><span>{t('contacts')}</span><strong>{counts.contact}</strong></div>
          <div><span>{t('conversion')}</span><strong>{conversion}%</strong></div>
        </div>
        <div className="analyticsLists">
          <MetricList title={t('topSchools')} rows={topSchools} empty={t('noData')} />
          <MetricList title={t('topBuildings')} rows={topBuildings} empty={t('noData')} />
          <MetricList title={t('topBudgets')} rows={topBudgets} empty={t('noData')} />
          <div>
            <h3>{t('recentLeads')}</h3>
            {leads.slice(-5).reverse().map(lead => (
              <p key={lead.id}><strong>{lead.name}</strong><span>{lead.wechat} · {lead.school || lead.budget}</span></p>
            ))}
            {!leads.length && <p>{t('noData')}</p>}
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricList({ title, rows, empty }: { title: string; rows: [string, number][]; empty: string }) {
  return (
    <div>
      <h3>{title}</h3>
      {rows.slice(0, 6).map(([label, count]) => (
        <p key={label}><strong>{label}</strong><span>{count}</span></p>
      ))}
      {!rows.length && <p>{empty}</p>}
    </div>
  );
}
