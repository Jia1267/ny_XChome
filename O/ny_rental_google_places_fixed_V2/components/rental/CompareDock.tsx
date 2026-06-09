'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { X } from 'lucide-react';
import { money } from '@/lib/format';
import type { Translate } from '@/lib/i18n';
import type { Building, Language, RentalUnit } from '@/lib/types';
import { bathroomLabel, bedroomsLabel, statusLabel, unitTitle } from './shared';
import { TrustGrid } from './TrustGrid';
import { RentCalculator } from './RentCalculator';
import { NearbyFacilities } from './NearbyFacilities';
import { useImageZoom } from './ImageZoom';

export function CompareDock({ units, buildings, language, t, onRemove, onClear, onLead }: {
  units: RentalUnit[];
  buildings: Building[];
  language: Language;
  t: Translate;
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
  t: Translate;
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
  t: Translate;
  onRemove: (unitId: string) => void;
  onLead: (context: { buildingId?: string; unitId?: string }) => void;
}) {
  const floorPlan = unit.photos.find(photo => photo.type.includes('floor'))?.url;
  const { open } = useImageZoom();

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
            <img className="zoomable" src={floorPlan} alt={`${unitTitle(unit)} floor plan`} loading="lazy" decoding="async" onClick={() => open(floorPlan, `${unitTitle(unit)} floor plan`)} onError={event => { event.currentTarget.style.display = 'none'; }} />
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
