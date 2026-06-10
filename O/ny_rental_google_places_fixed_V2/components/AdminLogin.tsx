'use client';

import { FormEvent, useState } from 'react';

export function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    setLoading(false);
    if (!response.ok) {
      setError('Password is not correct.');
      return;
    }
    window.location.reload();
  }

  return (
    <main className="adminLoginPage">
      <form className="adminLoginCard" onSubmit={submit}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="adminLoginBrand" src="/logo-wordmark.png" alt="UniNest" />
        <span>Admin</span>
        <h1>Operations panel</h1>
        <p>Private broker-facing dashboard for listing freshness, leads, and data quality.</p>
        <label>
          Admin password
          <input
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            placeholder="123456"
            autoComplete="current-password"
          />
        </label>
        {error && <strong className="adminError">{error}</strong>}
        <button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
      </form>
    </main>
  );
}
