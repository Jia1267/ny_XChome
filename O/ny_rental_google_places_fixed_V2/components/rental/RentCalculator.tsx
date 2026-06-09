'use client';

import { useState } from 'react';
import { money } from '@/lib/format';
import type { Translate } from '@/lib/i18n';
import type { Language, RentalUnit } from '@/lib/types';
import { roomLabels, splitMonthly } from './shared';

export function RentCalculator({ unit, language, t }: { unit: RentalUnit; language: Language; t: Translate }) {
  const [people, setPeople] = useState(unit.defaultPeople || unit.maxPeople);
  const [freeMonths, setFreeMonths] = useState(0);
  const [utilities, setUtilities] = useState(unit.utilitiesEstimateMonthly || 180);
  const leaseMonths = Number.parseInt(unit.leaseTerm, 10) || 12;
  const gross = unit.grossRent;
  const paidMonths = Math.max(0, leaseMonths - freeMonths);
  const netEffective = Math.round((gross * paidMonths) / leaseMonths);
  const monthlyTotal = netEffective + utilities;
  const deposit = unit.securityDepositAmount ?? gross;
  const broker = unit.brokerFeeAmount ?? 0;
  const fees = unit.amenityFeeAmount ?? 0;
  const moveInTotal = monthlyTotal + deposit + broker + fees;
  const split = splitMonthly(monthlyTotal, people, unit.rentStepDifference || 200);
  const labels = roomLabels(unit, people, t);
  const oneTimePerPerson = Math.round((deposit + broker + fees) / people);
  const guarantorIncome = gross * 35;

  return (
    <section className="calculator">
      <div className="sectionHeader">
        <h3>{t('rentCalculator')}</h3>
        <label>
          {t('peopleSharing')}
          <select value={people} onChange={event => setPeople(Number(event.target.value))}>
            {Array.from({ length: unit.maxPeople }, (_, index) => index + 1).map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="calcInputs">
        <label>
          Free months
          <input type="number" min={0} max={leaseMonths} value={freeMonths} onChange={event => setFreeMonths(Number(event.target.value))} />
        </label>
        <label>
          Utilities / month
          <input type="number" min={0} value={utilities} onChange={event => setUtilities(Number(event.target.value))} />
        </label>
      </div>
      <div className="calcSummary">
        <div><span>{t('netEffective')}</span><strong>{money(netEffective)}/mo</strong></div>
        <div><span>{t('monthlyTotal')}</span><strong>{money(monthlyTotal)}/mo</strong></div>
        <div><span>{t('moveInTotal')}</span><strong>{money(moveInTotal)}</strong></div>
        <div><span>{t('feesPerPerson')}</span><strong>{money(oneTimePerPerson)}</strong></div>
      </div>
      <div className="splitBox">
        <div className="splitHeader">
          <strong>{people}-person shared plan</strong>
          <span>{language === 'zh' ? '每级差 $200' : '$200 step-down rule'}</span>
        </div>
        <div className="roomGrid">
          {split.map((amount, index) => (
            <div key={`${labels[index]}-${index}`}>
              <span>{labels[index]}</span>
              <strong>{money(amount)}/mo</strong>
              <small>Move-in est. {money(amount + oneTimePerPerson)}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="guarantorNote">
        <strong>{t('guarantorTitle')}: {money(guarantorIncome)} income target</strong>
        <p>{t('guarantorText')}</p>
      </div>
    </section>
  );
}
