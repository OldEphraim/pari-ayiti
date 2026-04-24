# DECISION_LOG.md — Pari Ayiti

Architectural and scope decisions, in chronological order. See CLAUDE.md §2 and §11 for scope discipline.

---

## D-001 — Expo SDK version pinned

**Context:** CLAUDE.md §3 requires pinning the Expo SDK at kickoff and recording it here.
**Decision:** Expo SDK **54.0.33** (dependency range `~54.0.33`), via `npx create-expo-app@latest --template blank-typescript` on 2026-04-18. React `19.1.0`, React Native `0.81.5`, TypeScript `~5.9.2`.
**Why:** Latest stable at kickoff; matches CLAUDE.md §3 guidance.
**Tradeoff:** Locked in; no mid-project upgrades. Any Expo-module install later in the build will use the SDK 54-compatible version resolved by `npx expo install`.

---

## D-002 — Floor rounding on payouts

**Context:** `calculatePayout(stakeMinor, decimalOdds)` has to map `stakeMinor * decimalOdds` onto integer minor units. The fractional minor that falls out of that multiplication has to go somewhere.
**Decision:** `Math.floor(stakeMinor * decimalOdds)` — the fractional remainder stays with the house.
**Why:** Simpler, more conservative math. Prevents accidental over-payment when odds carry many decimals (e.g., `1.37`). For any user-facing stake denominated in minor units (min 0.01 HTGN), the worst-case under-payment is 1 minor ≈ 0.01 HTGN per win, which is in line with how most real sportsbooks floor their payouts.
**Tradeoff:** A user-favoring alternative would be `Math.ceil`, biasing toward the bettor. We gave up that goodwill for math that stays predictably in the house's favor, which is the standard industry behavior.

---

## D-003 — `date-fns` French locale used for Creole UI

**Context:** Haitian Creole (ht) is the default UI language (CLAUDE.md §8). `date-fns` does not ship a Creole locale, and this is a weekend build.
**Decision:** `formatDate(unixSeconds, locale)` uses `date-fns/locale/fr` for both `ht` and `fr` UIs.
**Why:** Creole users are broadly comfortable reading French date formats (and most formal Haitian documents are in French). The alternative — a hand-rolled day/month substitution table — is off-scope per CLAUDE.md §2 and risky without native-speaker review.
**Tradeoff:** Dates in the Creole UI read as French ("ven. 11 juin 2026 à 16h00"), not Creole ("vandredi 11 jen 2026…"). DECISION_LOG, README, and the Loom walkthrough flag this as a pre-launch fix item pending a native-speaker review.

---

## D-004 — Half-even (banker's) rounding in `toMinor`

