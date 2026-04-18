# STEPS.md — Pari Ayiti Build Plan

> Execution document. Every step is atomic, has a clear acceptance check, and ends in a commit. Read CLAUDE.md first. If a step seems out of scope, re-read §2 and §11 of CLAUDE.md.

**Timeline assumption:** Friday evening kickoff → Saturday Brief 1 ships + Solana scaffolded → Sunday AM/noon Solana integrated → Sunday PM polish + capstone pivot. **Both briefs are required.** Solana is no longer optional; if it collapses, the `v1-production-ready` tag at Saturday midnight is the fallback submission. See Timeline Checkpoints at the bottom.

**Convention:** Every phase ends with `✅ Acceptance:` checks and a `git commit -m "…"` line. If an acceptance check fails, DO NOT proceed.

---

## Phase 0: Environment & Scaffolding (30 min)

### 0.1 Verify prerequisites
- Node 20+ installed (`node -v`)
- `npm` or `pnpm` working
- `gh` CLI installed and authenticated (`gh auth status`)
- Android Studio installed with an emulator (or a physical Android device with USB debugging)
- `npx expo --version` works
- Git configured with OldEphraim identity

### 0.2 Create the Expo app
```bash
npx create-expo-app@latest pari-ayiti --template blank-typescript
cd pari-ayiti
```
Record the exact Expo SDK version printed during creation — write it to DECISION_LOG.md as entry **D-001 ("Expo SDK version pinned at X.Y.Z at kickoff on [date]")**.

### 0.3 Initialize git + first commit
```bash
git init
git add -A
git commit -m "chore: initial Expo TypeScript scaffold"
gh repo create pari-ayiti --public --source=. --remote=origin --push
```

### 0.4 Add `.env` and `.env.example`
```
# .env.example
ODDS_API_KEY=
ENABLE_MOCK_FAILURES=false
SETTLEMENT_PROVIDER=mock
```
- Add `.env` to `.gitignore`.
- Create `.env` with a real key (get one free at the-odds-api.com) or leave empty for fixture-only mode.

### 0.5 Directory scaffolding
Create empty directories per CLAUDE.md §4.6:
```
/src/db /src/api /src/api/fixtures /src/state /src/services /src/services/settlementProviders /src/i18n/locales /src/ui/components /src/utils /tests
```

### 0.6 Install core dependencies
```bash
npx expo install expo-sqlite expo-constants expo-router @react-native-community/netinfo react-native-get-random-values
npm install zustand i18next react-i18next date-fns uuid
npm install -D @types/uuid jest @testing-library/react-native jest-expo ts-jest better-sqlite3 @types/better-sqlite3
```

### 0.7 Configure expo-router & critical crypto polyfill
- Update `app.json` with the router plugin
- Create `/app/_layout.tsx` and `/app/(tabs)/_layout.tsx` stubs
- **CRITICAL:** The very first line of `/app/_layout.tsx` must be `import 'react-native-get-random-values';` — before any other import. Without this, `uuid/v4` throws in React Native.

✅ **Acceptance:** `npx expo start` launches without errors; emulator shows a blank "Hello" screen.
✅ **Commit:** `chore: scaffold expo-router, directories, and dependencies`

---

## Phase 1: Design System & Theme (45 min)

### 1.1 Create `/src/ui/theme.ts`
```typescript
export const colors = {
  primary: '#00209F',      // Haitian flag blue
  accent: '#D21034',       // Haitian flag red
  bg: '#FAFAF7',
  surface: '#FFFFFF',
  text: '#1A1A1A',
  textMuted: '#666666',
  border: '#E5E5E5',
  pendingSync: '#F59E0B',
  pendingSettlement: '#3B82F6',
  won: '#0F766E',
  lost: '#6B7280',
  void: '#9CA3AF',
  offline: '#78716C',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 4, md: 8, lg: 12, pill: 999 };
export const type = {
  h1: { fontSize: 24, fontWeight: '700' as const },
  h2: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  small: { fontSize: 14, fontWeight: '400' as const },
  mono: { fontSize: 14, fontFamily: 'monospace' },
};
export const motion = { maxMs: 250 };  // animation cap per CLAUDE.md §5
```

### 1.2 Create minimal components in `/src/ui/components/`
- `Button.tsx` — primary / secondary / ghost variants; loading state; accessible
- `Card.tsx` — surface with padding and radius
- `Pill.tsx` — small rounded label for bet status, offline indicator
- `Banner.tsx` — full-width top banner
- `Text.tsx` — wraps RN Text with theme-aware variant prop
- `Screen.tsx` — SafeAreaView wrapper with consistent padding

