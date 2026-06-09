'use client';

import { useEffect, useRef } from 'react';
import { ArrowLeft, Maximize2, Minimize2, Share2, X } from 'lucide-react';
import type { Translate } from '@/lib/i18n';
import type { Building, Language, RentalUnit } from '@/lib/types';
import { unitTitle, type DetailStage } from './shared';
import { BuildingDetail } from './BuildingDetail';
import { UnitDetail } from './UnitDetail';
import { useImageZoom } from './ImageZoom';
import { useEscapeKey } from '../useDialog';

export function DetailPanel({
  building,
  unit,
  language,
  stage,
  loading,
  loadFailed,
  onRetry,
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
  loadFailed: boolean;
  onRetry: () => void;
  t: Translate;
  onClose: () => void;
  onBack: () => void;
  onStageChange: (stage: DetailStage) => void;
  onShare: () => void;
  onOpenUnit: (unitId: string) => void;
  onCompare: (unitId: string) => void;
  onLead: (context: { buildingId?: string; unitId?: string }) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const { open } = useImageZoom();
  useEscapeKey(true, onClose);

  // Reset scroll to the top whenever the building or unit changes, so each
  // navigation starts from the top of the panel.
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [building.id, unit?.id]);

  const heroUrl = unit?.photos.find(photo => photo.type.includes('floor'))?.url
    || building.primaryPhotoUrl
    || building.photos[0]?.url;
  const heroAlt = unit ? unitTitle(unit) : building.name;
  const nextStage: DetailStage = stage === 'half' ? 'full' : 'half';

  return (
    <aside ref={panelRef} className={`detailPanel stage-${stage}`}>
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
          <img
            className="zoomable"
            src={heroUrl}
            alt={heroAlt}
            loading="lazy"
            decoding="async"
            onClick={() => open(heroUrl, heroAlt)}
            onError={event => { event.currentTarget.style.display = 'none'; }}
          />
        </div>
      )}

      {unit ? (
        <UnitDetail building={building} unit={unit} language={language} t={t} onCompare={onCompare} onLead={onLead} />
      ) : (
        <BuildingDetail building={building} loading={loading} loadFailed={loadFailed} onRetry={onRetry} t={t} onOpenUnit={onOpenUnit} onCompare={onCompare} onLead={onLead} />
      )}
    </aside>
  );
}
