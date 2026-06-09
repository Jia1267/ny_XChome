// Input validation and sanitization for public API routes. Hand-written (no zod)
// so it adds zero dependencies. Every accepted field is coerced to a string,
// stripped of control characters, trimmed, and length-capped before storage.

import type { AnalyticsEvent, Lead } from './types';

export function cleanString(value: unknown, maxLength: number): string {
  if (value === null || value === undefined) return '';
  // Replace ASCII control chars (incl. newlines/tabs) with a space so single-line
  // spreadsheet cells stay clean. Done char-by-char to avoid a control-char regex.
  let out = '';
  for (const ch of String(value)) {
    const code = ch.codePointAt(0) ?? 32;
    out += (code < 0x20 || code === 0x7f) ? ' ' : ch;
  }
  return out.trim().slice(0, maxLength);
}

const LEAD_LIMITS = {
  id: 80,
  name: 80,
  wechat: 64,
  school: 80,
  budget: 64,
  moveInDate: 40,
  interestedUnit: 160,
  notes: 1000,
  buildingId: 120,
  unitId: 120,
  source: 64
} as const;

export type LeadValidation =
  | { ok: true; lead: Lead }
  | { ok: false; status: number; error: string; silent?: boolean };

export function validateLead(body: unknown): LeadValidation {
  const data = (body && typeof body === 'object') ? body as Record<string, unknown> : {};

  // Honeypot: real users never fill these hidden fields. Tell the client it
  // succeeded, but persist nothing.
  if (cleanString(data.website, 200) || cleanString(data.url, 200)) {
    return { ok: false, status: 200, error: 'ignored', silent: true };
  }

  const name = cleanString(data.name, LEAD_LIMITS.name);
  const wechat = cleanString(data.wechat, LEAD_LIMITS.wechat);
  if (!name || !wechat) {
    return { ok: false, status: 400, error: 'Name and WeChat are required' };
  }

  const lead: Lead = {
    id: cleanString(data.id, LEAD_LIMITS.id) || `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    name,
    wechat,
    school: cleanString(data.school, LEAD_LIMITS.school),
    budget: cleanString(data.budget, LEAD_LIMITS.budget),
    moveInDate: cleanString(data.moveInDate, LEAD_LIMITS.moveInDate),
    interestedUnit: cleanString(data.interestedUnit, LEAD_LIMITS.interestedUnit),
    notes: cleanString(data.notes, LEAD_LIMITS.notes),
    buildingId: cleanString(data.buildingId, LEAD_LIMITS.buildingId) || undefined,
    unitId: cleanString(data.unitId, LEAD_LIMITS.unitId) || undefined,
    source: cleanString(data.source, LEAD_LIMITS.source) || 'site_lead_form'
  };
  return { ok: true, lead };
}

// Permissive pattern (not a strict enum): blocks injection/garbage while never
// silently dropping a newly added, well-formed event type.
const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const ALLOWED_SCHOOL_IDS = ['all', 'columbia', 'nyu', 'baruch', 'pratt'];
const META_MAX_KEYS = 20;
const META_VALUE_MAX = 200;

export type AnalyticsValidation =
  | { ok: true; event: AnalyticsEvent }
  | { ok: false; status: number; error: string };

export function validateAnalyticsEvent(body: unknown): AnalyticsValidation {
  const data = (body && typeof body === 'object') ? body as Record<string, unknown> : {};

  const type = cleanString(data.type, 40);
  if (!type || !EVENT_TYPE_PATTERN.test(type)) {
    return { ok: false, status: 400, error: 'Invalid or missing event type' };
  }

  const schoolIdRaw = cleanString(data.schoolId, 40);
  const schoolId = ALLOWED_SCHOOL_IDS.includes(schoolIdRaw)
    ? (schoolIdRaw as AnalyticsEvent['schoolId'])
    : undefined;

  const metadata: NonNullable<AnalyticsEvent['metadata']> = {};
  if (data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)) {
    for (const [rawKey, value] of Object.entries(data.metadata as Record<string, unknown>).slice(0, META_MAX_KEYS)) {
      const key = cleanString(rawKey, 40);
      if (!key) continue;
      if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        metadata[key] = value;
      } else {
        metadata[key] = cleanString(value, META_VALUE_MAX);
      }
    }
  }

  const event: AnalyticsEvent = {
    id: cleanString(data.id, 80) || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    createdAt: cleanString(data.createdAt, 40) || new Date().toISOString(),
    buildingId: cleanString(data.buildingId, 120) || undefined,
    unitId: cleanString(data.unitId, 120) || undefined,
    schoolId,
    budget: cleanString(data.budget, 64) || undefined,
    source: cleanString(data.source, 64) || undefined,
    metadata
  };
  return { ok: true, event };
}
