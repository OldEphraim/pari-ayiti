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
