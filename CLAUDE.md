# CLAUDE.md — Pari Ayiti

> Context document for Claude Code. Read this file in full before writing any code. When in doubt about scope, re-read §2 (Scope Discipline) and §11 (What NOT to Build).

---

## 0. Project Identity

**Name:** Pari Ayiti (`pari-ayiti`)
**One-line description:** An offline-first, Android-optimized sports betting app denominated in HTGN (Haitian Gourde Stablecoin), built as a reference implementation of Nclusion's thesis that community financial tools must function on 2G connections for 2026 FIFA World Cup viewers in Haiti.

**Purpose:** Take-home project for a Tuesday interview at Nclusion, a Palo Alto-based financial inclusion fintech (~Series A, ~72 employees) building stablecoin rails, community-savings products, and agency banking for the ~1.4 billion unbanked.

### This project addresses both Nclusion hiring briefs as a single codebase.

**Brief 1** (Data-Optimized Mobile Sports Betting Platform) is satisfied by the core app with a mock settlement provider: offline-first UX, local queue, bet state machine, Creole UI, realistic World Cup fixtures.

**Brief 2** (Solana-Based Sports Betting Using HTGN) is satisfied by a `SolanaSettlementProvider` selected via env var. Both paths share the **same offline-first UX, local queue, and bet state machine** — on-chain settlement happens **opportunistically when online, and never blocks the UI**. Brief 2's problem statement explicitly keeps the 2G/offline constraint in force for the Solana variant; no blockchain call may appear in the render path or gate a user-visible UI transition. All chain operations happen in the background worker layer.

**Audience reading the final submission:** Nclusion engineering leadership. They value mission alignment, humility in UX, ambiguity tolerance, ownership from whiteboard to production, security and auditability mindset, and AI-augmented engineering workflows.

---

## 1. Nclusion Mission & Values

**Mission:** "Banking the Unbanked Through Community Traditions." Nclusion provides traditional financial services to the 1.4 billion people worldwide without access, by bridging traditional banking and the communities that need it most.

**Cultural keystone:** "We Start With Humility." Starting with humility means recognizing that the people we serve are the experts in their own lives. Listen first, respect traditions, design tools that empower people with dignity.

**Product pillars:**
1. **Stablecoin settlement rails** — HTGN is the gourde-pegged stablecoin
2. **Community-traditions UX layer** — ROSCA-inspired patterns: susus, tandas, chamas, Haitian sòls
3. **Agency banking distribution** — physical agents as cash-in/cash-out rails, M-Pesa-style

**Geography:** Haiti is the first launch corridor. Dominican Republic and Democratic Republic of Congo are in the agent-network pipeline. Launch is tied to the 2026 FIFA World Cup (Haiti qualified; tournament runs June-July 2026 in US/Canada/Mexico).

---

## 2. Scope Discipline (READ THIS TWICE)

This is a weekend take-home for a Tuesday interview. The author (Alan) is also preparing a capstone presentation for Monday and has Superbuilders/GFA work in flight. **Ruthless scope control is the single most important thing.**

**Guiding principle:** Ship two briefs' worth of core loop, beautifully. Do not sprawl.

**Must-have (Brief 1), in order:**
1. Real odds + realistic Group C fixture data, displayed in a mobile-first React Native Android UI
2. Haitian Creole primary / French secondary language toggle
3. Place a bet → bet state machine (PENDING_SYNC → PENDING_SETTLEMENT → SETTLED_WON/SETTLED_LOST) → debit from mock HTGN balance
4. Offline resilience: browse cached matches, view bet history, queue bets when offline, sync when online
5. Automatic settlement when matches conclude (with a dev-sim button for reviewer verification)
6. Clean, performant UI on 2GB RAM / Android 8+

**Must-have (Brief 2):**
7. `SettlementProvider` abstraction with mock + Solana implementations, toggleable via env var
8. Anchor program on Solana devnet that escrows and settles HTGN-denominated bets (mock SPL token standing in for HTGN)
9. Chain calls live only in background workers — UI never blocks on RPC

**Nice-to-have:**
- Transaction receipt export
- Basic dark mode
- Data-used-today counter

