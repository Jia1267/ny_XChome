import { promises as fs } from 'fs';
import path from 'path';

const STORE_DIR = path.join(process.cwd(), '.data');

type StoreEnv = Partial<Pick<NodeJS.ProcessEnv, 'NODE_ENV' | 'ENABLE_LOCAL_DATA_STORE'>>;

export function localFileStoreAllowed(env: StoreEnv = process.env) {
  return env.NODE_ENV !== 'production' || env.ENABLE_LOCAL_DATA_STORE === '1';
}

async function ensureStore() {
  if (!localFileStoreAllowed()) return;
  await fs.mkdir(STORE_DIR, { recursive: true });
}

export async function readJsonArray<T>(fileName: string): Promise<T[]> {
  if (!localFileStoreAllowed()) return [];
  await ensureStore();
  const filePath = path.join(STORE_DIR, fileName);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

export async function appendJsonArray<T>(fileName: string, value: T, limit = 5000): Promise<T[]> {
  if (!localFileStoreAllowed()) {
    throw new Error('Local .data storage is disabled in production. Configure Google Sheets or cloud storage.');
  }
  await ensureStore();
  const filePath = path.join(STORE_DIR, fileName);
  const current = await readJsonArray<T>(fileName);
  const next = [...current, value].slice(-limit);
  await fs.writeFile(filePath, JSON.stringify(next, null, 2), 'utf8');
  return next;
}