**Context:** CLAUDE.md §3 spec and STEPS.md §3.1 both explicitly require half-even (banker's) rounding in `toMinor`. JavaScript's built-in `Math.round` is half-up (rounds `0.5` toward `+∞`), which diverges on exact halves.
**Decision:** Implemented `roundHalfEven(x)` in `src/utils/money.ts` — returns `floor(x)` when the fractional part is `< 0.5`, `ceil(x)` when `> 0.5`, and rounds exact halves toward the nearest even integer. `toMinor(htgn)` applies this to `htgn * 100`. Phase 8 tests will assert round-trip and exact-half behavior.
**Why:** Spec compliance. In production, user input is capped at 2 decimal places, so exact halves rarely appear at multiplication time — but the Phase 8 tests will assert on random values where rounding bias would drift observable balances.
**Tradeoff:** Slightly more code than a one-liner `Math.round`, for a case that's uncommon but visible under test. No runtime or UX cost.

---

## D-005 — Haiti's 2026 FIFA World Cup group stage (Group C)

**Context:** The 2026 World Cup draw at the Kennedy Center on 2025-12-05 placed Haiti in Group C, matching STEPS.md §5.2's proposal. Fixture data must reflect the actual draw for credibility with Haitian reviewers.
**Decision:** Fixture uses Haiti's real Group C opponents — Brazil, Morocco, Scotland — with real fixture dates:
- Haiti vs. Scotland: 2026-06-13 21:00 ET at Gillette Stadium (Foxboro, MA)
- Brazil vs. Haiti: 2026-06-19 20:30 ET at Lincoln Financial Field (Philadelphia, PA)
- Morocco vs. Haiti: 2026-06-24 18:00 ET at Mercedes-Benz Stadium (Atlanta, GA)

Odds mapping follows STEPS.md §5.2: Brazil heavy favorite (1.15 / 8.0 / 17.0 Haiti longshot), Morocco medium favorite (1.65 / 3.5 / 5.5), Scotland close match (2.1 / 3.2 / 3.5).
**Why:** The fixture IS the demo on first launch (D-006 below means the live API likely won't have h2h markets posted until closer to June). Real teams + real dates + STEPS.md's curated odds shape gives the reviewer a compelling Haiti-vs-Brazil-at-17-to-1 demo moment.
**Tradeoff:** None material — the STEPS.md odds shape happened to map cleanly to Haiti's real opponents by favorite/underdog type. Source: [Philadelphia Union](https://www.philadelphiaunion.com/news/world-cup-haiti-drawn-into-group-c), [Fox Sports](https://www.foxsports.com/stories/soccer/haiti-world-cup-2026-schedule-locations-dates-times).

---

## D-006 — Odds API sport key: verification deferred

**Context:** STEPS.md §5.1 requires hitting `/v4/sports?apiKey=…` at project start to verify the exact World Cup sport key string before hardcoding. `.env` has no `ODDS_API_KEY` set.
**Decision:** Hardcoded the assumed key `soccer_fifa_world_cup` as a constant in `src/api/odds.ts`. `discoverSportKey()` exists in the file but is marked manual-invocation-only — it will not be called automatically to protect the 500 requests/month free-tier quota. The first live fetch with a real key will either succeed and validate the assumption, or return `{ok: false, reason: "HTTP 422"}`-ish, at which point we flip to `discoverSportKey()` to pick the right key.
**Why:** The fixture is the primary demo path (STEPS.md §5 framing). A wrong sport key doesn't break the demo — it just means `refreshMatches()` silently falls through to the fixture, which is the already-desired behavior on API failure.
**Tradeoff:** If the 2026 key turns out to be `soccer_world_cup_2026` or similar, the first live fetch wastes one API call on a 404 before we discover the right key. Acceptable — 1 call out of 500/month.

---

## D-007 — Odds normalization: highest price per outcome

**Context:** The-odds-api's `/odds` endpoint returns one entry per bookmaker × outcome. Multiple bookmakers typically quote the same match, with varying prices.
**Decision:** `fetchWorldCupOdds()` collapses bookmakers by picking the **highest** decimal price per outcome (best-for-user). For each match, we scan every bookmaker's h2h market, find the max of each of (home / draw / away) independently, and emit a single `NormalizedMatch`.
**Why:** The user-facing framing is "here's the best odds you can get on this match." Even if Nclusion ships this for real, the HTGN-denominated wagers aren't actually placed against these bookmakers (Phase 7's mock backend or Phase 11's Solana program holds the escrow); the odds are just the number the user saw at placement, snapshotted into `bets.odds_at_placement`. Showing the best available rate is both user-friendly and honest about the demo's "this is what the market looked like" positioning.
**Tradeoff:** A "first bookmaker" strategy would be simpler but exposes arbitrary bookmaker bias. An "average" strategy would be more representative but harder to explain to a user ("why is your odds 1.47 when bookmaker X lists 1.50?"). Highest-price is the cleanest pitch.

---

## D-008 — "Data used today" counter deferred

**Context:** STEPS.md §9.3 and CLAUDE.md §5 both call for a small "Done w itilize jodi a" counter on the Settings screen as a signal that the app respects Haiti's ~50 MB/day data constraint.
**Decision:** Deferred — not shipping in the Nclusion submission.
**Why:** Implementing the counter properly requires wrapping every `fetch` call with byte-accounting and persisting the running total in AsyncStorage with daily rollover. Nothing in the current code is instrumented for this, so retrofitting it hits three files (odds.ts, matchFetcher.ts, mockBackend.ts) for a marginal Loom-demo beat. The responsible-gambling surface (daily limit, ledger auditability) covers the stronger dignity signal.
**Tradeoff:** Lose one small "we respect the 50 MB/day budget" talking point in the Loom. Still covered verbally via the fixture-primary, cache-first fetch strategy (D-005 / STEPS.md §5). If we ship to real users, a single shared `fetchJson` wrapper + `Content-Length` accumulation is ~15 minutes of work — trivially recoverable later.

---

## D-009 — Zustand over Redux for app state

**Context:** CLAUDE.md §3 specifies Zustand. Historical norm in Nclusion-scale mobile apps is Redux + Redux-Toolkit; picking Zustand deviates from that.
**Decision:** Zustand for all shared React state. No Redux, no Jotai, no Recoil.
**Why:** Zero boilerplate (no action creators / reducers / slice files / providers), tiny bundle (~1 kB gzipped vs. Redux's ~14 kB with RTK), and the store is a plain function — trivially callable from non-React code paths (workers, boot gate in `_layout.tsx`). The mental model also lines up with Nclusion's "keep it light for 2G" framing.
**Tradeoff:** Redux's time-travel devtools and structured middleware are real niceties we give up. For a weekend build with one user and one device, the middleware story is overkill; if we scaled to multiple orgs or needed offline action replay, we'd reconsider.

---

## D-010 — SQLite over MMKV, fronted by a DB interface

**Context:** CLAUDE.md §3 pins `expo-sqlite` for structured data. Two design questions: why not MMKV (faster, simpler KV), and how to make the DB testable from Node without bundling an emulator.
**Decision:** SQLite for bets / matches / balance / ledger. Zustand and AsyncStorage only for tiny KV state (language preference, daily limit, mock-failures toggle). A `DB` interface in `src/db/client.ts` abstracts `ExpoSqliteDB` (production) from `BetterSqliteDB` (Phase 8 tests, in-memory). All DAOs depend on the interface.
**Why:** Bets and ledger are relational — FKs, joins (ledger × bets × matches on the ledger screen), transactional writes (bet + debit atomically per D-011). Those are cheap in SQL and annoying in a KV store. The DB interface lets us instantiate `better-sqlite3` in Jest and exercise real transactional behavior — the four Phase 8 test files talk to SQL, not mocks.
**Tradeoff:** SQLite adds a native module surface (Metro had to be taught `better-sqlite3` is test-only via a separate file), and the abstraction layer is more code than a direct `expo-sqlite` call. For a codebase that will realistically see Phase 11 (Solana), Phase 12 (polish), and potentially a real backend integration, the testable seam pays itself back.

---

## D-011 — Debit-at-placement, no projection layer

**Context:** A naive design would debit the user's balance only on settlement, which requires a projection layer that reserves stake against PENDING_SYNC + PENDING_SETTLEMENT bets to prevent over-subscription. That projection is the kind of thing that gets subtly wrong in an offline-queue world.
**Decision:** Debit the stake **in the same SQLite transaction as the bet insert**. `balance.htgn_minor` decreases atomically. No projection layer. On VOID_REFUNDED (5-fail sync) or never (settlement handles credits on win separately), the same-transaction pattern restores the stake via a `refund_void` ledger entry.
**Why:** Each bet validates against an already-reduced `balance.htgn_minor`, so double-spending is **structurally impossible** — the DB invariant prevents it, not a consistency check in app code. The ledger invariant `balance.htgn_minor == SUM(balance_ledger.amount_htgn_minor)` is enforced by `reconcileBalance()` on every dev boot and documented as a test-able property in Phase 8.
**Tradeoff:** Settlement math needs a tiny bit of extra care — on `SETTLED_WON`, we credit the full `potential_payout_htgn` (stake + profit), not just the profit, because the stake was already debited. Worked through in `settlementWorker.applySettlement` and covered by the Phase 8 settlement tests.

---

## D-012 — Integer minor units everywhere for money

**Context:** IEEE 754 floats silently lose precision (`0.1 + 0.2 === 0.30000000000000004`). Production fintech code that does arithmetic on money in floats eventually drifts, and the drift is visible to users as off-by-one-centime balance errors.
**Decision:** All money is integer minor units (1 HTGN = 100 minor) from the schema up to the UI boundary. Conversion to/from floats happens **only** at `formatHTGN` / `toMinor` / `fromMinor` in `src/utils/money.ts`. SQLite columns are `INTEGER`. Zustand fields are `number` but always integers. `toMinor` uses half-even rounding (D-004).
**Why:** Every modern fintech style guide says this. Stripe stores amounts as integer cents. Same pattern.
**Tradeoff:** UI developers can't just `stake * odds` in a render — they have to route through `calculatePayout(stakeMinor, odds)`. A small discipline cost for a large correctness win. Phase 8's 1000-iteration round-trip test (`money.test.ts`) pins the rule.

---

## D-013 — Mock backend fails retryably only; no REJECTED state

**Context:** A real bet-submission backend has two failure modes: transient (network, overloaded server — worth retrying) and permanent (invalid odds, account limit exceeded — should be rejected outright). A proper state machine would include `REJECTED → VOID_REFUNDED` as a terminal rejection path.
**Decision:** The mock backend (`mockBackend.confirmBet`) only produces transient failures (`{ok: false, reason: 'simulated network error'}`). Sync worker treats every failure as retryable; after 5 attempts, the bet transitions to `VOID_REFUNDED` with a matching `refund_void` ledger entry. No `REJECTED` state in the schema.
**Why:** Scope — demonstrating the offline-queue + retry + void-refund cycle is the interesting Brief 1 behavior. A rejection path would add a fifth state + a rejection reason column + UI copy for each reason without exercising new architecture.
**Tradeoff:** When Nclusion's real backend lands, someone has to add `REJECTED` as a bet status, extend the state machine in `bets.ts`, and update the sync worker to branch on the reason code. Small change, clearly bounded — noted here so the next person doesn't have to rediscover it.

---

## D-014 — Haitian Creole primary; English only in DEV-prefixed strings

**Context:** CLAUDE.md §8 is strict: no English in user-facing UI. But devs need scrutable labels for component galleries, reset buttons, and smoke tests without having to translate every DEV artifact.
**Decision:** All production UI copy goes through `react-i18next` with `ht.json` as default and `fr.json` as fallback. Any string prefixed `DEV:` is English-only and stays inline (not in i18n files). Grep-friendly: `grep "DEV:" app/ src/` finds every dev-only string.
**Why:** Clear authorial intent — Creole-first honors Nclusion's "start with humility" posture (CLAUDE.md §1). The `DEV:` carve-out keeps reviewers unconfused about which controls are dev-only without cluttering i18n.
**Tradeoff:** Language endonyms in the toggle ("Kreyòl" / "Français") are treated as language-neutral literals, not i18n keys — a pattern borrowed from every mainstream language picker.

---

## D-015 — French pluralization deferred; demo uses always-plural form

**Context:** French grammatical plural requires inflection: `1 pari en attente` vs. `3 paris en attente` (note "paris"). `i18next` supports this via `_one` / `_other` suffixed keys and ICU format. Creole has no morphological plural, so `{{count}} pari k ap tann` is grammatical for any count.
**Decision:** Shipped the always-plural French form (`{{count}} paris en attente`). Proper `_one` / `_other` keys deferred.
**Why:** The offline banner is the only string with a count interpolation, and shipping "1 paris" for one bet is visually acceptable in a demo. Setting up the plural keys for one string isn't worth the plumbing.
**Tradeoff:** Pre-launch review pass should fix this when the native-speaker Creole / French copy audit happens (D-003 notes the same review is already owed).

---

## D-016 — Sòl / group-bet feature de-scoped to FUTURE_WORK.md

**Context:** CLAUDE.md §1 flags Nclusion's community-traditions UX layer as a core product pillar. A sòl-inspired group-bet feature (multiple users pool stakes on a shared bet, winnings distributed proportionally) would be the strongest cultural-alignment signal in this submission.
**Decision:** Cut. Design sketch lives in [FUTURE_WORK.md](./FUTURE_WORK.md).
**Why:** Implementing it right requires a multi-user sync story (at least a shared group identifier + contribution tracking), a share-link / QR flow, and proportional settlement math. Any two of those three is achievable in a weekend; all three plus existing scope isn't, and a half-built group-bet would undersell the cultural point.
**Tradeoff:** Lose the strongest "we get Haitian community finance" demo beat. Compensate by calling it out explicitly in the Loom script / README and showing the ~150-word design sketch in FUTURE_WORK — signals that the thought was deliberate, not an omission.

---

## D-017 — Loom walkthrough video dropped in favor of `LOOM_SCRIPT.md` + demo GIF

**Context:** CLAUDE.md §13 originally called for a Loom walkthrough. Nclusion's hiring briefs don't actually require one, and the reviewer audience (engineering leadership) generally prefers a concise written walkthrough + a short GIF for visual proof over a multi-minute talking-head video.
**Decision:** Commit `LOOM_SCRIPT.md` at the repo root with the same 5-scene structure that the Loom would have had. A demo GIF will be captured during Phase 12 polish. No Loom recording.
**Why:** Scripts are skimmable; videos aren't. A GIF costs nothing extra given the app already runs on the emulator. Anyone who genuinely prefers a video can read the script and watch the GIF side-by-side in 90 seconds.
**Tradeoff:** Lose the "hear Alan's voice narrate the design thinking" dimension. Compensate via the DECISION_LOG and the CLAUDE.md / STEPS.md documents, all of which convey design thinking in text form.

---

## D-018 — Brief 2 (Solana) deferred at submission

**Context:** CLAUDE.md §0 frames the project as addressing both of Nclusion's hiring briefs on a single codebase: Brief 1 (offline-first mobile sports betting) and Brief 2 (Solana HTGN settlement). CLAUDE.md §14 explicitly contemplates the `v1-production-ready` tag as an acceptable submission if Brief 2 integration goes sideways: "Brief 1 is complete, Brief 2 is partially implemented. This is an acceptable outcome."
**Decision:** Submit Brief 1 only at the `v1-production-ready` tag. Brief 2 is not scaffolded in this repo — there is no `SettlementProvider` interface split, no `MockSettlementProvider` / `SolanaSettlementProvider` classes, no `/solana/` directory, no `SETTLEMENT_PROVIDER` env var, no Anchor program. `settlementWorker.ts` talks directly to `mockBackend`. The Brief 2 architecture sketch is carried forward in FUTURE_WORK.md.
**Why:** Time budget. The Monday capstone plus parallel Superbuilders / GFA commitments left no contiguous block for the Anchor program + TS client + devnet deployment that a credible Brief 2 requires. A half-built Brief 2 — an interface seam with a stub provider, no on-chain program — would undersell the two-brief framing more than a clean, dated deferral does. CLAUDE.md §2 is explicit: "ship two briefs' worth of core loop, beautifully. Do not sprawl." The Brief 1 submission meets the "beautifully" bar; a thin Brief 2 would not.
**Tradeoff:** Lose the Solana demo beat entirely. Compensate by carrying the full architecture sketch in FUTURE_WORK.md — interface shape, Anchor instructions, state-machine mapping, non-blocking-UI invariant, and the remaining engineering list — so the interview conversation has a concrete place to land when Brief 2 comes up. This entry makes the scope decision explicit and dated rather than leaving it as an apparent omission.
