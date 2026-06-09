'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'nyrm_privacy_ack';

// Lightweight first-visit privacy notice. Analytics are server-side (not cookie
// tracking), but a clear notice + links to the policies is a commercial-grade
// expectation. Dismissal is remembered in localStorage.
export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // localStorage unavailable (private mode) — show once, don't persist.
      setVisible(true);
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="consentBanner" role="region" aria-label="Privacy notice">
      <p>
        We collect inquiry details and basic usage analytics to operate this service · 我们会收集咨询信息与使用数据来提供服务。
        See our <Link href="/legal/privacy">Privacy Policy</Link> and <Link href="/legal/cookie-policy">Cookie Policy</Link>.
      </p>
      <button type="button" onClick={dismiss}>Got it · 知道了</button>
    </div>
  );
}
