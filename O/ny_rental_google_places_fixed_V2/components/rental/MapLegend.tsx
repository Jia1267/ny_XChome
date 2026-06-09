import type { Translate } from '@/lib/i18n';

export function MapLegend({ t }: { t: Translate }) {
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