**Explicitly de-scoped to FUTURE_WORK.md:**
- ROSCA/sòl-inspired group-bet feature — strong culture signal, insufficient time

See §11 for an explicit NOT-building list.

---

## 3. Tech Stack (opinionated, locked)

**Mobile:** React Native via Expo (pin SDK to whatever is latest stable at kickoff — **verify with `npx create-expo-app@latest` and record the version in DECISION_LOG.md as D-001**) with TypeScript.
**Why not native Android/Kotlin:** Alan is strongest in TS/React; Nclusion's stack includes TS/React Native; Expo builds APKs that run on Android Go.

**State management:** Zustand. NOT Redux.
**Local storage / offline queue:** `expo-sqlite` for structured data. AsyncStorage only for tiny key-value config.
**Network layer:** `fetch` wrapped in a thin client + `@react-native-community/netinfo`.
**Crypto polyfill (CRITICAL):** `react-native-get-random-values` — import once at the top of `app/_layout.tsx` before anything else. Without it, `uuid/v4` throws in React Native.
**i18n:** `i18next` + `react-i18next`. Languages: `ht.json` (Creole, default), `fr.json` (French, fallback). No English in user-facing strings.
**UI:** Plain React Native components + one theme file. NO NativeBase, NO Tamagui, NO React Native Paper.
**Icons:** `@expo/vector-icons`.
**Date/time:** `date-fns` with French locale (used for both French and Creole UIs — see §8).
**Testing:** Jest + React Native Testing Library for the four critical tests in §10. Tests run against `better-sqlite3` through the DB interface (§4.6). No coverage targets.

**Odds API (free tier):**
- **Primary:** `the-odds-api.com` — 500 requests/month free, supports soccer.
- **Fixture is the canonical demo data path** (see §6); the live API is a secondary "if markets are posted yet" path.
- **Key handling:** `.env` (gitignored), accessed via `expo-constants` extra config.

**Solana:**
- Anchor framework (Rust) for the on-chain program, `@solana/web3.js` + `@coral-xyz/anchor` for the TS client.
- Devnet only. A mock SPL token standing in for HTGN.

---

## 4. Architecture

### 4.1 Data flow (happy path, online)

```
User opens app → Home screen loads
  → Read cached matches from SQLite (show immediately)
  → Background: refresh matches from fixture or Odds API
  → User taps a match → bet entry screen
  → User places bet → bet inserted into SQLite with status PENDING_SYNC
  → UI returns immediately; sync worker picks it up async
  → If online: worker confirms with backend → PENDING_SETTLEMENT
  → Match concludes → settlement worker transitions to SETTLED_*
```

### 4.2 Offline path & balance handling

```
User has no connectivity
  → App shows cached matches with "San entènèt — done yo soti nan [timestamp]"
  → User places bet
  → Bet written to SQLite with status PENDING_SYNC
  → Debit ledger entry written in the same transaction
  → UI shows bet in history with a "K ap tann koneksyon" pill
  → NetInfo listener fires when connectivity returns
  → Sync worker drains queue: confirm idempotently with backend
  → Transition to PENDING_SETTLEMENT
```

**Balance handling (debit-at-placement model).** The debit is applied in the same SQLite transaction as the bet insert: the `bets` row is written, a `debit_stake` ledger entry is recorded, and `balance.htgn_minor` is reduced atomically. The UI displays `balance.htgn_minor` directly — there is no separate projection layer. Because the debit is immediate, each successive bet validates against an already-reduced balance, so over-subscription is structurally impossible. If a sync fails permanently after 5 retries, the bet transitions to VOID_REFUNDED and a `refund_void` ledger entry restores the balance atomically. Document this in DECISION_LOG.md.

### 4.3 Settlement path

Real World Cup matches won't conclude during the interview review window (tournament starts June 11, 2026). Two settlement triggers:

1. **Production path:** On app foreground, scan bets in PENDING_SETTLEMENT whose match's `commence_time + ~2hrs` has passed. Fetch scores. Settle.
2. **Dev path (fully implemented):** A `__DEV__`-gated "Simile rezilta" control in bet history lets the reviewer force a match result. This is how the Nclusion reviewer verifies settlement end-to-end.