Each component: named export only, typed props interface, no inline StyleSheet in screens.

### 1.3 Component gallery (dev-only)
Create `/app/dev/gallery.tsx` showing every component variant. Link from Settings footer behind a `__DEV__` check. All gallery labels are prefixed `DEV:` per CLAUDE.md §8. DEV-prefixed gallery strings are English-only and are **not** added to the i18n files — the `DEV:` prefix is itself the exemption marker per CLAUDE.md §8.

✅ **Acceptance:** Settings → DEV: Component gallery renders all components cleanly on emulator or device.
✅ **Commit:** `feat(ui): design system and component primitives`

---

## Phase 2: Database Layer (1 hour)

### 2.1 Schema file
Create `/src/db/schema.ts`:
- Export `migrations: Migration[]` where each migration is `{version: number, sql: string[]}`
- Version 1 contains the full schema from CLAUDE.md §4.5, including `bets.sync_attempts INTEGER NOT NULL DEFAULT 0` and `bets.onchain_tx_id TEXT`
- Version 1 also inserts the singleton `balance (id=1, htgn_minor=500000)`
- Version 1 inserts a matching `balance_ledger` row with `kind='initial_grant', amount_htgn_minor=500000`
- The ledger invariant is `balance.htgn_minor == SUM(balance_ledger.amount_htgn_minor)` — the initial grant is a ledger row, not an additive constant.

### 2.2 DB interface and implementations
Create `/src/db/client.ts`:
- Define `interface DB { query<T>(sql, params?): T[]; run(sql, params?): RunResult; transaction<T>(fn: (tx: DB) => T): T; }`
- Implement `ExpoSqliteDB` (production) wrapping `expo-sqlite`
- Implement `BetterSqliteDB` (tests) wrapping `better-sqlite3` with `':memory:'` by default
- Both runners consume `migrations` from schema.ts; track `schema_version` in a `meta(key, value)` table
- On dev-mode startup, production calls `reconcileBalance()` and throws loudly if the invariant fails

### 2.3 DAOs (depend only on the `DB` interface)
Create:
- `/src/db/matches.ts` — `upsertMatches(db, matches[])`, `listUpcoming(db)`, `getMatch(db, id)`, `markConcluded(db, id, home_score, away_score)`
- `/src/db/bets.ts` — `createBet(db, bet)`, `updateBetStatus(db, client_bet_id, status, fields)`, `listBets(db, filter?)`, `getPendingSync(db)`, `getPendingSettlementDue(db, now)`, `incrementSyncAttempts(db, client_bet_id)`
- `/src/db/balance.ts` — `getBalance(db)`, `applyLedgerEntry(db, kind, amount_minor, related_bet_id?)` — transactional: insert ledger + update balance in one transaction; returns new balance

### 2.4 `reconcileBalance()` helper
Implement `reconcileBalance()` per CLAUDE.md §4.5.

✅ **Acceptance:** A scratch test script (run via `ts-node` or temporarily in-app) creates a bet, applies a debit, settles as a win, applies a credit, and `reconcileBalance()` passes. Delete scratch; real tests come in Phase 8.
✅ **Commit:** `feat(db): schema, DB interface, migrations, DAOs`

---

## Phase 3: Utilities (30 min)

### 3.1 `/src/utils/money.ts`
- `toMinor(htgn: number): number` — multiplies by 100, rounds half-even, returns integer
- `fromMinor(minor: number): number` — divides by 100
- `formatHTGN(minor: number, locale: 'ht' | 'fr'): string` — e.g., "G 1,250.00"
- Throws on non-integer minor

### 3.2 `/src/utils/odds.ts`
- `impliedProbability(decimalOdds: number): number`
- `calculatePayout(stakeMinor: number, decimalOdds: number): number` — returns `floor(stakeMinor * decimalOdds)`; document the rounding-down decision (house-favoring; user-favoring would be round-up) in DECISION_LOG.md

### 3.3 `/src/utils/uuid.ts`
- Re-exports `uuid/v4`. Works because `react-native-get-random-values` is imported in `_layout.tsx` per Phase 0.7.

### 3.4 `/src/utils/time.ts`
- `now(): number` — returns unix seconds (single source of truth; mockable)
- `formatDate(unixSeconds, locale)` — wraps `date-fns` with the `fr` locale for BOTH `ht` and `fr` UIs. Do NOT build a Creole substitution table — document this concession in DECISION_LOG.md.

✅ **Acceptance:** Utilities import cleanly and are used in one screen or service without error.
✅ **Commit:** `feat(utils): money, odds, uuid, time helpers`

---

## Phase 4: i18n (45 min)

