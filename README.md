# Pari Ayiti

> An offline-first, Android-optimized sports betting app denominated in HTGN (Haitian Gourde Stablecoin), built as a reference implementation of [Nclusion](https://nclusion.com)'s thesis that community financial tools must function on 2G connections for 2026 FIFA World Cup viewers in Haiti.

---

## Mission alignment

Pari Ayiti is a weekend take-home for Nclusion. This submission ships **Brief 1 — Data-Optimized Mobile Sports Betting Platform**: offline-first UX, local queue, full bet state machine, Creole-first UI, realistic Haiti vs. Group C World Cup fixtures, and a mock HTGN settlement provider.

**Brief 2 (Solana HTGN settlement) is deliberately deferred.** The scope decision is recorded in [`DECISION_LOG.md`](./DECISION_LOG.md) **D-018**; the architecture sketch lives in [`FUTURE_WORK.md`](./FUTURE_WORK.md). See [`CLAUDE.md`](./CLAUDE.md) §0–§2 for the full two-brief framing and the scope-discipline principles that governed the build — §14 explicitly contemplates this submission state as an acceptable landing point.

## Architecture overview

- **Stack:** React Native (Expo SDK 54) + TypeScript, Zustand, `expo-sqlite`, `i18next`, `date-fns`
- **State of truth:** SQLite. Zustand is a view layer over DB reads — never a competing source
- **Money:** integer minor units (1 HTGN = 100 minor) throughout; floats never cross into the DB or state
- **Bet state machine:** `PENDING_SYNC` → `PENDING_SETTLEMENT` → `SETTLED_{WON,LOST}`; `VOID_REFUNDED` after 5 sync failures with a matching `refund_void` ledger entry
- **Data source:** fixture-primary (Haiti's real Group C: Brazil, Morocco, Scotland — see DECISION_LOG.md **D-005**); `the-odds-api.com` is a secondary live path
- **Ledger invariant:** `balance.htgn_minor == SUM(balance_ledger.amount_htgn_minor)`, enforced by `reconcileBalance()` on dev boot (see CLAUDE.md §4.5)

For the scene-by-scene walkthrough, see [`LOOM_SCRIPT.md`](./LOOM_SCRIPT.md).

## Run instructions

```sh
npm install --legacy-peer-deps
npx expo start --android     # Pixel emulator or physical device
```

Env vars (see `.env.example`):

- `ODDS_API_KEY` — optional. Without it, the app runs fixture-only (the intended demo mode).
- `ENABLE_MOCK_FAILURES` — default `false`. Togglable at runtime via a DEV card in Paramèt.

**Seeing the full state machine end-to-end.** Real matches don't conclude until June 2026, so the app includes a `__DEV__`-gated "DEV: Simile rezilta" control in bet history that forces a match result. This is the reviewer's shortest path to watching a bet transition `PENDING_SETTLEMENT → SETTLED_{WON,LOST}`. It's visible when running from source (`npx expo start`); it is stripped from the release APK.

## Downloads

- **Android APK (Brief 1):** attached to the [`v1-production-ready`](https://github.com/OldEphraim/pari-ayiti/releases/tag/v1-production-ready) GitHub release. Useful for a quick install-and-browse on a physical Android device. For the settlement demo, run from source.

## Tests

```sh
npm test
```

Four test files per [`STEPS.md`](./STEPS.md) §10: `money.test.ts`, `bets.test.ts`, `settlement.test.ts`, `offlineQueue.test.ts`. 29 cases covering the four scenarios that must be bulletproof. Tests run against `better-sqlite3` in-memory through the DB interface — no emulator needed.

## Documents

- [`CLAUDE.md`](./CLAUDE.md) — full project context and scope discipline
- [`STEPS.md`](./STEPS.md) — phase-by-phase execution plan
- [`DECISION_LOG.md`](./DECISION_LOG.md) — architectural decisions with context / decision / why / tradeoff (18 entries)
- [`FUTURE_WORK.md`](./FUTURE_WORK.md) — Solana (Brief 2) architecture sketch, sòl / group-bet design sketch, and other deferred items
- [`LOOM_SCRIPT.md`](./LOOM_SCRIPT.md) — 5-scene walkthrough (the recorded Loom was dropped — see DECISION_LOG.md **D-017**)