### 4.4 Bet state machine (single source of truth)

```
           ┌──────────────────┐
           │  PENDING_SYNC    │  (local, not yet confirmed by backend / chain)
           └────────┬─────────┘
                    │ sync succeeds
                    ▼
           ┌──────────────────┐
           │PENDING_SETTLEMENT│  (confirmed; waiting for match conclusion)
           └────────┬─────────┘
                    │ settlement runs
         ┌──────────┴──────────┐
         ▼                     ▼
  ┌─────────────┐      ┌──────────────┐
  │ SETTLED_WON │      │ SETTLED_LOST │
  └─────────────┘      └──────────────┘

Failure path:
  PENDING_SYNC --sync fails 5x--> VOID_REFUNDED (refund_void ledger entry restores balance)
```

**Note on failure modes:** Mock failures are retryable only; a deliberate-rejection path (REJECTED → VOID_REFUNDED) is a clear future extension, not in scope.

**Idempotency:** Each bet has a client-generated UUIDv4 (`client_bet_id`). Sync and chain operations use this as their idempotency key.

### 4.5 SQLite schema

```sql
CREATE TABLE matches (
  id TEXT PRIMARY KEY,              -- Odds API id or fixture id
  sport_key TEXT NOT NULL,
  commence_time INTEGER NOT NULL,   -- unix seconds
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  odds_home REAL,                   -- decimal odds
  odds_draw REAL,
  odds_away REAL,
  status TEXT NOT NULL,             -- 'upcoming' | 'live' | 'concluded'
  home_score INTEGER,
  away_score INTEGER,
  last_fetched INTEGER NOT NULL
);

CREATE TABLE bets (
  client_bet_id TEXT PRIMARY KEY,   -- UUIDv4, client-generated
  match_id TEXT NOT NULL,
  selection TEXT NOT NULL,          -- 'home' | 'draw' | 'away'
  stake_htgn INTEGER NOT NULL,      -- integer minor units (1 HTGN = 100 minor units)
  odds_at_placement REAL NOT NULL,  -- snapshot; settlement uses what the user saw
  potential_payout_htgn INTEGER NOT NULL,
  status TEXT NOT NULL,             -- PENDING_SYNC | PENDING_SETTLEMENT | SETTLED_WON | SETTLED_LOST | VOID_REFUNDED
  sync_attempts INTEGER NOT NULL DEFAULT 0,
  placed_at INTEGER NOT NULL,
  synced_at INTEGER,
  settled_at INTEGER,
  onchain_tx_id TEXT,               -- populated when Solana provider is active
  FOREIGN KEY (match_id) REFERENCES matches(id)
);

CREATE TABLE balance (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  htgn_minor INTEGER NOT NULL
);

CREATE TABLE balance_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,               -- 'initial_grant' | 'debit_stake' | 'credit_winnings' | 'refund_void'
  amount_htgn_minor INTEGER NOT NULL,  -- signed
  related_bet_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (related_bet_id) REFERENCES bets(client_bet_id)
);
```

**Money invariant:** Balance is always stored in integer minor units. Never floats. Display conversion at the UI boundary only.

**Ledger invariant:** `balance.htgn_minor == SUM(balance_ledger.amount_htgn_minor)`. The initial grant is a ledger row with `kind = 'initial_grant'`, so there is no separate additive term. `reconcileBalance()` sums every `balance_ledger.amount_htgn_minor`, compares to `balance.htgn_minor`, and throws if the values diverge. Call it on app start in dev; log (do not throw) in production.

### 4.6 Module structure

