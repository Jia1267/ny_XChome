// Central place to inspect runtime configuration. Non-throwing on purpose: a
// missing env var must never crash the whole site at import time on Vercel.
// The admin page surfaces these so misconfiguration is visible, not silent.

import { adminPassword, adminSecretConfigured } from './admin-auth';
import { googleSheetsWritableConfigured } from './google-sheets-write';

export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

export type EnvStatus = {
  production: boolean;
  sheetsWritable: boolean;
  adminConfigured: boolean;
  siteUrl: boolean;
  syncToken: boolean;
  placesKey: boolean;
  allowedOrigins: boolean;
};

export function getEnvStatus(): EnvStatus {
  return {
    production: isProduction(),
    sheetsWritable: googleSheetsWritableConfigured(),
    adminConfigured: adminSecretConfigured() && Boolean(adminPassword()),
    siteUrl: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
    syncToken: Boolean(process.env.ADMIN_SYNC_TOKEN),
    placesKey: Boolean(process.env.GOOGLE_PLACES_API_KEY),
    allowedOrigins: Boolean(process.env.ALLOWED_APP_ORIGINS)
  };
}

// Problems that matter for a public production deployment. Empty in development.
export function productionEnvProblems(): string[] {
  if (!isProduction()) return [];
  const status = getEnvStatus();
  const problems: string[] = [];
  if (!status.sheetsWritable) {
    problems.push('Google Sheets write credentials missing (GOOGLE_SHEET_ID + GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY) — leads and analytics are NOT being saved.');
  }
  if (!status.adminConfigured) {
    problems.push('Admin auth not configured (ADMIN_PASSWORD + ADMIN_SESSION_SECRET).');
  }
  if (!status.siteUrl) {
    problems.push('NEXT_PUBLIC_SITE_URL not set — share links and sitemap use a placeholder domain.');
  }
  return problems;
}
