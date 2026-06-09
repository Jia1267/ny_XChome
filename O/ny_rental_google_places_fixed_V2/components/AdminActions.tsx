'use client';

import { useState } from 'react';

export function AdminActions() {
  const [status, setStatus] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);

  async function syncNow() {
    setSyncing(true);
    setStatus('Syncing Google Sheet...');
    const response = await fetch('/api/admin/sync', { method: 'POST' });
    const data = await response.json().catch(() => ({})) as { error?: string; syncedAt?: string };
    setSyncing(false);
    if (!response.ok) {
      setStatus(data.error || 'Sync failed.');
      return;
    }
    setStatus(`Synced at ${data.syncedAt || 'now'}. Refreshing...`);
    window.setTimeout(() => window.location.reload(), 650);
  }

  async function testStorage() {
    setTesting(true);
    setStatus('Writing a test row to the analytics_events tab...');
    const response = await fetch('/api/admin/diagnostics', { method: 'POST' });
    const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
    setTesting(false);
    if (response.ok && data.ok) {
      setStatus('✅ Write test succeeded — a row was added to analytics_events (safe to delete). Writes work.');
      return;
    }
    setStatus(`❌ Write test failed: ${data.error || 'unknown error'}`);
  }

  function downloadBackup() {
    window.location.href = '/api/admin/backup';
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.reload();
  }

  return (
    <div className="adminActions">
      <button type="button" onClick={syncNow} disabled={syncing}>{syncing ? 'Syncing...' : 'Sync Google Sheet'}</button>
      <button type="button" onClick={testStorage} disabled={testing}>{testing ? 'Testing...' : 'Test storage write'}</button>
      <button type="button" onClick={downloadBackup}>Download backup</button>
      <button type="button" className="adminGhostButton" onClick={logout}>Sign out</button>
      {status && <span>{status}</span>}
    </div>
  );
}