```
/app
  /(tabs)
    index.tsx              # Match list (home)
    history.tsx            # Bet history
    settings.tsx           # Language toggle, dev tools, responsible-gambling controls
  /match/[id].tsx          # Match detail + bet placement
  /ledger.tsx              # Balance ledger view (linked from Settings)
  /dev/gallery.tsx         # __DEV__ component gallery
  _layout.tsx              # Root; imports react-native-get-random-values FIRST
/src
  /db
    schema.ts              # SQL migrations
    client.ts              # DB interface + ExpoSqliteDB (prod) + BetterSqliteDB (tests)
    matches.ts             # Match DAO (depends on interface)
    bets.ts                # Bet DAO
    balance.ts             # Balance + ledger DAO
  /api
    odds.ts                # The Odds API client
    mockBackend.ts         # In-process mock of Nclusion bet-sync endpoint
    fixtures/
      worldCupMatches.json
  /state
    useAppStore.ts         # Zustand store
  /services
    syncWorker.ts
    settlementWorker.ts
    settlementProviders/
      index.ts                      # SettlementProvider interface + factory
      MockSettlementProvider.ts
      SolanaSettlementProvider.ts   # consumes generated types from /solana/htgn-betting/target/types/
    connectivity.ts
  /i18n
    index.ts
    locales/ht.json
    locales/fr.json
  /ui
    theme.ts
    components/            # Button, Card, Pill, Banner, Text, Screen
  /utils
    money.ts
    odds.ts
    uuid.ts
    time.ts
/tests
  money.test.ts
  bets.test.ts
  settlement.test.ts
  offlineQueue.test.ts
/solana
  /htgn-betting
    /programs/htgn-betting/  # Anchor program (Rust)
    /tests/                  # Anchor mocha tests
```

**DB abstraction (important — prevents test foot-gun).** `src/db/client.ts` defines a `DB` interface (`query<T>`, `run`, `transaction`). Two implementations: `ExpoSqliteDB` (production, wraps `expo-sqlite`) and `BetterSqliteDB` (Jest tests, wraps `better-sqlite3` which works natively in Node). All DAOs depend only on the interface. Tests instantiate `BetterSqliteDB` in-memory (`':memory:'`); production instantiates `ExpoSqliteDB`. This removes the "how do we test SQLite in RN" question entirely.

---

## 5. UX Principles

**Humility-first copy.** User-facing strings treat the user as the expert in their own life. No paternalism.

- ❌ "Insufficient funds" → ✅ "Ou pa gen ase HTGN pou pari sa a kounye a"
- ❌ "Transaction failed. Please try again." → ✅ "Koneksyon an pa bon kounye a — nou sere pari w la epi n ap voye l lè koneksyon an tounen"
- ❌ "Bet placed successfully" → ✅ "Pari w la anrejistre"

**Offline is first-class, not an error.** The UI never punishes the user for being offline; it reassures them their state is preserved.

**Data frugality is respect.** If trivial, show a small "data used today" counter in Settings — signals we respect the 50MB/day constraint.

**Performance budgets:**
- First meaningful paint on cold start: < 1.5s
- Match list render from cache: < 200ms
- No animations longer than **250ms**; reduce-motion respected
- Bundle size target: < 15MB APK

**Accessibility:** Minimum 14pt body text, 4.5:1 contrast, touch targets ≥ 44pt.

**Color palette (finalize in `theme.ts`):**
- Primary: Haitian flag blue `#00209F`
- Accent: Haitian flag red `#D21034`
- Neutrals; NO green-for-money (culturally US-centric)

---

## 6. The Odds API Integration

**The fixture is the canonical demo data source.** Live API is a secondary "if markets are posted yet" path, because the World Cup starts June 11, 2026 and per-match h2h markets may not be open during the interview review window.

**Fixture content (`/src/api/fixtures/worldCupMatches.json`):** Haiti's real Group C (composition to be verified from the FIFA draw; target is Haiti, Brazil, Morocco, Scotland — see STEPS.md 5.2 for odds values). Including Haiti matchups with big favorites produces the most compelling demo (place a 50 HTGN bet on Haiti to beat Brazil, watch it settle as a loss, see the dignity-first copy). Also include ~3 matches from other groups to make the list feel real.

**Live API (when used):**
- **Base URL:** `https://api.the-odds-api.com/v4/`
- **Verify sport key:** before hardcoding `soccer_fifa_world_cup`, hit `/v4/sports?apiKey=…` at project start and confirm the exact key string. Record the verified key in DECISION_LOG.md.
- **Endpoints:**
  - `GET /sports/{sport_key}/odds?regions=uk,eu&markets=h2h&oddsFormat=decimal`
  - `GET /sports/{sport_key}/scores?daysFrom=3`

