import type { Translate } from '@/lib/i18n';
import type { Building, PoiType } from '@/lib/types';
import { nearbyPoisFor, nearbyTypeLabels } from './shared';

export function NearbyFacilities({ building, t, compact = false }: { building: Building; t: Translate; compact?: boolean }) {
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
