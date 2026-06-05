export function toNumber(value: string | number | null | undefined, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (!value) return fallback;
  const cleaned = String(value).replace(/[$,\s]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function nullableMoney(value: string | number | null | undefined): number | null {
  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function money(value: number | null | undefined, fallback = 'Ask agent'): string {
  if (!Number.isFinite(value ?? Number.NaN)) return fallback;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value as number);
}

export function compactMoney(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? Number.NaN)) return 'Ask';
  const amount = value as number;
  if (amount >= 1000) return `$${Math.round(amount / 100) / 10}k`;
  return money(amount);
}

export function hostName(url: string): string {
  if (!url) return 'Provided CSV';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Provided CSV';
  }
}

export function dateLabel(value: string): string {
  if (!value) return 'Not listed';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}

export function splitList(value: string): string[] {
  if (!value) return [];
  return value
    .split(/[;|]/)
    .map(item => item.trim())
    .filter(Boolean);
}

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radius = 6371000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}
