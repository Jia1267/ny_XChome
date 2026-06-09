'use client';

import { useEffect } from 'react';

// Route-level error boundary. Catches render/runtime errors in this segment so
// users see a recoverable message instead of a blank screen or framework overlay.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[route error]', error);
  }, [error]);

  return (
    <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center' }}>
      <h2 style={{ margin: 0 }}>出错了 · Something went wrong</h2>
      <p style={{ margin: 0, color: '#667085' }}>页面加载时发生错误，请重试。</p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={reset}
          style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}
        >
          重试 · Retry
        </button>
        <a
          href="/"
          style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #e4e8ef', background: '#fff', color: 'inherit', textDecoration: 'none' }}
        >
          返回首页 · Home
        </a>
      </div>
    </div>
  );
}