### 4.1 Set up i18next
`/src/i18n/index.ts` initializes i18next with `ht` as default, `fr` as fallback, NO `en`.

### 4.2 Seed `/src/i18n/locales/ht.json`
```json
{
  "app.title": "Pari Ayiti",
  "tabs.matches": "Match yo",
  "tabs.history": "Istwa",
  "tabs.settings": "Paramèt",
  "matches.loading": "N ap chèche match yo…",
  "matches.offline": "San entènèt — done yo soti nan {{time}}",
  "matches.empty": "Poko gen match",
  "bet.home": "Ekip lakay",
  "bet.draw": "Egalite",
  "bet.away": "Ekip deyò",
  "bet.stake": "Mize",
  "bet.potentialPayout": "Sa w ap genyen si w pran l",
  "bet.place": "Mete pari a",
  "bet.confirm": "Konfime pari a",
  "bet.placed": "Pari w la anrejistre",
  "bet.pendingSync": "K ap tann koneksyon",
  "bet.pendingSettlement": "K ap tann rezilta",
  "bet.won": "Ou genyen",
  "bet.lost": "Ou pèdi",
  "bet.voidRefunded": "Pari a anile, lajan w tounen",
  "bet.insufficientBalance": "Ou pa gen ase HTGN pou pari sa a kounye a",
  "bet.bigBetWarning": "Sa se plis pase 25% balans ou. Ou sèten?",
  "balance.label": "Balans",
  "settings.language": "Lang",
  "settings.dailyLimit": "Limit chak jou",
  "settings.flakyNetwork": "DEV: Simile rezo fèb",
  "settings.responsibleNote": "Pari se pou plezi. Si sa sispann fè w plezi, pran yon poz.",
  "history.empty": "Ou poko mete okenn pari",
  "offline.banner": "San entènèt — {{count}} pari k ap tann",
  "dev.simulateResult": "DEV: Simile rezilta"
}
```
Note the `{{count}}` interpolation on `offline.banner`.

**French plural handling:** Creole has no morphological plural, so `{{count}} pari k ap tann` is grammatical for any count. French is not — grammatically, `1 pari en attente` vs. `3 paris en attente` (note the "paris" plural). We accept the always-plural French form for the demo; proper pluralization via i18next's `_one` / `_other` keys is deferred.

### 4.3 Seed `/src/i18n/locales/fr.json`
Same keys, French values.

### 4.4 Language toggle in Settings
Two buttons: "Kreyòl" / "Français". Persists to AsyncStorage. Applies immediately.

✅ **Acceptance:** Switching language updates every label live. No non-DEV English in user-facing screens.
✅ **Commit:** `feat(i18n): Creole primary, French secondary, no English in UI`

---

## Phase 5: Odds API Integration & Fixture (1 hour)

**Framing:** Fixture is the primary demo data source. Live API is secondary.

### 5.1 The Odds API client (secondary path)
`/src/api/odds.ts`:
```typescript
export async function fetchWorldCupOdds(sportKey: string): Promise<NormalizedMatch[]>;
export async function fetchWorldCupScores(sportKey: string, daysFrom: number): Promise<NormalizedScore[]>;
export async function discoverSportKey(): Promise<string | null>;  // hits /v4/sports to find the current key string
```
- Normalize bookmaker odds into a single best-odds triple (highest price per outcome, or first bookmaker — pick one, document in DECISION_LOG.md)
- Handles 401 / 429 / 5xx by returning `{ok: false, reason}`; never throws

### 5.2 Fixture (primary path) — `/src/api/fixtures/worldCupMatches.json`
Use Haiti's **actual Group C**: Haiti, Brazil, Morocco, Scotland (verify from the FIFA draw at project start; if the draw has changed, update the fixture accordingly and note in DECISION_LOG.md).

Hand-curated realistic odds (decimal). In the JSON, `home_team` / `away_team` are nominal designations for data purposes; odds correspond to each listed team and a draw:

| Match | home_team → odds_home | draw → odds_draw | away_team → odds_away |
|---|---|---|---|
| Haiti vs. Brazil | Haiti → 17.0 | 8.0 | Brazil → 1.15 |
| Haiti vs. Morocco | Haiti → 5.5 | 3.5 | Morocco → 1.65 |
| Haiti vs. Scotland | Haiti → 3.5 | 3.2 | Scotland → 2.1 |

Plus 3 additional matches from other groups (pick real teams, approximate odds) to make the list feel populated. Verify the odds shape against any live bookmaker at project start if possible.

One of the fixture matches should have `status='concluded'` with `home_score` and `away_score` populated so the reviewer sees a settled historical match in the bet-history flow on first run.

