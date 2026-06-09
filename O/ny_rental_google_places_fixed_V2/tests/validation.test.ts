import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanString, validateAnalyticsEvent, validateLead } from '../lib/validation';

test('validateLead requires name and wechat', () => {
  const result = validateLead({});
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 400);
});

test('validateLead accepts a valid lead and caps long fields', () => {
  const result = validateLead({ name: 'Alice', wechat: 'alice_wx', notes: 'x'.repeat(2000) });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.lead.name, 'Alice');
    assert.equal(result.lead.notes.length, 1000);
    assert.equal(result.lead.source, 'site_lead_form');
  }
});

test('validateLead silently drops honeypot submissions', () => {
  const result = validateLead({ name: 'Bot', wechat: 'bot', website: 'http://spam.example' });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 200);
    assert.equal(result.silent, true);
  }
});

test('validateAnalyticsEvent rejects missing or malformed types', () => {
  assert.equal(validateAnalyticsEvent({}).ok, false);
  assert.equal(validateAnalyticsEvent({ type: 'Bad Type!' }).ok, false);
});

test('validateAnalyticsEvent accepts a well-formed event', () => {
  const result = validateAnalyticsEvent({ type: 'page_view', metadata: { mode: 'subway20', count: 3 } });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.event.type, 'page_view');
    assert.equal(result.event.metadata?.count, 3);
    assert.equal(result.event.metadata?.mode, 'subway20');
  }
});

test('cleanString strips control characters, trims, and caps length', () => {
  assert.equal(cleanString('  hi\nthere  ', 100), 'hi there');
  assert.equal(cleanString('toolong', 4), 'tool');
  assert.equal(cleanString(null, 10), '');
});
