'use client';

import { ChevronRight, MapPin, Phone } from 'lucide-react';
import { money } from '@/lib/format';
import type { Language } from '@/lib/types';
import type { BuildingGroup, MatchingResult } from '@/lib/filter-floorplans';

const copy = {
  en: {
    from: 'From',
    perPerson: '/person',
    perMonth: '/month',
    floorPlans: (n: number) => `${n} matching floor ${n === 1 ? 'plan' : 'plans'}`,
    matched: 'Matched',
    viewBuilding: 'View building',
    contact: 'Contact'
  },
  zh: {
    from: '最低',
    perPerson: '/人',
    perMonth: '/月',
    floorPlans: (n: number) => `${n} 个符合条件的户型`,
    matched: '符合预算',
    viewBuilding: '查看楼盘',
    contact: '咨询'
  }
};

function bedroomLabel(bedrooms: number, bathrooms?: number) {
  const bed = bedrooms <= 0 ? 'Studio' : `${bedrooms}B`;
  const bath = bathrooms && bathrooms > 0 ? `${bathrooms}B` : '';
  return `${bed}${bath}`;
}

function matchedChips(unit: MatchingResult) {
  return Array.from(new Set(unit.matchedOptions.flatMap(option => option.matchedPrices))).sort((a, b) => a - b);
}

export function MatchingResultsPanel({ groups, language, onHover, onOpenBuilding, onOpenUnit, onContact }: {
  groups: BuildingGroup[];
  language: Language;
  onHover: (id: string) => void;
  onOpenBuilding: (buildingId: string) => void;
  onOpenUnit: (buildingId: string, unitId: string) => void;
  onContact: (buildingId: string, unitId: string) => void;
}) {
  const t = copy[language];

  return (
    <div className="matchResults">
      {groups.map(group => (
        <article
          key={group.buildingId}
          className="matchCard"
          onMouseEnter={() => onHover(group.buildingId)}
          onMouseLeave={() => onHover('')}
        >
          <header className="matchCardHead">
            <div className="matchCardTitle">
              <strong>{group.buildingName}</strong>
              <span>{group.address}</span>
            </div>
            <div className="matchPrice">
              <small>{t.from}</small>
              <strong>{money(group.minMatchedPrice)}</strong>
              <small>{t.perPerson}</small>
            </div>
          </header>

          <div className="matchCount">{t.floorPlans(group.count)}</div>

          <div className="matchUnitList">
            {group.units.map(unit => (
              <button key={unit.floorPlanId} type="button" className="matchUnitRow" onClick={() => onOpenUnit(group.buildingId, unit.floorPlanId)}>
                <div className="matchUnitTop">
                  <span className="matchTag">{bedroomLabel(unit.bedrooms, unit.bathrooms)}</span>
                  <span className="matchUnitTotal">{money(unit.totalPrice)}{t.perMonth}</span>
                  <ChevronRight size={16} className="matchUnitChevron" />
                </div>
                <div className="matchUnitShare">{unit.matchedOptions[0]?.displayText}</div>
                <div className="matchChips">
                  <span className="matchChipLabel">{t.matched}</span>
                  {matchedChips(unit).map(price => (
                    <span key={price} className="matchChip">{money(price)}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>

          <div className="matchActions">
            <button type="button" onClick={() => onOpenBuilding(group.buildingId)}>
              <MapPin size={15} />{t.viewBuilding}
            </button>
            <button type="button" className="matchContact" onClick={() => onContact(group.buildingId, '')}>
              <Phone size={15} />{t.contact}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
