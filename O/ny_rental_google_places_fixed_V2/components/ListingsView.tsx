'use client';

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowLeft, Languages } from 'lucide-react';
import { compactMoney, distanceMeters } from '@/lib/format';
import { copy, type CopyKey } from '@/lib/i18n';
import type { Building, Language, School, SchoolId } from '@/lib/types';

type SortKey = 'priceAsc' | 'priceDesc' | 'name';

const cardStyle: CSSProperties = {
  display: 'block',
  border: '1px solid #e4e8ef',
  borderRadius: 14,
  padding: 16,
  background: '#fff',
  textDecoration: 'none',
  color: 'inherit'
};

export function ListingsView({ buildings, schools }: { buildings: Building[]; schools: School[] }) {
  const [language, setLanguage] = useState<Language>('en');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('priceAsc');
  const [schoolId, setSchoolId] = useState<SchoolId>('all');
  const [maxBudget, setMaxBudget] = useState('');

  const t = (key: CopyKey) => copy[language][key];
  const school = schools.find(item => item.id === schoolId) || null;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const budget = Number(maxBudget) || 0;
    const list = buildings.filter(building => {
      if (q) {
        const haystack = `${building.name} ${building.neighborhood} ${building.cityArea} ${building.address}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (budget && building.startingRent && building.startingRent > budget) return false;
      return true;
    });

    if (school) {
      return [...list].sort((a, b) => distanceMeters(school, a) - distanceMeters(school, b));
    }
    if (sort === 'priceAsc') {
      return [...list].sort((a, b) => (a.startingRent ?? Infinity) - (b.startingRent ?? Infinity));
    }
    if (sort === 'priceDesc') {
      return [...list].sort((a, b) => (b.startingRent ?? -Infinity) - (a.startingRent ?? -Infinity));
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [buildings, query, sort, school, maxBudget]);

  const schoolChips: { id: SchoolId; label: string }[] = [
    { id: 'all', label: t('all') },
    ...schools.map(item => ({ id: item.id as SchoolId, label: item.shortName }))
  ];

  return (
    <main className="listingsPage" style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px 60px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#2563eb', textDecoration: 'none' }}>
            <ArrowLeft size={16} />{t('backToMap')}
          </Link>
          <h1 style={{ margin: '6px 0 0' }}>{t('listings')}</h1>
          <p style={{ margin: '2px 0 0', color: '#667085' }}>{results.length} {t('buildings')}</p>
        </div>
        <button
          type="button"
          onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, border: '1px solid #e4e8ef', background: '#fff', cursor: 'pointer' }}
        >
          <Languages size={16} />{language === 'en' ? '中文' : 'EN'}
        </button>
      </header>

      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          style={{ flex: '1 1 220px', padding: '10px 12px', borderRadius: 10, border: '1px solid #e4e8ef' }}
        />
        <input
          type="number"
          min={0}
          value={maxBudget}
          onChange={event => setMaxBudget(event.target.value)}
          placeholder={`${t('budget')} ($)`}
          aria-label={t('budget')}
          style={{ width: 140, padding: '10px 12px', borderRadius: 10, border: '1px solid #e4e8ef' }}
        />
        <select
          value={sort}
          onChange={event => setSort(event.target.value as SortKey)}
          disabled={Boolean(school)}
          aria-label="Sort"
          style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #e4e8ef' }}
        >
          <option value="priceAsc">{t('sortPriceAsc')}</option>
          <option value="priceDesc">{t('sortPriceDesc')}</option>
          <option value="name">{t('sortName')}</option>
        </select>
      </section>

      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {schoolChips.map(chip => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setSchoolId(chip.id)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: '1px solid #e4e8ef',
              background: schoolId === chip.id ? '#2563eb' : '#fff',
              color: schoolId === chip.id ? '#fff' : 'inherit',
              cursor: 'pointer'
            }}
          >
            {chip.label}
          </button>
        ))}
      </section>

      {results.length === 0 ? (
        <p style={{ color: '#667085' }}>{t('noResults')}</p>
      ) : (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {results.map(building => (
            <Link key={building.id} href={`/buildings/${encodeURIComponent(building.id)}`} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <strong style={{ fontSize: 16 }}>{building.name}</strong>
                <span style={{ color: '#2563eb', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {t('from')} {compactMoney(building.startingRent)}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', color: '#667085', fontSize: 13 }}>
                {[building.neighborhood, building.cityArea].filter(Boolean).join(' · ') || building.address}
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 13 }}>{building.rentRange}</p>
              <p style={{ margin: '8px 0 0', color: '#98a2b3', fontSize: 12 }}>
                {building.unitCount} {t('units')} · {t('lastUpdated')}: {building.trust.lastUpdated}
              </p>
              <span style={{ display: 'inline-block', marginTop: 10, color: '#2563eb', fontSize: 13 }}>{t('viewOnMap')} →</span>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
