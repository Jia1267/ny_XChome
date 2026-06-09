'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { Language } from '@/lib/types';
import {
  budgetMidpoint,
  getMatchingFloorPlans,
  groupResultsByBuilding,
  sortBuildingGroups,
  type BuildingInput,
  type SortKey
} from '@/lib/filter-floorplans';
import { MatchingResultsPanel } from './MatchingResultsPanel';
import { useEscapeKey } from './useDialog';

const BEDROOM_RANGE = 2;

const copy = {
  en: {
    title: 'Advanced filter',
    subtitle: 'Find floor plans that fit your per-person budget after sharing. Scope follows the school commute rings.',
    minBudget: 'Min budget',
    maxBudget: 'Max budget',
    bedrooms: 'Bedrooms',
    bedroom: 'bedroom',
    sort: 'Sort by',
    sortRecommended: 'Recommended',
    sortPriceAsc: 'Price: low to high',
    sortPriceDesc: 'Price: high to low',
    sortDistanceAsc: 'Distance: near to far',
    sortDistanceDesc: 'Distance: far to near',
    loading: 'Loading floor plans...',
    enterBudget: 'Enter a budget range to see matching options.',
    showing: (n: number) => `Showing ${n} matching ${n === 1 ? 'option' : 'options'}`,
    matchedTitle: 'Buildings that fit your budget',
    none: 'No matching floor plans found.',
    noneHint: 'Try increasing your budget, choosing a larger sharing group, or widening the commute rings.',
    error: 'Could not load floor plans. Please try again.',
    close: 'Close'
  },
  zh: {
    title: '高级筛选',
    subtitle: '按合租后的人均预算找户型，范围跟随左侧的学校通勤圈。',
    minBudget: '预算最低',
    maxBudget: '预算最高',
    bedrooms: '卧室数量',
    bedroom: '卧室',
    sort: '排序方式',
    sortRecommended: '推荐排序',
    sortPriceAsc: '价格：从低到高',
    sortPriceDesc: '价格：从高到低',
    sortDistanceAsc: '距离：从近到远',
    sortDistanceDesc: '距离：从远到近',
    loading: '正在加载户型...',
    enterBudget: '输入预算范围即可看到匹配的方案。',
    showing: (n: number) => `共 ${n} 个匹配户型`,
    matchedTitle: '符合你预算的楼盘',
    none: '没有符合条件的户型。',
    noneHint: '试着提高预算、选择更多人合租，或放大通勤圈范围。',
    error: '户型加载失败，请重试。',
    close: '关闭'
  }
};

export function AdvancedSearch({
  language,
  allowedBuildingIds,
  distanceAnchor,
  onClose,
  onHoverBuilding,
  onOpenBuilding,
  onOpenUnit,
  onContact
}: {
  language: Language;
  allowedBuildingIds: string[];
  distanceAnchor: { lat: number; lng: number } | null;
  onClose: () => void;
  onHoverBuilding: (id: string) => void;
  onOpenBuilding: (buildingId: string) => void;
  onOpenUnit: (buildingId: string, unitId: string) => void;
  onContact: (buildingId: string, unitId: string) => void;
}) {
  const t = copy[language];
  useEscapeKey(true, onClose);
  const [buildings, setBuildings] = useState<BuildingInput[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [minBudget, setMinBudget] = useState('1500');
  const [maxBudget, setMaxBudget] = useState('1700');
  const [desiredBedrooms, setDesiredBedrooms] = useState(1);
  const [sortBy, setSortBy] = useState<SortKey>('recommended');

  useEffect(() => {
    let active = true;
    setStatus('loading');
    fetch('/api/floorplans', { cache: 'no-store' })
      .then(response => (response.ok ? response.json() : Promise.reject(new Error('request failed'))))
      .then((data: { buildings?: BuildingInput[] }) => {
        if (!active) return;
        setBuildings(Array.isArray(data.buildings) ? data.buildings : []);
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => { active = false; };
  }, []);

  const hasBudget = minBudget.trim() !== '' || maxBudget.trim() !== '';

  const groups = useMemo(() => {
    if (!buildings || !hasBudget) return [];
    const allowed = new Set(allowedBuildingIds);
    const scoped = buildings.filter(building => allowed.has(building.id));
    const minValue = minBudget.trim() === '' ? Number.NaN : Number(minBudget);
    const maxValue = maxBudget.trim() === '' ? Number.NaN : Number(maxBudget);
    const results = getMatchingFloorPlans(
      { minBudget: minValue, maxBudget: maxValue, desiredBedrooms, bedroomRange: BEDROOM_RANGE, distanceAnchor },
      scoped
    );
    const mid = budgetMidpoint(minValue, maxValue);
    return sortBuildingGroups(groupResultsByBuilding(results), sortBy, mid);
  }, [buildings, hasBudget, minBudget, maxBudget, desiredBedrooms, sortBy, allowedBuildingIds, distanceAnchor]);

  const totalUnits = groups.reduce((sum, group) => sum + group.count, 0);

  return (
    <aside className="advancedPanel" aria-label={t.title}>
      <div className="advancedHead">
        <div>
          <h2>{t.title}</h2>
          <p>{t.subtitle}</p>
        </div>
        <button type="button" aria-label={t.close} onClick={onClose}><X size={18} /></button>
      </div>

      <div className="advancedFilters">
        <label>
          {t.minBudget}
          <input type="number" min={0} inputMode="numeric" value={minBudget} onChange={event => setMinBudget(event.target.value)} placeholder="1500" />
        </label>
        <label>
          {t.maxBudget}
          <input type="number" min={0} inputMode="numeric" value={maxBudget} onChange={event => setMaxBudget(event.target.value)} placeholder="1700" />
        </label>
        <label>
          {t.bedrooms}
          <select value={desiredBedrooms} onChange={event => setDesiredBedrooms(Number(event.target.value))}>
            {[1, 2, 3, 4].map(value => (
              <option key={value} value={value}>{value} {t.bedroom}</option>
            ))}
          </select>
        </label>
        <label>
          {t.sort}
          <select value={sortBy} onChange={event => setSortBy(event.target.value as SortKey)}>
            <option value="recommended">{t.sortRecommended}</option>
            <option value="priceAsc">{t.sortPriceAsc}</option>
            <option value="priceDesc">{t.sortPriceDesc}</option>
            <option value="distanceAsc">{t.sortDistanceAsc}</option>
            <option value="distanceDesc">{t.sortDistanceDesc}</option>
          </select>
        </label>
      </div>

      <div className="advancedResults">
        {status === 'loading' && <p className="advancedMsg">{t.loading}</p>}
        {status === 'error' && <p className="advancedMsg">{t.error}</p>}
        {status === 'ready' && !hasBudget && <p className="advancedMsg">{t.enterBudget}</p>}
        {status === 'ready' && hasBudget && groups.length === 0 && (
          <div className="advancedEmpty">
            <strong>{t.none}</strong>
            <p>{t.noneHint}</p>
          </div>
        )}
        {status === 'ready' && hasBudget && groups.length > 0 && (
          <>
            <div className="advancedResultsHead">
              <strong>{t.matchedTitle}</strong>
              <span>{t.showing(totalUnits)}</span>
            </div>
            <MatchingResultsPanel
              groups={groups}
              language={language}
              onHover={onHoverBuilding}
              onOpenBuilding={onOpenBuilding}
              onOpenUnit={onOpenUnit}
              onContact={onContact}
            />
          </>
        )}
      </div>
    </aside>
  );
}