### 5.3 Orchestration
`/src/services/matchFetcher.ts`:
- `loadInitialMatches()`: on first launch, loads fixture unconditionally into SQLite (seeds the demo)
- `refreshMatches()`: if cache > 30 min old AND online AND API key present, fetches from live API and merges (not replaces) into SQLite
- `fetchScoresForDueMatches()`: queries PENDING_SETTLEMENT bets, derives matches to check, fetches scores, updates matches table. Does NOT settle — that's the settlement worker

### 5.4 Connectivity service
`/src/services/connectivity.ts`: wraps NetInfo, exposes `isOnline()` promise and online/offline subscription.

✅ **Acceptance:** Fresh install → matches list populates within 1.5s of first paint from fixture. Pull-to-refresh works. Airplane mode doesn't break the UI.
✅ **Commit:** `feat(api): fixture-primary data, Odds API secondary, connectivity`

---

## Phase 6: State & Screens — Match Browsing (1 hour)

### 6.1 Zustand store
`/src/state/useAppStore.ts`:
```typescript
type AppState = {
  balanceMinor: number;
  matches: Match[];
  bets: Bet[];
  isOnline: boolean;
  lastFetchedAt: number | null;
  language: 'ht' | 'fr';
  setLanguage: (lang: 'ht' | 'fr') => void;
  refreshAll: () => Promise<void>;
  placeBet: (input: PlaceBetInput) => Promise<Bet>;
};
```
- `refreshAll()` calls matchFetcher, re-reads from SQLite, updates state
- `placeBet()` validates against `balanceMinor` directly; the debit is applied atomically in the same SQLite transaction as the bet insert (see CLAUDE.md §4.2), so over-subscription is structurally impossible

### 6.2 `/app/(tabs)/index.tsx` (Matches list)
- Header: balance pill (displays `balanceMinor`) + offline banner if offline
- Match list: card per match with home/away, commence time (Creole UI with French-formatted date), three odds buttons
- Tap → navigate to `/match/[id]`
- Pull-to-refresh calls `refreshAll()`

### 6.3 `/app/match/[id].tsx` (Match detail + bet placement)
- Shows match details and current odds
- User selects outcome → numeric stake input (HTGN minor-unit-safe)
- Shows potential payout live
- "Confirm" triggers `placeBet()`
- bigBetWarning if stake > 25% of `balanceMinor`; 2-tap confirm
- insufficientBalance if stake > `balanceMinor`
- Post-placement: success state with pill and returns to list

✅ **Acceptance:** User can browse, tap, place a bet, see it in history with correct status and balance decrement.
✅ **Commit:** `feat(screens): match browsing and bet placement`

---

## Phase 7: Sync & Settlement Workers (1.5 hours)

### 7.1 Mock backend
`/src/api/mockBackend.ts`:
- `confirmBet(bet: Bet): Promise<ConfirmResult>` — 50-300ms delay via `setTimeout`; failure rate depends on `ENABLE_MOCK_FAILURES` env var AND/OR a runtime Zustand flag toggled by the "DEV: Simile rezo fèb" Settings switch. Default is no failures.
- `fetchBetStatus(client_bet_id): Promise<Status | null>` — for reconciliation after reconnect; returns server's recorded status for idempotency key
- Failures are always **retryable** (see CLAUDE.md §4.4)

### 7.2 Sync worker
`/src/services/syncWorker.ts`:
- `drain()`: loops over PENDING_SYNC bets; for each, calls `mockBackend.confirmBet()`. On ok → PENDING_SETTLEMENT. On failure → increment `sync_attempts` via DAO (column already exists in schema from Phase 2.1). After 5 failures → transition to VOID_REFUNDED and apply a `refund_void` ledger entry.
- Throttled: max 1 concurrent sync operation
- Triggered on: app foreground, connectivity regained, successful bet placement (fire-and-forget)

### 7.3 Settlement worker
### 7.3 SettlementProvider interface + MockSettlementProvider + Settlement worker

**First, create the settlement abstraction.** This has to exist before the settlement worker can depend on it, and before Phase 8.3 can test against it.

Create `/src/services/settlementProviders/index.ts`:
```typescript
export interface SettlementProvider {
  escrow(bet: Bet): Promise<{providerRef: string}>;
  settle(bet: Bet, outcome: 'won' | 'lost'): Promise<{providerRef: string}>;
}
```

Create `/src/services/settlementProviders/MockSettlementProvider.ts`:
- `escrow(bet)`: no-op, returns `{providerRef: 'mock-' + bet.client_bet_id}`
- `settle(bet, outcome)`: pure-SQLite — the worker (below) applies the credit ledger if `outcome === 'won'`; provider itself just returns `{providerRef: 'mock-settle-' + bet.client_bet_id}`

