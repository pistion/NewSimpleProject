/** DTO privacy tests — the customer view must never leak internals. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCustomerVpsDto, toAdminVpsDto, toCredentialsDto } from '../src/services/vpsDto.js';

const record = {
  id: 'svc-1',
  organizationId: 'org-1',
  createdByUserId: 'user-1',
  checkoutOrderId: 'order-1',
  provider: 'vultr',
  providerInstanceId: 'vultr-123',
  label: 'web-1',
  hostname: 'web-1',
  region: 'syd',
  plan: 'vc2-1c-1gb',
  osId: 2284,
  osName: 'Ubuntu 24.04 LTS x64',
  status: 'active',
  mainIp: '203.0.113.7',
  vcpuCount: 1,
  ramMb: 1024,
  diskGb: 25,
  monthlyCostCents: 600,
  markupPercent: 30,
  markupAmountCents: 180,
  totalPriceCents: 780,
  currency: 'USD',
  paypalOrderId: 'PP-1',
  paypalCaptureId: 'CAP-1',
  paymentStatus: 'completed',
  metadata: JSON.stringify({ connectionUsername: 'root', connectionPassword: 'secret-pass', vultrId: 'vultr-123' }),
  deletedAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
};

const FORBIDDEN_CUSTOMER_FIELDS = [
  'organizationId', 'createdByUserId', 'checkoutOrderId', 'providerInstanceId',
  'monthlyCostCents', 'markupPercent', 'markupAmountCents',
  'paypalOrderId', 'paypalCaptureId', 'connectionPassword', 'metadata',
];

test('customer DTO hides internal pricing, provider ids and credentials', () => {
  const dto = toCustomerVpsDto(record);
  for (const field of FORBIDDEN_CUSTOMER_FIELDS) {
    assert.equal(field in dto, false, `customer DTO must not include ${field}`);
  }
  assert.doesNotMatch(JSON.stringify(dto), /secret-pass|vultr-123/, 'customer DTO leaks internal values');
});

test('customer DTO keeps the fields the UI needs', () => {
  const dto = toCustomerVpsDto(record);
  assert.equal(dto.id, 'svc-1');
  assert.equal(dto.totalPriceCents, 780);
  assert.equal(dto.currency, 'USD');
  assert.equal(dto.status, 'active');
  assert.equal(dto.mainIp, '203.0.113.7');
  assert.equal(dto.connectionUsername, 'root');
  assert.equal(dto.osName, 'Ubuntu 24.04 LTS x64');
  assert.equal(dto.testMode, false);
});

test('admin DTO exposes the internal view', () => {
  const dto = toAdminVpsDto(record);
  assert.equal(dto.providerInstanceId, 'vultr-123');
  assert.equal(dto.monthlyCostCents, 600);
  assert.equal(dto.markupPercent, 30);
  assert.equal(dto.organizationId, 'org-1');
});

test('credentials DTO is the only path to the password', () => {
  const creds = toCredentialsDto(record);
  assert.equal(creds.username, 'root');
  assert.equal(creds.password, 'secret-pass');
  assert.equal(creds.host, '203.0.113.7');
});
