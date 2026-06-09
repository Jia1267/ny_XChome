import Link from 'next/link';
import { cookies } from 'next/headers';
import { AdminActions } from '@/components/AdminActions';
import { AdminLogin } from '@/components/AdminLogin';
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from '@/lib/admin-auth';
import { getRentalDataset } from '@/lib/data';
import { googleSheetsConfigured, readGoogleSheetCache, SHEET_NAMES } from '@/lib/google-sheets';
import { getStorageDiagnostics, googleSheetsWritableConfigured, readAnalyticsEventsFromGoogleSheet, readLeadsFromGoogleSheet } from '@/lib/google-sheets-write';
import { localFileStoreAllowed, readJsonArray } from '@/lib/server-store';
import { productionEnvProblems } from '@/lib/env';
import type { AnalyticsEvent, Building, Lead, RentalUnit, TrustStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Metric = {
  label: string;
  value: string;
  hint: string;
};

function countEvents(events: AnalyticsEvent[], type: string) {
  return events.filter(event => event.type === type).length;
}

function percent(numerator: number, denominator: number) {
  if (!denominator) return '0%';
  return `${Math.round((numerator / denominator) * 1000) / 10}%`;
}

function topRows<T>(items: T[], keyFn: (item: T) => string | undefined, limit = 5) {
  const counts = new Map<string, number>();
  items.forEach(item => {
    const key = keyFn(item);
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function statusText(status: TrustStatus) {
  if (status === 'verified') return 'Verified';
  if (status === 'provided') return 'Provided';
  if (status === 'needs_confirmation') return 'Needs confirmation';
  return 'Unknown';
}

function isStale(dateText: string) {
  const time = Date.parse(dateText);
  if (Number.isNaN(time)) return true;
  return Date.now() - time > 1000 * 60 * 60 * 24 * 7;
}

function sourceLink(name: string, url: string) {
  if (!url) return name || 'Not listed';
  let label = name;
  try {
    label ||= new URL(url).hostname;
  } catch {
    label ||= url;
  }
  return <a href={url} target="_blank" rel="noreferrer">{label}</a>;
}

async function readOperationalData() {
  if (googleSheetsWritableConfigured()) {
    try {
      const [events, leads] = await Promise.all([
        readAnalyticsEventsFromGoogleSheet(),
        readLeadsFromGoogleSheet()
      ]);
      return { events, leads, source: 'google_sheets' as const };
    } catch {
      // Fall through to local development storage if Sheet reads are temporarily unavailable.
    }
  }

  const [events, leads] = await Promise.all([
    readJsonArray<AnalyticsEvent>('analytics-events.json'),
    readJsonArray<Lead>('leads.json')
  ]);
  return { events, leads, source: localFileStoreAllowed() ? 'local_file' as const : 'unconfigured' as const };
}

function storageLabel(source: 'google_sheets' | 'local_file' | 'unconfigured') {
  if (source === 'google_sheets') return 'Google Sheets (live)';
  if (source === 'local_file') return 'Local dev file (.data)';
  return 'NOT configured — events are discarded';
}

function ConfidenceRow({ item, kind }: { item: Building | RentalUnit; kind: 'building' | 'unit' }) {
  const title = kind === 'building'
    ? (item as Building).name
    : `${(item as RentalUnit).floorPlan || 'Unit'} #${(item as RentalUnit).unitNumber}`;

  return (
    <tr>
      <td>
        <strong>{title}</strong>
        <span>{kind === 'building' ? (item as Building).address : (item as RentalUnit).buildingId}</span>
      </td>
      <td className={isStale(item.lastUpdatedAt) ? 'adminWarnText' : ''}>{item.lastUpdatedAt || 'Not listed'}</td>
      <td>{sourceLink(item.sourceName, item.sourceUrl)}</td>
      <td>{statusText(item.priceStatus)}</td>
      <td>{statusText(item.feeStatus)}</td>
      <td>{statusText(item.availabilityStatus)}</td>
      <td>{item.availabilityCheckedAt || 'Not listed'}</td>
      <td>{item.contactId || 'Not assigned'}</td>
      <td>{item.updatedBy || 'Not listed'}</td>
      <td>{item.internalNotes || 'None'}</td>
    </tr>
  );
}

export default async function AdminPage() {
  const session = cookies().get(ADMIN_COOKIE_NAME)?.value;
  if (!verifyAdminSessionToken(session)) {
    return <AdminLogin />;
  }

  const [dataset, operationalData, sheetCache, storage] = await Promise.all([
    getRentalDataset(),
    readOperationalData(),
    readGoogleSheetCache(),
    getStorageDiagnostics()
  ]);
  const { events, leads, source: operationalSource } = operationalData;
  const envProblems = productionEnvProblems();
  const writesLikelyBroken = storage.configured && storage.error === null && storage.analyticsRows === 0 && events.length === 0;
  const tabsMissing = Boolean(storage.error && /parse range/i.test(storage.error));

  const pageViews = countEvents(events, 'page_view');
  const contactClicks = countEvents(events, 'contact_click');
  const leadSubmits = countEvents(events, 'lead_submit') || leads.length;
  const buildingClicks = countEvents(events, 'building_click');
  const unitClicks = countEvents(events, 'unit_click');
  const shareClicks = countEvents(events, 'share_click');
  const staleBuildings = dataset.buildings.filter(building => isStale(building.lastUpdatedAt)).length;
  const staleUnits = dataset.units.filter(unit => isStale(unit.lastUpdatedAt)).length;
  const needsPrice = dataset.units.filter(unit => unit.priceStatus !== 'verified').length;
  const needsFees = dataset.units.filter(unit => unit.feeStatus !== 'verified').length;

  const metrics: Metric[] = [
    { label: 'Visits', value: pageViews.toLocaleString(), hint: 'page_view events' },
    { label: 'Building clicks', value: buildingClicks.toLocaleString(), hint: 'broker demand signal' },
    { label: 'Unit clicks', value: unitClicks.toLocaleString(), hint: 'floor-plan interest' },
    { label: 'Shares', value: shareClicks.toLocaleString(), hint: 'share button clicks' },
    { label: 'Consult clicks', value: contactClicks.toLocaleString(), hint: 'contact button clicks' },
    { label: 'Lead conversion', value: percent(leadSubmits, pageViews), hint: `${leadSubmits} submitted leads` },
    { label: 'Stale buildings', value: staleBuildings.toLocaleString(), hint: 'older than 7 days or missing date' },
    { label: 'Units need checks', value: (needsPrice + needsFees).toLocaleString(), hint: 'price or fee not verified' }
  ];

  const topSchools = topRows(events, event => event.schoolId);
  const topBuildings = topRows(events, event => dataset.buildings.find(building => building.id === event.buildingId)?.name || event.buildingId);
  const topBudgets = topRows(leads, lead => lead.budget);
  const recentLeads = [...leads].reverse().slice(0, 8);

  return (
    <main className="adminPage">
      <header className="adminTopbar">
        <div>
          <Link href="/">NY Rental Map</Link>
          <h1>Operations panel</h1>
          <p>Private dashboard for broker trials, listing trust, leads, and Google Sheet sync.</p>
        </div>
        <AdminActions />
      </header>

      {envProblems.length > 0 && (
        <section className="adminNotice" style={{ borderLeft: '4px solid #d33', background: '#fff5f5' }}>
          <div>
            <strong>⚠ Configuration problems</strong>
            <span>These must be fixed in your Vercel environment variables, otherwise metrics stay at 0.</span>
          </div>
          {envProblems.map(problem => (
            <div key={problem}>
              <span>{problem}</span>
            </div>
          ))}
        </section>
      )}

      <section className="adminNotice">
        <div>
          <strong>Data source</strong>
          <span>{dataset.summary.dataSourceMode === 'google_sheet_cache' ? 'Google Sheet cache' : 'Local CSV fallback'}</span>
        </div>
        <div>
          <strong>Sheet configured</strong>
          <span>{googleSheetsConfigured() ? 'Yes' : 'No, add .env.local first'}</span>
        </div>
        <div>
          <strong>Last sync</strong>
          <span>{dataset.summary.sheetLastSyncedAt || sheetCache?.syncedAt || 'Not synced yet'}</span>
        </div>
        <div>
          <strong>Leads / analytics storage</strong>
          <span>{storageLabel(operationalSource)}</span>
        </div>
        <div>
          <strong>Public safety</strong>
          <span>Frontend receives no internal notes, agents, contacts, or change log.</span>
        </div>
      </section>

      <section className="adminNotice" style={storage.error || writesLikelyBroken ? { borderLeft: '4px solid #d33', background: '#fff5f5' } : undefined}>
        <div>
          <strong>Storage diagnostics</strong>
          <span>Live check of the private Sheet write path.</span>
        </div>
        <div>
          <strong>analytics_events rows</strong>
          <span>{storage.configured ? (storage.analyticsRows ?? '—') : 'Sheets not configured'}</span>
        </div>
        <div>
          <strong>leads rows</strong>
          <span>{storage.configured ? (storage.leadRows ?? '—') : 'Sheets not configured'}</span>
        </div>
        {storage.error && (
          <div>
            <strong>Read error</strong>
            <span>{storage.error}</span>
          </div>
        )}
        {tabsMissing && (
          <div>
            <strong>Likely cause</strong>
            <span>The <b>analytics_events</b> / <b>leads</b> tabs do not exist yet. Click “Test storage write” above — it auto-creates both tabs with headers. After that, browsing the site records events automatically.</span>
          </div>
        )}
        {writesLikelyBroken && (
          <div>
            <strong>Likely cause</strong>
            <span>Reads work but the tab is empty after browsing — writes are failing. Use “Test storage write” above; if it fails with 403, share the Sheet with the service account as <b>Editor</b>.</span>
          </div>
        )}
      </section>

      <section className="adminMetricGrid">
        {metrics.map(metric => (
          <article key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.hint}</p>
          </article>
        ))}
      </section>

      <section className="adminTwoColumn">
        <article className="adminCard">
          <h2>Broker-facing proof</h2>
          <div className="adminList">
            <h3>Top schools</h3>
            {topSchools.length ? topSchools.map(([name, count]) => <p key={name}><span>{name}</span><strong>{count}</strong></p>) : <p>No school clicks yet.</p>}
            <h3>Top buildings</h3>
            {topBuildings.length ? topBuildings.map(([name, count]) => <p key={name}><span>{name}</span><strong>{count}</strong></p>) : <p>No building clicks yet.</p>}
            <h3>Top budgets</h3>
            {topBudgets.length ? topBudgets.map(([name, count]) => <p key={name}><span>{name}</span><strong>{count}</strong></p>) : <p>No lead budgets yet.</p>}
          </div>
        </article>

        <article className="adminCard">
          <h2>Recent leads</h2>
          <div className="adminLeadList">
            {recentLeads.length ? recentLeads.map(lead => (
              <div key={lead.id}>
                <strong>{lead.name || 'Unnamed'} · {lead.wechat || 'No WeChat'}</strong>
                <span>{lead.school || 'No school'} · {lead.budget || 'No budget'} · {lead.moveInDate || 'No move-in date'}</span>
                <small>{lead.interestedUnit || lead.unitId || lead.buildingId || 'No selected unit'} · {new Date(lead.createdAt).toLocaleString()}</small>
              </div>
            )) : <p>No leads yet.</p>}
          </div>
        </article>
      </section>

      <section className="adminCard">
        <div className="adminSectionHeader">
          <div>
            <h2>Google Sheet schema</h2>
            <p>Use these exact tab names. Keep the Sheet private and share it with the service account email only.</p>
          </div>
          <span>Recommended refresh: every 4 hours</span>
        </div>
        <div className="adminSchemaGrid">
          {SHEET_NAMES.map(name => (
            <article key={name}>
              <strong>{name}</strong>
              <span>{sheetCache?.sheets[name]?.length ?? 0} cached rows</span>
            </article>
          ))}
        </div>
        <p className="adminFine">
          Required building/unit fields: last_updated_at, source_name, source_url, price_status, fee_status,
          availability_status, availability_checked_at, contact_id, updated_by, internal_notes.
        </p>
      </section>

      <section className="adminCard">
        <div className="adminSectionHeader">
          <div>
            <h2>Building trust table</h2>
            <p>Shows all buildings. Stale dates are highlighted.</p>
          </div>
          <span>{dataset.buildings.length} buildings · {staleBuildings} stale</span>
        </div>
        <div className="adminTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>Building</th>
                <th>Last updated</th>
                <th>Source</th>
                <th>Price</th>
                <th>Fees</th>
                <th>Available</th>
                <th>Availability checked</th>
                <th>Contact</th>
                <th>Updated by</th>
                <th>Internal notes</th>
              </tr>
            </thead>
            <tbody>
              {dataset.buildings.map(building => <ConfidenceRow key={building.id} item={building} kind="building" />)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="adminCard">
        <div className="adminSectionHeader">
          <div>
            <h2>Unit trust table</h2>
            <p>Previewing the first 180 units for speed. Use Google Sheet for full editing.</p>
          </div>
          <span>{dataset.units.length} units · {staleUnits} stale</span>
        </div>
        <div className="adminTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Last updated</th>
                <th>Source</th>
                <th>Price</th>
                <th>Fees</th>
                <th>Available</th>
                <th>Availability checked</th>
                <th>Contact</th>
                <th>Updated by</th>
                <th>Internal notes</th>
              </tr>
            </thead>
            <tbody>
              {dataset.units.slice(0, 180).map(unit => <ConfidenceRow key={unit.id} item={unit} kind="unit" />)}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