**Then, the settlement worker.** Create `/src/services/settlementWorker.ts`:
- Takes a `SettlementProvider` via constructor; default is `MockSettlementProvider`
- `settleDueBets()`: queries bets in PENDING_SETTLEMENT whose match's `commence_time + 7200s` < now; ensures scores; if concluded, determines winner; calls `provider.settle(bet, outcome)`; transitions bet to SETTLED_WON or SETTLED_LOST; applies credit ledger if won
- Scoring logic: `home_score > away_score` → home wins; equal → draw; else away wins
- Payout on win: `potential_payout_htgn` from the bet row — DO NOT recompute with current odds
- Triggered on: app foreground, connectivity regained, dev-sim button

The `SolanaSettlementProvider` slots into the same interface in Phase 11.7. Nothing in Phase 7–10 needs to know about it.

### 7.4 Dev-sim button
On `/app/(tabs)/history.tsx`, for each bet in PENDING_SETTLEMENT, add a `__DEV__`-only "DEV: Simile rezilta" control opening a sheet with three buttons (home wins / draw / away wins). Tapping sets match scores to a matching fabricated result (2-1 / 1-1 / 1-2) and runs `settleDueBets()`.

### 7.5 Connectivity-triggered drains
Subscribe to NetInfo in `/app/_layout.tsx`. On offline→online: run `syncWorker.drain()` then `settlementWorker.settleDueBets()`.

✅ **Acceptance:**
- Bet placed online → PENDING_SETTLEMENT immediately
- Bet placed in airplane mode → PENDING_SYNC; offline banner shows count
- Airplane off → bet transitions to PENDING_SETTLEMENT within seconds, visibly
- Dev-sim a result → bet settles; balance credited on wins

✅ **Commit:** `feat(workers): sync and settlement with offline queue`

---

## Phase 8: Tests (45 min)

Exactly four files. All use `BetterSqliteDB` via the `DB` interface (Phase 2.2). No `expo-sqlite` mocking needed.

### 8.1 `/tests/money.test.ts`
- 1000 random HTGN values round-trip through toMinor/fromMinor, zero drift
- Edge cases: 0, 0.01, 99999999.99

### 8.2 `/tests/bets.test.ts`
- Valid state transitions asserted
- Invalid transitions rejected (e.g., PENDING_SYNC → SETTLED_WON directly)
- Idempotent `createBet` on same `client_bet_id` → one row

### 8.3 `/tests/settlement.test.ts`
- Create a match, create bets on all three outcomes, mark match concluded with home win, run `settleDueBets()` against `MockSettlementProvider`
- Assert: home bet → SETTLED_WON with correct payout; draw → SETTLED_LOST; away → SETTLED_LOST
- Assert exactly one `credit_winnings` ledger entry matching `potential_payout_htgn`

### 8.4 `/tests/offlineQueue.test.ts`
- Force `ENABLE_MOCK_FAILURES=true` for this test
- Create 3 bets while mock is 100% failing
- Assert all 3 in PENDING_SYNC with incrementing `sync_attempts`
- Force success, run `drain()` → all 3 PENDING_SETTLEMENT
- Force permanent failure on one (5 attempts) → VOID_REFUNDED with matching refund ledger entry

✅ **Acceptance:** `npm test` passes, all four green.
✅ **Commit:** `test: bet state machine, settlement, offline queue, money`

---

## Phase 9: Balance Ledger Screen & Dignity Polish (45 min)

### 9.1 Balance ledger screen
`/app/ledger.tsx` (linked from Settings):
- Every `balance_ledger` entry in reverse chronological order
- Row: kind (localized), amount (signed, colored), timestamp, related bet if any
- This is the auditability signal for the reviewer

### 9.2 Responsible gambling touches
- Settings: daily stake limit control, default 1000 HTGN
- On placeBet, if today's total stakes would exceed the limit → gentle warning (not block)
- Settings footer: `settings.responsibleNote`

### 9.3 Data usage counter (skip if > 15 min)
- Track bytes fetched from Odds API in AsyncStorage; reset daily
- Settings shows "Done w itilize jodi a: X KB"

### 9.4 Offline banner polish
- Banner shows `offline.banner` with current count of pending-sync bets (i18next `{{count}}` interpolation)
- Auto-hides with a slide-down animation capped at 250ms when back online

✅ **Acceptance:** Ledger correct; daily-limit warning works; offline banner behaves and animates correctly.
✅ **Commit:** `feat: balance ledger, responsible gambling, offline polish`

