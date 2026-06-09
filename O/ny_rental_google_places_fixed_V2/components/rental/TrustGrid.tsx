import type { Translate } from '@/lib/i18n';
import type { TrustInfo } from '@/lib/types';
import { trustItems } from './shared';

export function TrustGrid({ trust, t }: { trust: TrustInfo; t: Translate }) {
  return (
    <section className="trustGrid" aria-label="Listing confidence">
      {trustItems(trust, t).map(item => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value || t('unknown')}</strong>
        </div>
      ))}
    </section>
  );
}
