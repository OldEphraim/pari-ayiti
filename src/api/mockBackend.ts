import Constants from 'expo-constants';
import { Bet } from '../db/bets';
import { uuid } from '../utils/uuid';
import { now } from '../utils/time';

// Fraction of calls that fail when failure mode is on. 80% → failures are
// demonstrably visible in a demo; the remaining 20% success rate lets the
// offline-queue demo show eventual convergence rather than infinite retry.
const FAILURE_RATE = 0.8;
const MIN_LATENCY_MS = 50;
const MAX_LATENCY_MS = 300;

export type ConfirmSuccess = {
  ok: true;
  serverBetId: string;
  confirmedAt: number;
};
export type ConfirmFailure = { ok: false; reason: string };
export type ConfirmResult = ConfirmSuccess | ConfirmFailure;

const envFailureFlag =
  Constants.expoConfig?.extra?.enableMockFailures === true;

let runtimeFailuresEnabled = false;

export function setMockFailuresRuntime(enabled: boolean): void {
  runtimeFailuresEnabled = enabled;
}

export function isMockFailuresActive(): boolean {
  return envFailureFlag || runtimeFailuresEnabled;
}

function randomLatencyMs(): number {
  return (
    MIN_LATENCY_MS +
    Math.floor(Math.random() * (MAX_LATENCY_MS - MIN_LATENCY_MS + 1))
  );
}

// Test-only seam. `confirm` completely replaces the confirmBet decision
// logic (bypasses both the idempotency map and the flaky-mode coin flip).
// `delayMs` overrides the simulated network latency so tests don't wait
// 50-300ms per call. Production code never sets these.
export interface MockBackendTestHooks {
  confirm?: (bet: Bet) => Promise<ConfirmResult>;
  delayMs?: number;
}

let testHooks: MockBackendTestHooks = {};

export function __setTestHooks(hooks: MockBackendTestHooks): void {
  testHooks = hooks;
}

function delay(ms: number): Promise<void> {
  const effective = testHooks.delayMs ?? ms;
  return new Promise((resolve) => setTimeout(resolve, effective));
}

// Idempotency store keyed by client_bet_id. Stores the ConfirmSuccess we
// returned the first time we saw that bet; subsequent calls with the same
// id return the same success (simulating backend idempotency).
const seen = new Map<string, ConfirmSuccess>();

export async function confirmBet(bet: Bet): Promise<ConfirmResult> {
  await delay(randomLatencyMs());

  if (testHooks.confirm) {
    return testHooks.confirm(bet);
  }

  const existing = seen.get(bet.client_bet_id);
  if (existing) return existing;

  if (isMockFailuresActive() && Math.random() < FAILURE_RATE) {
    return { ok: false, reason: 'simulated network error' };
  }

  const success: ConfirmSuccess = {
    ok: true,
    serverBetId: `server-${uuid()}`,
    confirmedAt: now(),
  };
  seen.set(bet.client_bet_id, success);
  return success;
}

export async function fetchBetStatus(
  client_bet_id: string,
): Promise<ConfirmResult | null> {
  await delay(randomLatencyMs());
  return seen.get(client_bet_id) ?? null;
}

// Test-only: wipe the idempotency map, runtime flag, and test hooks
// between specs.
export function __resetMockBackend(): void {
  seen.clear();
  runtimeFailuresEnabled = false;
  testHooks = {};
}