---

## Phase 10: Brief 1 Build + Tag (2 hours)

### 10.1a Kick off EAS build (first — runs in background ~10-15 min)
```bash
npm install -g eas-cli
eas login
eas build:configure
# Ensure eas.json "preview" profile produces APK, not AAB
eas build -p android --profile preview
```
Let this run in the background while you work on the following subsections. Come back when the build link appears in the terminal.

### 10.1b After build completes: tag, release, attach APK
Once EAS finishes and the APK URL is in hand:
```bash
git tag v1-production-ready
git push --tags
gh release create v1-production-ready --title "Pari Ayiti v1 — Brief 1 complete" --notes "See DECISION_LOG.md"
# Download the APK from EAS and attach it:
gh release upload v1-production-ready ./pari-ayiti.apk
```
The tag must exist before `gh release create` is called; that is why tagging happens here and not at the end of the phase.

### 10.2 README.md (stub only)
Create a minimal README.md with placeholders for: mission alignment, architecture overview, run instructions, APK link, Loom link, DECISION_LOG reference. **Actual README content is written as the first step of Phase 12 — out of scope for this phase.** Just ensure the file exists and links to the APK/repo are correct.

### 10.3 DECISION_LOG.md
Start the decision log with 10-12 entries. Template:
```
## D-NNN — [Title]
**Context:** [what problem or fork in the road]
**Decision:** [what was chosen]
**Why:** [reasoning]
**Tradeoff:** [what we gave up]
```

Required entries at minimum:
- D-001: Expo SDK version pinned (recorded in Phase 0.2)
- Zustand over Redux
- Debit-at-placement model: bets immediately reduce `balance.htgn_minor` in the same transaction as the bet insert, so over-subscription is structurally impossible without a separate projection layer
- SQLite over MMKV; DB interface abstraction for testability
- Integer minor units for all money
- Fixture-primary, API-secondary data path
- Haitian Creole primary, no English in UI (except DEV-prefixed strings)
- Mock backend only fails retryably; REJECTED state is future extension
- Floor rounding on payouts (house-favoring; documented tradeoff)
- `date-fns` French locale used for Creole UI (pragmatic concession)
- French pluralization deferred; demo uses always-plural form
- Sòl/group-bet de-scoped to FUTURE_WORK.md; see that file for the design sketch

