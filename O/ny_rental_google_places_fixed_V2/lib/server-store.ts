import { promises as fs } from 'fs';
import path from 'path';

const STORE_DIR = path.join(process.cwd(), '.data');

async function ensureStore() {
  await fs.mkdir(STORE_DIR, { recursive: true });
}

export async function readJsonArray<T>(fileName: string): Promise<T[]> {
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
  await ensureStore();
  const filePath = path.join(STORE_DIR, fileName);
  const current = await readJsonArray<T>(fileName);
  const next = [...current, value].slice(-limit);
  await fs.writeFile(filePath, JSON.stringify(next, null, 2), 'utf8');
  return next;
}
