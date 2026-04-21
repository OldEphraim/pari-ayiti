# Pari Ayiti

> An offline-first, Android-optimized sports betting app denominated in HTGN (Haitian Gourde Stablecoin), built as a reference implementation of [Nclusion](https://nclusion.com)'s thesis that community financial tools must function on 2G connections for 2026 FIFA World Cup viewers in Haiti.

This stub is placeholder-only — the full reader-facing README lands in Phase 12. What's here now is enough to orient a reviewer hitting the repo cold.

---

## Mission alignment

Pari Ayiti is a single codebase that addresses both of Nclusion's hiring briefs:

- **Brief 1 — Data-Optimized Mobile Sports Betting Platform.** Offline-first UX, local queue, bet state machine, Creole-first UI, realistic Haiti vs. Group C World Cup fixtures. Mock HTGN settlement provider.
- **Brief 2 — Solana-Based Sports Betting Using HTGN.** A `SolanaSettlementProvider` slots into the same codebase behind a `SettlementProvider` interface selected via env var. Chain calls live **only** in the background worker layer — placement UI never blocks on RPC, preserving the 2G/offline constraint.

See [CLAUDE.md](./CLAUDE.md) §0 for the full two-brief framing.

## Architecture overview

_Full walkthrough and ASCII data-flow diagram land in Phase 12._

At a glance:

- **Stack:** React Native (Expo SDK 54) + TypeScript, Zustand, expo-sqlite, i18next, date-fns
- **State of truth:** SQLite. Zustand is a view layer over DB reads — never a competing source
- **Money:** integer minor units (1 HTGN = 100 minor) throughout; floats never cross into the DB or state
- **Bet state machine:** `PENDING_SYNC` → `PENDING_SETTLEMENT` → `SETTLED_{WON,LOST}`; `VOID_REFUNDED` after 5 sync failures with a matching `refund_void` ledger entry
- **Data:** fixture is the canonical demo source (Haiti's real Group C: Brazil, Morocco, Scotland); the-odds-api.com is a secondary live path

## Run instructions

_Stub — full instructions land in Phase 12._

```sh
npm install --legacy-peer-deps
npx expo start --android     # Pixel emulator or physical device
```

Env vars (see `.env.example`):

- `ODDS_API_KEY` — optional. Without it, the app runs fixture-only.
- `ENABLE_MOCK_FAILURES` — default `false`. Togglable at runtime via a DEV card in Paramèt.
- `SETTLEMENT_PROVIDER` — `mock` (default) or `solana` (Phase 11).

## Downloads

- **Android APK (Brief 1 complete):** _pending — attached to the [`v1-production-ready`](https://github.com/OldEphraim/pari-ayiti/releases/tag/v1-production-ready) GitHub release once EAS build completes_
- **Demo GIF:** _Phase 12 deliverable_

## Tests

```sh
npm test
```

Four test files per [`STEPS.md`](./STEPS.md) §10: `money.test.ts`, `bets.test.ts`, `settlement.test.ts`, `offlineQueue.test.ts`. 29 cases covering the four scenarios that must be bulletproof. Tests run against `better-sqlite3` in-memory through the DB interface — no emulator needed.

## Documents

- [`CLAUDE.md`](./CLAUDE.md) — full project context and scope discipline
- [`STEPS.md`](./STEPS.md) — phase-by-phase execution plan
- [`DECISION_LOG.md`](./DECISION_LOG.md) — architectural decisions with context / decision / why / tradeoff
- [`FUTURE_WORK.md`](./FUTURE_WORK.md) — sòl/group-bet design sketch + deferred items
- [`LOOM_SCRIPT.md`](./LOOM_SCRIPT.md) — 5-scene demo walkthrough (Loom video dropped in favor of a written script + demo GIF)
