# LOOM_SCRIPT.md — Pari Ayiti walkthrough

This document replaces a recorded Loom — see DECISION_LOG.md **D-017**. It's a 5-scene walkthrough of the app, structured the way a short video would be paced. Readers who prefer a 90-second skim over a 4-minute video should find this sufficient.

**Setup before the walkthrough:** `DEV: Reset database` from Paramèt so the ledger contains only `initial_grant` and balance is `G 5 000,00`. Language defaults to Kreyòl.

---

## Scene 1 · App tour (≈ 60s)

**Objective:** Establish what the app is and who it's for.

Narrate while tapping:
1. "This is Pari Ayiti — an offline-first HTGN-denominated sports betting app, aimed at Haitian viewers of the 2026 FIFA World Cup over 2G connections."
2. Paramèt → flip language **Kreyòl ↔ Français**. Tab labels update live (`Match yo` / `Istwa` / `Paramèt` → `Matchs` / `Historique` / `Paramètres`). "First-class Creole UI; French as fallback. No English visible anywhere outside DEV controls."
3. Match yo → scroll the list. "Real Group C — Haiti's actual World Cup opponents: Brazil, Morocco, Scotland. Dates pulled from FIFA's published schedule. Fixture-primary data so the demo works with zero API quota."
4. Tap **Brazil vs. Haiti** → the 17.00 away-side odds button. "Haiti at 17-to-1 against Brazil — longshot, which is exactly the dignity-first demo beat."
5. Enter stake **50** HTGN. Potential payout shows live: **G 850,00**. Tap **Konfime pari a**. Return to match list; banner "Pari w la anrejistre" fades in and out within 250ms. Balance decreases immediately.

**What the reviewer should notice:** language toggle is instant, not a restart. Balance debits atomically with the bet insert — no projection layer. No blocking modal on confirm.

---

## Scene 2 · Offline placement (≈ 60s)

**Objective:** Prove the offline queue.

1. Tap **Paramèt → DEV: Simulate flaky network** → ON. (In the real Loom, this would be airplane mode; either works.)
2. Back to Match yo → place a second bet, any match, small stake.
3. Tap **Istwa** → this bet is `K ap tann koneksyon` (PENDING_SYNC). Balance already reflects the debit.
4. Return to Match yo → offline banner fades in with `{{count}} pari k ap tann` reflecting live pending count. Animation is a 250ms translate-Y + opacity, no janky jump.

**What the reviewer should notice:** the UI doesn't treat offline as an error. Bet state is written locally and a worker handles sync opportunistically. The banner is a reassurance, not a warning.

---

## Scene 3 · Reconnection drain (≈ 45s)

**Objective:** Prove the sync worker.

1. Paramèt → toggle flaky **OFF**.
2. Home button → reopen the app (or just wait — `AppState 'active'` listener fires `runWorkersAndHydrate`).
3. Istwa → the pending bet transitions to `K ap tann rezilta` (PENDING_SETTLEMENT).

**What the reviewer should notice:** the worker is re-entrant (concurrency guarded), logs its drain summary (in DEV), and doesn't block any UI interaction. The Zustand store is hydrated from DB after each drain — the UI never shows speculative state.

---

## Scene 4 · Settlement + ledger audit (≈ 45s)

**Objective:** Prove the full state machine + the dignity-forward audit trail.

1. Istwa → on the Haiti vs. Brazil bet (PENDING_SETTLEMENT), tap the `__DEV__`-gated **DEV: Simile rezilta**.
2. Pick **Lakay genyen** (home wins — i.e., Brazil wins, since Brazil is listed as home). The bet settles to `Ou pèdi` (SETTLED_LOST). Balance is unchanged (stake was already debited at placement).
3. Paramèt → **Wè ledger balans lan** → `Solde actuel` header shows the current balance. Below it, every ledger entry reverse-chronologically: Mize (`-G 50,00` in muted text), Mize for the offline bet, and further back the `Kado inisyal` row (`+G 5 000,00` in black).
4. Narrate: "Every stake, every win, every refund is a signed row in the ledger. `reconcileBalance()` runs on every dev boot and asserts `balance.htgn_minor == SUM(balance_ledger.amount_htgn_minor)`. This invariant is the auditability signal."

**What the reviewer should notice:** the ledger is **the** source of truth for money movements. A real Nclusion deployment would replicate these rows to a server so there are two independent audit trails.

---

## Scene 5 · Nclusion pillar mapping (≈ 30s)

**Objective:** Close by mapping what they just saw to Nclusion's three product pillars.

> "What I just demoed maps onto Nclusion's three pillars from the public site:
>
> - **Stablecoin rails.** All math is in HTGN minor units; balance is authoritative; ledger is auditable. The mock provider is the Brief 1 implementation.
> - **Community-traditions UX.** Creole-first, no English visible, conservative humility-forward copy (`Ou pa gen ase HTGN pou pari sa a kounye a` rather than `Insufficient funds`). The sòl / group-bet feature in FUTURE_WORK.md is the natural next step on this axis.
> - **Agency-banking distribution.** The offline queue + sync worker means an agent anywhere in Haiti can onboard a bettor whose phone has 2G for only a few minutes a day. The architecture is ready for it.
>
> Brief 2 (Solana HTGN settlement) is deliberately deferred for this submission — see DECISION_LOG **D-018** for the scope call and FUTURE_WORK.md for the full architecture sketch (interface seam, Anchor instruction shape, and how the existing state machine maps onto on-chain settlement without changing the UI path). Happy to walk through that design in the interview."

---

## Handy URLs during the demo

- GitHub repo: `https://github.com/OldEphraim/pari-ayiti`
- `v1-production-ready` release: `https://github.com/OldEphraim/pari-ayiti/releases/tag/v1-production-ready`
- DECISION_LOG rationale trail: `./DECISION_LOG.md`
- FUTURE_WORK / sòl design sketch: `./FUTURE_WORK.md`
