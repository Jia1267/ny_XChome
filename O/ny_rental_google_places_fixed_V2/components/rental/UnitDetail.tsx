import { Phone, Scale } from 'lucide-react';
import { money } from '@/lib/format';
import type { Translate } from '@/lib/i18n';
import type { Building, Language, RentalUnit } from '@/lib/types';
import { bathroomLabel, bedroomsLabel, unitTitle } from './shared';
import { TrustGrid } from './TrustGrid';
import { NearbyFacilities } from './NearbyFacilities';
import { RentCalculator } from './RentCalculator';

export function UnitDetail({ building, unit, language, t, onCompare, onLead }: {
  building: Building;
  unit: RentalUnit;
  language: Language;
  t: Translate;
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
            <img src={floorPlan} alt={`${unitTitle(unit)} floor plan`} loading="lazy" decoding="async" onError={event => { event.currentTarget.style.display = 'none'; }} />
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
