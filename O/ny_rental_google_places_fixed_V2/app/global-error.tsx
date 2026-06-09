'use client';

import { useEffect } from 'react';

// Catches errors thrown in the root layout. Must render its own <html>/<body>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[global error]', error);
  }, [error]);

  return (
    <html lang="zh">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center' }}>
          <h2 style={{ margin: 0 }}>应用出错了 · Application error</h2>
          <p style={{ margin: 0, color: '#667085' }}>请刷新页面重试。</p>
          <button
            type="button"
            onClick={reset}
            style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}
          >
            重试 · Retry
          </button>
        </div>
      </body>
    </html>
  );
}
