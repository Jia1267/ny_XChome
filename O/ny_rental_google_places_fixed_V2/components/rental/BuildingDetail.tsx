import { ExternalLink, Scale } from 'lucide-react';
import { compactMoney, money } from '@/lib/format';
import type { Translate } from '@/lib/i18n';
import type { Building } from '@/lib/types';
import { bathroomLabel, bedroomsLabel, unitTitle } from './shared';
import { TrustGrid } from './TrustGrid';
import { NearbyFacilities } from './NearbyFacilities';

export function BuildingDetail({ building, loading, t, onOpenUnit, onCompare, onLead }: {
  building: Building;
  loading: boolean;
  t: Translate;
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
