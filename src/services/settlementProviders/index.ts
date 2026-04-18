import { Bet } from '../../db/bets';

// SettlementProvider is the abstraction the settlement worker depends on.
// MockSettlementProvider is a pure placeholder — the worker itself handles
// ledger updates and bet-state transitions. A SolanaSettlementProvider
// lands in Phase 11.7 behind the same interface, selected by env var via
// the factory below (Phase 11.1 adds the branching).

export interface SettlementProviderRef {
  providerRef: string;
}

export interface SettlementProvider {
  escrow(bet: Bet): Promise<SettlementProviderRef>;
  settle(
    bet: Bet,
    outcome: 'won' | 'lost',
  ): Promise<SettlementProviderRef>;
}

export class MockSettlementProvider implements SettlementProvider {
  async escrow(bet: Bet): Promise<SettlementProviderRef> {
    return { providerRef: `mock-escrow-${bet.client_bet_id}` };
  }

  async settle(
    bet: Bet,
    _outcome: 'won' | 'lost',
  ): Promise<SettlementProviderRef> {
    return { providerRef: `mock-settle-${bet.client_bet_id}` };
  }
}

let cached: SettlementProvider | null = null;

export function getSettlementProvider(): SettlementProvider {
  if (cached) return cached;
  // Phase 11.1 will branch on Constants.expoConfig.extra.settlementProvider
  // and return a SolanaSettlementProvider stub when it's 'solana'. For now
  // we always return the mock.
  cached = new MockSettlementProvider();
  return cached;
}

// Test-only: reset the cached provider so different specs can swap impls.
export function __resetSettlementProvider(): void {
  cached = null;
}
