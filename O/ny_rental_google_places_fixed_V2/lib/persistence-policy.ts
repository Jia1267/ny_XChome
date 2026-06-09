type PersistenceEnv = Partial<Pick<NodeJS.ProcessEnv, 'NODE_ENV'>>;

type StoreKind = 'analytics' | 'lead';

export function missingPersistentStoreError(kind: StoreKind, storedIn: string[], env: PersistenceEnv = process.env) {
  if (storedIn.length || env.NODE_ENV !== 'production') return null;

  const label = kind === 'analytics' ? 'Analytics' : 'Lead';
  return {
    status: 503,
    message: `${label} storage is not configured. Set Google service account credentials for the private Google Sheet.`
  };
}
