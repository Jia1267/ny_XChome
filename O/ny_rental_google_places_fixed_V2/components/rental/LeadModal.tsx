'use client';

import { X } from 'lucide-react';
import type { Translate } from '@/lib/i18n';
import type { Building, Lead, RentalUnit } from '@/lib/types';
import { unitTitle } from './shared';
import { useFocusTrap } from '../useDialog';

export function LeadModal({ building, unit, context, t, onCancel, onSaved }: {
  building: Building | null;
  unit: RentalUnit | null;
  context: { buildingId?: string; unitId?: string };
  t: Translate;
  onCancel: () => void;
  onSaved: (lead: Lead) => void;
}) {
  const dialogRef = useFocusTrap<HTMLFormElement>(true, onCancel);

  async function submit(formData: FormData) {
    const lead: Lead = {
      id: `lead_${Date.now()}`,
      createdAt: new Date().toISOString(),
      name: String(formData.get('name') || ''),
      wechat: String(formData.get('wechat') || ''),
      school: String(formData.get('school') || ''),
      budget: String(formData.get('budget') || ''),
      moveInDate: String(formData.get('moveInDate') || ''),
      interestedUnit: String(formData.get('interestedUnit') || ''),
      notes: String(formData.get('notes') || ''),
      buildingId: context.buildingId,
      unitId: context.unitId,
      source: 'trial_site'
    };
    await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...lead, website: String(formData.get('website') || '') })
    }).catch(() => undefined);
    onSaved(lead);
  }

  return (
    <div className="modalBackdrop" onClick={onCancel}>
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('leadTitle')}
        className="leadModal"
        onClick={event => event.stopPropagation()}
        onSubmit={event => {
          event.preventDefault();
          submit(new FormData(event.currentTarget));
        }}
      >
        <button className="modalClose" type="button" aria-label={t('close')} onClick={onCancel}><X size={18} /></button>
        <p className="eyebrow">{building?.name}</p>
        <h2>{t('leadTitle')}</h2>
        <p>{unit ? unitTitle(unit) : building?.address}</p>
        {/* Honeypot: hidden from real users; bots that fill it are silently dropped server-side. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
        />
        <div className="formGrid">
          <label>{t('name')}<input name="name" required /></label>
          <label>{t('wechat')}<input name="wechat" required /></label>
          <label>{t('school')}<input name="school" /></label>
          <label>{t('budget')}<input name="budget" placeholder="$3,500 - $4,500" /></label>
          <label>{t('moveIn')}<input name="moveInDate" type="date" /></label>
          <label>{t('interest')}<input name="interestedUnit" defaultValue={unit ? unitTitle(unit) : building?.name} /></label>
          <label className="wide">{t('notes')}<textarea name="notes" rows={3} /></label>
        </div>
        <p className="finePrint">{t('leadFine')}</p>
        <div className="actionRow">
          <button className="secondaryButton" type="button" onClick={onCancel}>{t('cancel')}</button>
          <button className="primaryButton" type="submit">{t('submit')}</button>
        </div>
      </form>
    </div>
  );
}
