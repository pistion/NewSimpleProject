/** Pure rule tests for the shared ServiceAccess decision logic. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAccess } from '../src/services/serviceAccessService.js';

const baseRow = {
  id: 'row-1',
  userId: 'user-a',
  accessStatus: 'active',
  billingStatus: 'paid',
  adminStatus: 'allowed',
  expiresAt: null,
};

test('missing row is denied as not found', () => {
  const r = evaluateAccess(null, 'user-a');
  assert.equal(r.allowed, false);
  assert.equal(r.code, 'SERVICE_NOT_FOUND');
});

test('owner mismatch is denied', () => {
  const r = evaluateAccess(baseRow, 'user-b');
  assert.equal(r.allowed, false);
  assert.equal(r.code, 'SERVICE_OWNER_MISMATCH');
});

test('admin block wins over active status', () => {
  const r = evaluateAccess({ ...baseRow, adminStatus: 'blocked' }, 'user-a');
  assert.equal(r.code, 'SERVICE_ADMIN_BLOCKED');
});

test('review_required is denied as under review', () => {
  const r = evaluateAccess({ ...baseRow, adminStatus: 'review_required' }, 'user-a');
  assert.equal(r.code, 'SERVICE_UNDER_REVIEW');
});

test('non-active access status is denied', () => {
  for (const accessStatus of ['pending', 'suspended', 'cancelled', 'deleted']) {
    const r = evaluateAccess({ ...baseRow, accessStatus }, 'user-a');
    assert.equal(r.allowed, false, accessStatus);
    assert.equal(r.code, 'SERVICE_NOT_ACTIVE');
  }
});

test('bad billing status is denied; trial/free/paid allowed', () => {
  for (const billingStatus of ['overdue', 'failed', 'cancelled', 'pending']) {
    const r = evaluateAccess({ ...baseRow, billingStatus }, 'user-a');
    assert.equal(r.code, 'SERVICE_BILLING_ISSUE', billingStatus);
  }
  for (const billingStatus of ['paid', 'trial', 'free']) {
    assert.equal(evaluateAccess({ ...baseRow, billingStatus }, 'user-a').allowed, true, billingStatus);
  }
});

test('expired row is denied', () => {
  const r = evaluateAccess({ ...baseRow, expiresAt: new Date(Date.now() - 1000) }, 'user-a');
  assert.equal(r.code, 'SERVICE_EXPIRED');
});

test('future expiry with active/paid row is allowed', () => {
  const r = evaluateAccess({ ...baseRow, expiresAt: new Date(Date.now() + 86400000) }, 'user-a');
  assert.equal(r.allowed, true);
});
