'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Languages, List, Phone, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { MapCanvas } from './MapCanvas';
import { MapLegend } from './rental/MapLegend';
import { ImageZoomProvider } from './rental/ImageZoom';
import { defaultDetailStageForViewport, isMobileViewport, nearbyPoisFor, unitTitle, type DetailStage } from './rental/shared';
import { copy, type CopyKey } from '@/lib/i18n';
import { distanceMeters, money } from '@/lib/format';
import type { AnalyticsEvent, Building, CommuteMode, Language, PoiType, RentalDataset, RentalUnit, SchoolId } from '@/lib/types';

// Non-first-paint UI is code-split: the initial bundle is just the map + chrome;
// these chunks load on demand when the user opens a detail/compare/lead/filter.
const DetailPanel = dynamic(() => import('./rental/DetailPanel').then(mod => ({ default: mod.DetailPanel })));
const CompareDock = dynamic(() => import('./rental/CompareDock').then(mod => ({ default: mod.CompareDock })));
const LeadModal = dynamic(() => import('./rental/LeadModal').then(mod => ({ default: mod.LeadModal })));
const AdvancedSearch = dynamic(() => import('./AdvancedSearch').then(mod => ({ default: mod.AdvancedSearch })));

type RentalAppProps = {
  dataset: RentalDataset;
};

const commuteRadiusMeters: Record<CommuteMode, number> = {
  none: Infinity,
  walk5: 400,
  walk15: 1200,
  subway20: 6000,
  subway40: 13000,
  subway60: 20000
};

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
  const [loadErrorId, setLoadErrorId] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [hoveredBuildingId, setHoveredBuildingId] = useState('');

  const t = useCallback((key: CopyKey) => copy[language][key], [language]);

  const track = useCallback((type: string, payload: Partial<AnalyticsEvent> = {}) => {
    const event: AnalyticsEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      createdAt: new Date().toISOString(),
      ...payload
    };
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
    setLoadErrorId(current => (current === buildingId ? '' : current));
    try {
      const response = await fetch(`/api/buildings/${encodeURIComponent(buildingId)}`, { cache: 'no-store' });
      if (!response.ok) {
        setLoadErrorId(buildingId);
        return;
      }
      const data = await response.json() as { building?: Building };
      if (data.building) {
        setBuildingDetails(current => ({ ...current, [buildingId]: data.building as Building }));
      } else {
        setLoadErrorId(buildingId);
      }
    } catch {
      setLoadErrorId(buildingId);
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
    setAdvancedOpen(false);
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
    setAdvancedOpen(false);
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

  function openAdvanced() {
    // Keep the commute rings as-is: the advanced filter scopes to whatever
    // buildings are currently shown on the map.
    setSelectedBuildingId('');
    setSelectedUnitId('');
    setHoveredBuildingId('');
    setAdvancedOpen(true);
    track('advanced_filter_open');
  }

  function openBuildingFromSearch(buildingId: string) {
    setAdvancedOpen(false);
    setHoveredBuildingId('');
    setSelectedUnitId('');
    setSelectedBuildingId(buildingId);
    setDetailStage(defaultDetailStageForViewport());
    loadBuildingDetail(buildingId);
    track('building_click', { buildingId, source: 'advanced_search' });
  }

  function openUnitFromSearch(buildingId: string, unitId: string) {
    setAdvancedOpen(false);
    setHoveredBuildingId('');
    setSelectedBuildingId(buildingId);
    setSelectedUnitId(unitId);
    setDetailStage(defaultDetailStageForViewport());
    loadBuildingDetail(buildingId);
    track('unit_click', { buildingId, unitId, source: 'advanced_search' });
  }

  function addCompare(unitId: string) {
    setCompareIds(current => {
      if (current.includes(unitId)) return current;
      return [...current, unitId].slice(-2);
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
      await navigator.share({ title: selectedUnit ? unitTitle(selectedUnit) : selectedBuilding?.name || 'UniNest', url }).catch(() => undefined);
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
    <ImageZoomProvider>
    <div className="appRoot">
      <header className="topbar">
        <div className="brand">
          <div className="brandMark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-icon.svg" alt="UniNest logo" />
          </div>
          <div>
            <h1>UniNest</h1>
            <p>{dataset.summary.buildingCount} {t('buildings')} · {dataset.summary.unitCount} {t('units')} · {dataset.summary.poiCount} {t('poisLoaded')}</p>
          </div>
        </div>
        <nav className="topActions">
          <button type="button" onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}><Languages size={18} />{language === 'en' ? '中文' : 'EN'}</button>
          <button type="button" className="filterAction" onClick={openAdvanced}><SlidersHorizontal size={18} />{language === 'en' ? 'Filter' : '筛选'}</button>
          <Link href="/listings"><List size={18} />{t('listings')}</Link>
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
          hoveredBuildingId={hoveredBuildingId}
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

        {selectedBuilding && !detailHiddenByCompare && !advancedOpen && (
          <DetailPanel
            building={selectedBuilding}
            unit={selectedUnit}
            language={language}
            stage={detailStage}
            loading={loadingBuildingId === selectedBuilding.id}
            loadFailed={loadErrorId === selectedBuilding.id}
            onRetry={() => loadBuildingDetail(selectedBuilding.id)}
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

        {selectedBuilding && !detailHiddenByCompare && !advancedOpen && (
          <div className="mobileContactBar">
            <div>
              <span>{selectedUnit ? unitTitle(selectedUnit) : selectedBuilding.name}</span>
              <strong>{money(selectedUnit?.grossRent || selectedBuilding.startingRent)}</strong>
            </div>
            <button type="button" onClick={() => openLead({ buildingId: selectedBuilding.id, unitId: selectedUnit?.id })}><Phone size={18} />{t('contactAgent')}</button>
          </div>
        )}

        {advancedOpen && (
          <AdvancedSearch
            language={language}
            allowedBuildingIds={filteredBuildings.map(building => building.id)}
            distanceAnchor={selectedSchool ? { lat: selectedSchool.lat, lng: selectedSchool.lng } : null}
            onClose={() => { setAdvancedOpen(false); setHoveredBuildingId(''); }}
            onHoverBuilding={setHoveredBuildingId}
            onOpenBuilding={openBuildingFromSearch}
            onOpenUnit={openUnitFromSearch}
            onContact={(buildingId, unitId) => openLead({ buildingId, unitId: unitId || undefined })}
          />
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
            track('lead_submit', { buildingId: lead.buildingId, unitId: lead.unitId, schoolId: lead.school as SchoolId, budget: lead.budget });
            setLeadContext(null);
          }}
        />
      )}
    </div>
    </ImageZoomProvider>
  );
}