**Fetch strategy:**
- On cold start, show cache immediately; if cache age > 30 min AND online, refresh in background.
- No more than one fetch per 30 min unless pull-to-refresh.
- Scores endpoint only polled for matches whose `commence_time` has passed AND have bets in PENDING_SETTLEMENT.
- On API error, silently fall back to cache or fixture. No error toasts.

---

## 7. Mock HTGN Balance Backend

No real backend. In-process simulation:
- Starting balance: 5000.00 HTGN (500,000 minor units); `initial_grant` ledger row.
- `mockBackend.confirmBet(bet)`: 50-300ms simulated delay; returns `{ok: true, server_bet_id, confirmed_at}` or `{ok: false, reason}`.
- Failures are **retryable only** (see §4.4). Controlled by env var `ENABLE_MOCK_FAILURES`, **defaulted to `false`**. A dev-only Settings toggle "Simulate flaky network" flips it at runtime for the reviewer to demo offline queue behavior. Tests force it on regardless of runtime state.
- Must be driven through the same interface a real backend would use, so swapping in a real Nclusion endpoint is a one-file change.

---

## 8. Internationalization

**Default language:** Haitian Creole (`ht`)
**Fallback language:** French (`fr`)
**No English in user-facing UI.** Code, commits, comments are English; app strings are not.

**Exception:** `__DEV__`-gated strings (e.g., "DEV: Simile rezilta", component gallery labels) are exempt. Prefix all of them with `DEV:` so they're visually obvious and trivially greppable.

**Key interpolation:** Strings with dynamic content use i18next interpolation syntax:
- `matches.offline`: `"San entènèt — done yo soti nan {{time}}"`
- `offline.banner`: `"San entènèt — {{count}} pari k ap tann"`

**Creole vocabulary (community-standard renderings):**
bet = `pari` · match = `match` · win = `genyen` · lose = `pèdi` · balance = `balans` · pending = `k ap tann` · settled = `fini` · offline = `san entènèt` · home team = `ekip lakay` · away team = `ekip deyò` · draw = `egalite` · stake = `mize`

**Note for Claude Code:** Do NOT invent Creole from French by analogy. Stick to the vocabulary above and the strings seeded in `locales/ht.json`. Add new strings to i18n files first; never inline.

**Dates:** We use `date-fns` with the `fr` (French) locale for both French and Creole UIs. Creole has no `date-fns` locale, and maintaining a hand-rolled day/month substitution table is out of scope. Document this in DECISION_LOG.md as a pragmatic concession.

---

## 9. Code Quality Conventions

- **TypeScript strict mode on.** No `any` without a comment justifying.
- **No default exports** except React screens/components. Named exports everywhere else.
- **Functions over classes** except where React or Anchor demand otherwise.
- **Every async chain must terminate in a `.catch` or `try/catch` somewhere.** No unhandled rejections. Inner `await` calls don't each need their own try/catch; they need to be inside a chain that catches at some level.
- **Every DB write goes through a DAO.** No raw SQL in components or state.
- **Money math lives in `/src/utils/money.ts`.** Components never multiply stakes by odds directly.
- **Conventional Commits:** `feat: …`, `fix: …`, `refactor: …`, `docs: …`, `chore: …`, `test: …`.
- **File naming:** kebab-case for files, PascalCase for React components, camelCase for functions.

---

## 10. Testing Strategy

Exactly these four files. Nothing else.

1. **`money.test.ts`** — round-trip HTGN display ↔ minor units, zero drift over 1000 random values.
2. **`bets.test.ts`** — state machine transitions valid/invalid; idempotent `createBet` on same `client_bet_id`.
3. **`settlement.test.ts`** — match concludes, bets settle to correct terminal state with correct payout math.
4. **`offlineQueue.test.ts`** — bets written offline are PENDING_SYNC; sync drains them to PENDING_SETTLEMENT; 5 failures → VOID_REFUNDED with refund ledger entry.

Tests instantiate `BetterSqliteDB` in-memory via the DB interface (§4.6). Run via `npm test`. No coverage targets — the four scenarios must be bulletproof.

---

