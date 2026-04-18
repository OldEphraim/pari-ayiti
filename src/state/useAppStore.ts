import { create } from 'zustand';
import { getDb } from '../db/client';
import { applyLedgerEntry, getBalance } from '../db/balance';
import { Bet, createBet, listBets } from '../db/bets';
import { listUpcoming, Match } from '../db/matches';
import { refreshMatches } from '../services/matchFetcher';
import { subscribe as subscribeConnectivity } from '../services/connectivity';
import { calculatePayout } from '../utils/odds';
import { uuid } from '../utils/uuid';
import { now } from '../utils/time';
import i18n, {
  currentLanguage,
  Language,
  setLanguage as setI18nLanguage,
} from '../i18n';

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
  recentlyPlacedAt: number | null;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  setLanguage: (lang: Language) => Promise<void>;
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

export const useAppStore = create<AppState>((set, get) => ({
  balanceMinor: 0,
  matches: [],
  bets: [],
  isOnline: true,
  lastFetchedAt: null,
  language: 'ht',
  recentlyPlacedAt: null,
  hydrated: false,

  hydrate: async () => {
    const db = await getDb();
    const [balance, bets, matches] = await Promise.all([
      getBalance(db),
      listBets(db),
      listUpcoming(db),
    ]);
    set({
      balanceMinor: balance,
      bets,
      matches,
      lastFetchedAt: deriveLastFetched(matches),
      language: currentLanguage(),
      hydrated: true,
    });
  },

  setLanguage: async (lang) => {
    await setI18nLanguage(lang);
    // The i18n languageChanged listener below also fires; setting here is
    // just a belt-and-braces for the typical path.
    set({ language: lang });
  },

  refreshAll: async () => {
    const db = await getDb();
    // refreshMatches silently no-ops when offline / no key / cache fresh.
    await refreshMatches(db);
    const [balance, matches, bets] = await Promise.all([
      getBalance(db),
      listUpcoming(db),
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
      throw new BetError('invalid_stake', `stake must be a positive integer minor unit, got ${input.stakeMinor}`);
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
