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