## 11. What NOT to Build (actively resist)

- ❌ Real user authentication — single demo user
- ❌ Deposit/withdrawal flows — balance starts at 5000 HTGN, full stop
- ❌ Bet types beyond 1x2 (win/draw/loss)
- ❌ iOS
- ❌ Push notifications
- ❌ Real-time in-play odds updates
- ❌ Social features, leaderboards, chat
- ❌ A real Node/Go backend — mocked in-process only
- ❌ Admin dashboards
- ❌ Responsible gambling tooling beyond the minimum in §12
- ❌ Detox / E2E tests — Jest unit tests only
- ❌ Component library beyond one theme file
- ❌ CI/CD pipelines, Docker, monorepo tooling
- ❌ Group-bet / sòl feature — de-scoped; a short design sketch lives in FUTURE_WORK.md
- ❌ "Let me refactor this while I'm here"

If the implementer finds themselves building any of the above, stop and re-read §2.

---

## 12. Responsible Gambling (minimum bar)

Even though the brief is sports betting, the product must reflect Nclusion's user-dignity posture:
- Settings screen: "Daily stake limit" control, default 1000 HTGN
- App warns (does not block) when a single bet exceeds 25% of current balance
- Settings footer: plain-language Creole statement that betting is for entertainment, with a "take a break" line

Call this out in DECISION_LOG.md.

---

## 13. Deliverables

1. **GitHub repo** (`github.com/OldEphraim/pari-ayiti`, public) with README, installable APK link, and DECISION_LOG.md.
2. **Installable APK** built via `eas build -p android --profile preview`.
3. **Short Loom walkthrough** (~3-5 min); script lives in STEPS.md 10.5.
4. **DECISION_LOG.md** with 10-12 numbered entries.
5. **FUTURE_WORK.md** with the sòl design sketch and any deferred items.
6. **README.md** — stub created in STEPS.md Phase 10.2, expanded to the full reader-facing README in STEPS.md Phase 12 step 1.

---

## 14. Known Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Odds API quota exhausted or sport key wrong | Fixture is the primary data source; API is secondary |
| Real Group C match odds not yet posted by bookmakers | Fixture uses hand-curated realistic odds, verified against any live bookmaker we can find |
| React Native native-module conflicts on Expo | Lock to the pinned Expo SDK; avoid ejecting |
| Creole copy accuracy | Conservative phrasings; DECISION_LOG.md notes this would be reviewed by a native speaker pre-launch |
| Reviewer can't easily run the app | APK in GitHub release; fixture mode means no API key needed |
| Solana devnet RPC flakiness during demo | Mock provider remains the default; Solana toggle is demoed separately with retries |
| Solana integration goes sideways Sunday | `v1-production-ready` tag = Brief 1 complete; mark Brief 2 as partially implemented at the tagged commit |
| Time pressure with capstone on Monday | Hard gates in STEPS.md timeline: Saturday midnight = Brief 1 complete + Solana scaffolded; Sunday noon = Solana integrated or abort |

---

## 15. When to Ask, When to Just Build

**Just build** when:
- Decision is reversible and bounded (copy, component structure, file organization)
- Stack is already chosen (§3)
- Task is scoped in STEPS.md

**Ask Alan** when:
- A must-have is blocked and workaround would change the architecture
- A native-module conflict requires ejecting Expo
- Anchor program design needs a non-obvious security tradeoff
- Any scope-expansion question — default NO, ask only if essential

**Never** silently expand scope, add dependencies not listed in §3, change the stack, or skip tests listed in §10.

---

## 16. Done Definition

A STEPS.md phase is DONE when:
- All acceptance criteria pass
- New code has tests if it's in the tested-modules list (§10)
- App still builds and runs on a fresh `expo start`
- Commit pushed with a Conventional Commits message

**Project is DONE when:**
- Both briefs' must-haves (§2) pass
- APK built and linked
- DECISION_LOG.md populated
- Loom recorded
- Both `v1-production-ready` and `v2-solana-integrated` tags pushed

If Solana integration fails Sunday: submit at the `v1-production-ready` tag; Brief 1 is complete, Brief 2 is partially implemented. This is an acceptable outcome.