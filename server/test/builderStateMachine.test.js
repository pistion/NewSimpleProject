import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECT_STATES,
  assertTransition,
  isLegalTransition,
  legalTargets,
} from '../src/builder/builderStateMachine.js';

test('every documented project state is known', () => {
  for (const state of [
    'DRAFT', 'TEMPLATE_SELECTED', 'PLANNING', 'PLAN_READY', 'ANSWER_SHEET_REVIEW',
    'GENERATION_QUEUED', 'GENERATING', 'PREVIEW_READY', 'REVISION_REQUESTED',
    'APPROVED', 'DEPLOYMENT_QUEUED', 'BUILDING', 'LIVE', 'GENERATION_FAILED',
    'DEPLOYMENT_FAILED', 'BILLING_SETUP_FAILED', 'SUSPENDED', 'ARCHIVED',
  ]) {
    assert.ok(PROJECT_STATES.includes(state), `${state} missing from PROJECT_STATES`);
  }
});

test('happy-path template lifecycle is legal', () => {
  const path = [
    'TEMPLATE_SELECTED', 'PLANNING', 'ANSWER_SHEET_REVIEW', 'GENERATION_QUEUED',
    'GENERATING', 'PREVIEW_READY', 'APPROVED', 'DEPLOYMENT_QUEUED', 'BUILDING', 'LIVE',
  ];
  for (let i = 0; i < path.length - 1; i++) {
    assert.ok(isLegalTransition(path[i], path[i + 1]), `${path[i]} -> ${path[i + 1]} must be legal`);
  }
});

test('self-transitions are legal (idempotent saves/retries)', () => {
  assert.ok(isLegalTransition('PLANNING', 'PLANNING'));
  assert.ok(isLegalTransition('GENERATING', 'GENERATING'));
});

test('illegal jumps are rejected with 409 details', () => {
  const illegal = [
    ['TEMPLATE_SELECTED', 'LIVE'],
    ['DRAFT', 'APPROVED'],
    ['GENERATING', 'APPROVED'],
    ['GENERATION_QUEUED', 'PREVIEW_READY'],
    ['LIVE', 'PLANNING'],
    ['ARCHIVED', 'PLANNING'],
    ['GENERATING', 'DEPLOYMENT_QUEUED'],
  ];
  for (const [from, to] of illegal) {
    assert.equal(isLegalTransition(from, to), false, `${from} -> ${to} must be illegal`);
    assert.throws(() => assertTransition(from, to), (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'BUILDER_ILLEGAL_TRANSITION');
      assert.deepEqual(err.details.legal, legalTargets(from));
      return true;
    });
  }
});

test('unknown states are never legal', () => {
  assert.equal(isLegalTransition('NOT_A_STATE', 'PLANNING'), false);
  assert.equal(isLegalTransition('PLANNING', 'NOT_A_STATE'), false);
});

test('failure states can recover', () => {
  assert.ok(isLegalTransition('GENERATION_FAILED', 'GENERATION_QUEUED'));
  assert.ok(isLegalTransition('DEPLOYMENT_FAILED', 'DEPLOYMENT_QUEUED'));
  assert.ok(isLegalTransition('BILLING_SETUP_FAILED', 'DEPLOYMENT_QUEUED'));
  assert.ok(isLegalTransition('SUSPENDED', 'LIVE'));
});

test('archive is terminal', () => {
  assert.deepEqual(legalTargets('ARCHIVED'), []);
});
