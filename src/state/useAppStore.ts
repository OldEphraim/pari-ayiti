import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDb } from '../db/client';
import { applyLedgerEntry, getBalance } from '../db/balance';
import { Bet, createBet, listBets } from '../db/bets';
import { listAllMatches, Match } from '../db/matches';
import { refreshMatches, fetchScoresForDueMatches } from '../services/matchFetcher';
import { subscribe as subscribeConnectivity } from '../services/connectivity';
import { drain as drainSync } from '../services/syncWorker';
import { settleDueBets } from '../services/settlementWorker';
import { setMockFailuresRuntime } from '../api/mockBackend';
import { calculatePayout } from '../utils/odds';
import { uuid } from '../utils/uuid';
import { now } from '../utils/time';
import i18n, {
  currentLanguage,
  Language,
  setLanguage as setI18nLanguage,
} from '../i18n';

const MOCK_FAILURES_STORAGE_KEY = 'pari-ayiti.mock-failures';

export class BetError extends Error {
  constructor(
    public readonly code: 'insufficient_balance' | 'invalid_stake',
    message: string,
  ) {
    super(message);
    this.name = 'BetError';
  }
}

export interface PlaceBetInput {
  matchId: string;
  selection: 'home' | 'draw' | 'away';
  stakeMinor: number;
  oddsAtPlacement: number;
}

interface AppState {
  balanceMinor: number;
  matches: Match[];
  bets: Bet[];
  isOnline: boolean;
  lastFetchedAt: number | null;
  language: Language;
  mockFailuresEnabled: boolean;
  recentlyPlacedAt: number | null;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  setLanguage: (lang: Language) => Promise<void>;
  setMockFailuresEnabled: (enabled: boolean) => Promise<void>;
  refreshAll: () => Promise<void>;
  placeBet: (input: PlaceBetInput) => Promise<Bet>;
  clearRecentlyPlaced: () => void;
}

function deriveLastFetched(matches: Match[]): number | null {
  let latest: number | null = null;
  for (const m of matches) {
    if (m.last_fetched > 0 && (latest === null || m.last_fetched > latest)) {
      latest = m.last_fetched;
    }
  }
  return latest;
}

async function loadMockFailuresFromStorage(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(MOCK_FAILURES_STORAGE_KEY);
    return raw === 'true';
  } catch {
    return false;
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  balanceMinor: 0,
  matches: [],
  bets: [],
  isOnline: true,
  lastFetchedAt: null,
  language: 'ht',
  mockFailuresEnabled: false,
  recentlyPlacedAt: null,
  hydrated: false,

  hydrate: async () => {
    const db = await getDb();
    const [balance, bets, matches, mockFailures] = await Promise.all([
      getBalance(db),
      listBets(db),
      listAllMatches(db),
      loadMockFailuresFromStorage(),
    ]);
    setMockFailuresRuntime(mockFailures);
    set({
      balanceMinor: balance,
      bets,
      matches,
      lastFetchedAt: deriveLastFetched(matches),
      language: currentLanguage(),
      mockFailuresEnabled: mockFailures,
      hydrated: true,
    });
  },

  setLanguage: async (lang) => {
    await setI18nLanguage(lang);
    set({ language: lang });
  },

  setMockFailuresEnabled: async (enabled) => {
    setMockFailuresRuntime(enabled);
    try {
      await AsyncStorage.setItem(
        MOCK_FAILURES_STORAGE_KEY,
        enabled ? 'true' : 'false',
      );
    } catch {
      // Non-fatal: toggle still applies for the session.
    }
    set({ mockFailuresEnabled: enabled });
  },

  refreshAll: async () => {
    const db = await getDb();
    // refreshMatches silently no-ops when offline / no key / cache fresh.
    await refreshMatches(db);
    const [balance, matches, bets] = await Promise.all([
      getBalance(db),
      listAllMatches(db),
      listBets(db),
    ]);
    set({
      balanceMinor: balance,
      matches,
      bets,
      lastFetchedAt: deriveLastFetched(matches),
    });
  },

  placeBet: async (input) => {
    if (!Number.isInteger(input.stakeMinor) || input.stakeMinor <= 0) {
      throw new BetError(
        'invalid_stake',
        `stake must be a positive integer minor unit, got ${input.stakeMinor}`,
      );
    }
    const { balanceMinor } = get();
    if (input.stakeMinor > balanceMinor) {
      throw new BetError('insufficient_balance', 'stake exceeds balance');
    }
    const payoutMinor = calculatePayout(input.stakeMinor, input.oddsAtPlacement);
    const clientBetId = uuid();
    const placedAt = now();
    const db = await getDb();

    // Atomic: insert bet row + debit ledger entry. Either both succeed or
    // both roll back — CLAUDE.md §4.2.
    await db.transaction(async (tx) => {
      await createBet(tx, {
        client_bet_id: clientBetId,
        match_id: input.matchId,
        selection: input.selection,
        stake_htgn: input.stakeMinor,
        odds_at_placement: input.oddsAtPlacement,
        potential_payout_htgn: payoutMinor,
        placed_at: placedAt,
      });
      await applyLedgerEntry(
        tx,
        'debit_stake',
        -input.stakeMinor,
        clientBetId,
        placedAt,
      );
    });

    // Re-read from DB so Zustand stays a view layer, not a competing
    // source of truth.
    const [newBalance, newBets] = await Promise.all([
      getBalance(db),
      listBets(db),
    ]);
    const newBet = newBets.find((b) => b.client_bet_id === clientBetId);
    if (!newBet) {
      throw new Error('bet not found after insert — DB invariant violated');
    }
    set({
      balanceMinor: newBalance,
      bets: newBets,
      recentlyPlacedAt: Date.now(),
    });

    // Fire-and-forget drain + hydrate so the bet flows to PENDING_SETTLEMENT
    // (online) or stays PENDING_SYNC (offline) without blocking the UI.
    void runWorkersAndHydrate().catch((err: unknown) => {
      console.warn('[placeBet] post-sync failed:', err);
    });
    return newBet;
  },

  clearRecentlyPlaced: () => {
    set({ recentlyPlacedAt: null });
  },
}));

// Module-level subscriptions — fire once when the module loads so the
// store reflects connectivity + language changes without each screen
// having to wire its own listener.
subscribeConnectivity((online) => {
  useAppStore.setState({ isOnline: online });
});

i18n.on('languageChanged', (lng: string) => {
  if (lng === 'ht' || lng === 'fr') {
    useAppStore.setState({ language: lng });
  }
});

// Orchestrator: drain sync queue → fetch scores for due bets → settle
// anything that's now concluded → refresh store. Called on app boot, on
// offline→online transition, on app foreground, and fire-and-forget after
// each placeBet. Safe to invoke concurrently — the workers have their own
// re-entrancy guards.
export async function runWorkersAndHydrate(): Promise<void> {
  const db = await getDb();
  const syncSummary = await drainSync();
  await fetchScoresForDueMatches(db);
  const settleSummary = await settleDueBets();
  if (__DEV__) {
    if (!syncSummary.skipped && syncSummary.processed > 0) {
      console.log('[sync] drain:', syncSummary);
    }
    if (!settleSummary.skipped && settleSummary.processed > 0) {
      console.log('[settle] summary:', settleSummary);
    }
  }
  await useAppStore.getState().hydrate();
}