### 10.4 FUTURE_WORK.md
Write a ~150-word design sketch for the sòl/group-bet feature: the ROSCA framing (Haitian sòl as the cultural anchor), the data model (`bet_groups(id, name, creator_id, target_pool_minor, status)` + `group_members(group_id, client_bet_id)`), the UX (share link / QR from match detail; friends contribute stakes to a pool), and proportional settlement (winnings distributed in proportion to each member's contribution). FUTURE_WORK.md is the home for any other deferred items surfaced during the build — keep adding to it as things get cut.

### 10.5 Loom walkthrough script (~4 min)
Open with the demo itself — no meta-framing. The mission framing lands in the last 30 seconds.

1. (60s) Cold open: "Here's Pari Ayiti — a betting app for 2G Haiti, denominated in HTGN." App tour: language toggle (Creole ↔ French), browse fixture matches, tap Haiti vs. Brazil, place a 50 HTGN bet on Haiti (the 17-to-1 longshot).
2. (60s) Airplane mode on: place another bet → PENDING_SYNC; offline banner shows count; balance reflects the debit immediately.
3. (45s) Airplane mode off: watch bets sync and transition to PENDING_SETTLEMENT.
4. (45s) Dev-sim a result (Brazil wins 3-0) → the Haiti bet settles LOST; balance ledger screen shows every entry; invariant holds.
5. (30s) Close: map back to Nclusion's three pillars (stablecoin rails, community traditions via Creole-first UX, agency-banking-ready offline architecture). "Brief 2 (Solana) is on the same codebase — happy to walk through that separately or now."

Record on physical Android if possible; emulator acceptable. Upload to Loom, link in README stub.

✅ **Acceptance:** APK downloadable from the GitHub release; Loom recorded and linked; DECISION_LOG.md and FUTURE_WORK.md populated; both briefs' must-haves from CLAUDE.md §2 items 1-6 are green; `v1-production-ready` tag pushed.
✅ **Commit:** `docs: DECISION_LOG, FUTURE_WORK, README stub, demo assets`

---

## 🚧 Saturday Midnight Gate 🚧

At this point you have a submittable Brief 1. **Before stopping for the night, also complete Phase 11.1-11.2 (env-var switch + Solana toolchain).** That way Sunday starts with the provider switch already wired up and the Anchor toolchain ready — you pick up with program implementation.

If it's past 2 AM and you still haven't scaffolded Solana, sleep anyway. Scaffold Sunday first thing.

---

## Phase 11: Solana HTGN Settlement (Brief 2) — required (3-4 hours)

> This is not stretch — it's Brief 2's core requirement. Treat chain calls as second-class citizens to the UI: they live only in the worker layer and never block render.

### 11.1 Provider env-var switch (Saturday evening)
The `SettlementProvider` interface and `MockSettlementProvider` already exist from Phase 7.3. Phase 11.1 is just the env-var plumbing that lets `SolanaSettlementProvider` slot in at Phase 11.7.

- Read `SETTLEMENT_PROVIDER` (values: `mock` | `solana`; default `mock`) from `.env` via `expo-constants` at app start
- Build a factory in `/src/services/settlementProviders/index.ts`:
  ```typescript
  export function getSettlementProvider(): SettlementProvider {
    const kind = Constants.expoConfig?.extra?.settlementProvider ?? 'mock';
    if (kind === 'solana') return new SolanaSettlementProvider();  // stub for now; implemented in 11.7
    return new MockSettlementProvider();
  }
  ```
- Create a stub `SolanaSettlementProvider.ts` that throws `new Error('SolanaSettlementProvider not yet implemented — complete Phase 11.7')` from both methods. This keeps the build green with `SETTLEMENT_PROVIDER=mock` and fails loudly if someone flips the env var prematurely.
- Wire the factory into `settlementWorker` construction at the module boundary (one-line change)
- Add a dev-only Settings toggle that flips the env-var flag at runtime for demo purposes (documented as demo-only; production would restart the app)

✅ Checkpoint: app works identically with `SETTLEMENT_PROVIDER=mock`. Flipping to `solana` throws the stub error — expected. Commit before proceeding.
✅ **Commit:** `feat(settlement): env-var provider switch with Solana stub`

### 11.2 Solana toolchain (Saturday evening)
```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked
solana-keygen new --outfile ~/.config/solana/devnet.json
solana config set --url devnet --keypair ~/.config/solana/devnet.json
solana airdrop 2
```

✅ **Commit:** `chore(solana): toolchain installed, devnet configured`

### 11.3 Anchor program scaffold (Sunday AM)
```bash
mkdir solana && cd solana
anchor init htgn-betting
```
The Anchor scaffold's default client language is irrelevant — the real TS client lives at `/src/services/settlementProviders/SolanaSettlementProvider.ts` and only consumes the generated types from `/solana/htgn-betting/target/types/`.

### 11.4 Program design (Sunday AM)
`solana/htgn-betting/programs/htgn-betting/src/lib.rs`:
- **Accounts:**
  - `Bet` PDA seeded by `[b"bet", bettor.key().as_ref(), client_bet_id_bytes]` (first 16 bytes of UUID)
  - `HouseTreasury` PDA (single authority) holding HTGN SPL tokens for payouts
- **Instructions:**
  - `place_bet(stake: u64, odds_millis: u32, outcome: u8)`: transfers `stake` HTGN from bettor to escrow PDA; initializes `Bet` with status=Pending. Odds are stored as basis-points-thousands (decimal odds × 1000) to keep math integer.
  - `settle_bet(result: u8)`: callable only by the oracle authority. If `bet.outcome == result`, transfer `stake * odds_millis / 1000` to bettor; else treasury keeps the stake. Close `Bet` account.
- **HTGN mock token:** Create a new SPL mint on devnet in a setup script; mint 10,000 HTGN to the test bettor wallet.
- **Safety:** `checked_mul` on all math; oracle authority stored on program init; reject double-settle via Pending → Settled state check.

### 11.5 Anchor tests (Sunday AM) — `/solana/htgn-betting/tests/`
- Happy path: place bet, oracle settles as win, bettor receives payout
- Happy path: place bet, oracle settles as loss, treasury keeps
- Non-oracle cannot settle
- Double-settle rejected

Run via `anchor test` from within `/solana/htgn-betting/` against a local validator.

### 11.6 Deploy to devnet (Sunday noon)
```bash
cd solana/htgn-betting
anchor build
anchor deploy --provider.cluster devnet
```
Record the program ID in `/solana/htgn-betting/DEPLOYED.md` and in DECISION_LOG.md.

### 11.7 TS client (Sunday noon)
Replace the stub body of `/src/services/settlementProviders/SolanaSettlementProvider.ts` (created in Phase 11.1) with the real implementation:
- Uses `@solana/web3.js` + `@coral-xyz/anchor`
- `escrow()`: builds and sends `place_bet` using a dev wallet loaded from a gitignored JSON; stores the tx signature in `bets.onchain_tx_id` (column already in schema from Phase 2.1)
- `settle()`: sends `settle_bet` from the oracle wallet; stores the settlement tx signature
- **CRITICAL:** Runs only inside the worker layer. NetInfo must confirm online before any RPC call; on offline, return early and let the worker retry on reconnect. Chain calls MUST NOT block the UI — placement UI still completes immediately via the local PENDING_SYNC write, and the Solana call happens asynchronously after that.

### 11.8 Integration (Sunday noon)
- The dev-only Settings toggle that switches `SETTLEMENT_PROVIDER` at runtime already exists from Phase 11.1 — verify it now actually switches to the working Solana provider
- Bet history: when a bet has an `onchain_tx_id`, show a small "Wè sou chèn nan" ("View on chain") link opening Solana Explorer devnet URL
- Verify on a real device: toggle to Solana mode → place a bet → see tx on devnet explorer → dev-sim settle → see payout tx

✅ **Acceptance:** Toggle to Solana → bet appears on devnet explorer; settle → payout tx visible; entire flow doesn't break mock mode.
✅ **Commit:** `feat(solana): HTGN betting program, devnet deployment, TS provider`
✅ **Tag:** `git tag v2-solana-integrated && git push --tags`

---

## Phase 12: Final Polish (50 min, Sunday afternoon)

1. **Expand the README stub into the full README (budget 20 min, not 5).** This is the single reader-facing artifact the reviewer hits first. Include:
   - **Mission alignment** — the two-brief framing from CLAUDE.md §0 (Brief 1 = core app + mock provider; Brief 2 = Solana provider on the same codebase; chain calls never block UI)
   - **Architecture overview** with a small ASCII data-flow diagram (place bet → local SQLite → sync worker → settlement provider → settlement worker)
   - **Run instructions** including the `SETTLEMENT_PROVIDER` env var, `.env` setup, and how to flip fixture-only vs. live-API mode
   - **APK download link** (from the `v1-production-ready` GitHub release)
   - **Loom walkthrough link**
   - **Brief-to-feature mapping** — table showing which features satisfy Brief 1 vs. Brief 2
   - **"What I'd build next"** section pointing to FUTURE_WORK.md for the sòl design sketch and any other deferred items
   - **Pointer to DECISION_LOG.md** for architectural decisions
2. Run `npm run lint` (or equivalent) and fix quick wins
3. Test on a real Android device if possible
4. Re-watch Loom; re-record if audio is bad
5. Proofread DECISION_LOG.md, FUTURE_WORK.md, and README for typos
6. Verify all links (APK, Loom, Solana devnet explorer) work
7. Security check: `git log -p | grep -iE 'api.?key|secret|private'` — should be empty
8. If Solana is live, confirm program ID is on devnet and at least one placed-bet tx is accessible on explorer
9. Send the repo link to the recruiter per Gauntlet's interview logistics

---

## Timeline Checkpoints

| When | Target state | Phases |
|---|---|---|
| Friday 10pm | Scaffolding + design system | 0–1 |
| Saturday 10am | DB, utils, i18n, fixture + API | 2–5 |
| Saturday 4pm | Screens + workers | 6–7 |
| Saturday 9pm | Tests + ledger + polish | 8–9 |
| Saturday 11pm | **Brief 1 complete + `v1-production-ready` tag** | 10 |
| Saturday midnight | Solana scaffolded (provider abstraction + toolchain) | 11.1–11.2 |
| Sunday 10am | Anchor program + tests | 11.3–11.5 |
| Sunday noon | **Solana deployed + integrated + `v2-solana-integrated` tag** | 11.6–11.8 |
| Sunday 2pm | README expansion + final polish; pivot to capstone | 12 |
| Monday | Capstone presentation |
| Tuesday | Nclusion interview |

**Gate at Saturday 11pm:** If Brief 1 isn't complete and tagged by then, skip the Solana scaffolding and go to bed. Wake up Sunday and finish Brief 1 first. Only start Solana after Brief 1 is green and tagged.

**Gate at Sunday noon:** If Solana integration isn't working by noon, revert to the `v1-production-ready` tag and submit Brief 1 complete / Brief 2 partially implemented. Do not ship broken code. Note the attempt in DECISION_LOG.md.

---

**Final reminder:** The interview is about whether Nclusion wants to work with you for the next several years. Brief 1 done well + Brief 2 meaningfully attempted (or fully integrated) demonstrates you can ship a thoughtful financial-inclusion product under constraints. That is the whole job.