# FUTURE_WORK.md — Pari Ayiti

Deferred items. Items here were cut deliberately — see DECISION_LOG.md for the rationale trail. Anyone picking up the codebase can start at the top.

---

## Headline feature: sòl / group-bet

**Cultural anchor.** The sòl (also spelled sol in contemporary Creole, and cognate to the West African esusu, Dominican san, and Kenyan chama) is a Haitian ROSCA — a rotating savings and credit association where community members pool contributions into a shared fund. Sòl is how a huge fraction of unbanked Haiti actually moves money. Nclusion's community-traditions UX pillar (CLAUDE.md §1) is built around exactly this pattern.

**Data model.**

```sql
CREATE TABLE bet_groups (
  id TEXT PRIMARY KEY,              -- UUIDv4
  name TEXT NOT NULL,               -- "Pari Ayiti vs. Brezil" — user-supplied
  creator_id TEXT NOT NULL,         -- device-local user id (or phone number)
  target_pool_minor INTEGER,        -- optional target before lock-in
  match_id TEXT NOT NULL,
  selection TEXT NOT NULL,          -- the whole group bets the same outcome
  odds_at_close REAL,               -- snapshotted when the group locks in
  status TEXT NOT NULL,             -- 'open' | 'locked' | 'settled' | 'voided'
  created_at INTEGER NOT NULL,
  FOREIGN KEY (match_id) REFERENCES matches(id)
);

CREATE TABLE group_members (
  group_id TEXT NOT NULL,
  client_bet_id TEXT NOT NULL,      -- each member's individual bet row
  contribution_minor INTEGER NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, client_bet_id),
  FOREIGN KEY (group_id) REFERENCES bet_groups(id),
  FOREIGN KEY (client_bet_id) REFERENCES bets(client_bet_id)
);
```

**UX.** From the match detail screen, a "Kreye yon gwoup" ("Create a group") button generates a shareable link / QR. Friends open the link in Pari Ayiti and contribute their own HTGN stake to the group's pool. When the creator locks the group, odds are snapshotted, each member's individual bet row is upserted with the shared `selection`, and settlement (§Phase 7) uses the per-member `contribution_minor` × `odds_at_close` × `outcome` to distribute winnings.

**Proportional settlement.** On win, `credit_winnings = floor(contribution_minor × odds_at_close)` per member. On loss, no credit (stakes already debited per D-011). On void (all 5 sync attempts failed for any member), the group transitions to `voided` and every member gets a `refund_void` entry restoring their stake.

**Why cut.** Shipping this well requires (1) a multi-user sync story beyond the current single-device mock backend, (2) the share-link / QR flow with deep-link handling, and (3) proportional settlement math verified end-to-end. Any two is doable in a weekend; all three plus existing scope isn't. See DECISION_LOG D-016.

---

## Other deferred items

### Language / copy
- **Native-speaker Creole + French copy audit** (D-003 already calls for it). The current strings are conservative and derived from vocabulary in CLAUDE.md §8, but a Haiti-based reviewer would likely tighten tone and idiom in a pass.
- **Proper i18next pluralization** using `_one` / `_other` keys (D-015). Currently the offline banner renders `1 paris en attente` — grammatically incorrect French for `count === 1`.
- **Creole `date-fns` locale** (D-003). Hand-rolled Creole day/month substitution table or a community-contributed locale package; either would let dates in the ht UI read as `vandredi 11 jen 2026 à 16h00` instead of the current French rendering.

### Data usage
- **"Done w itilize jodi a" counter** (D-008). Wrap every `fetch` in a small `fetchJson(url)` helper that reads `Content-Length` from the response and accumulates into `AsyncStorage` with a daily rollover. Show in Paramèt as a dignity-forward signal of data respect.

### Platform coverage
- **iOS support.** The app is Android-only per CLAUDE.md §11. Expo Router is cross-platform, so the path to iOS is mostly dependency verification (`react-native-safe-area-context`, `@react-native-community/netinfo`, `expo-sqlite`) and Apple's provisioning dance. Estimate: half a day plus Apple-account admin.
- **Tablets.** Untested. The match-list cards and bet-detail layout would need minor breakpoint work.

### Auth + real backend
- **Real user authentication.** Currently single demo user with local-device-only identity. A real launch needs phone-number OTP (to align with the agency-banking cash-in/cash-out rail) + a server-side user record.
- **Real Nclusion backend integration.** The `mockBackend.confirmBet` / `fetchBetStatus` interface is the seam. Swap in an HTTPS client pointed at Nclusion's bet-submission endpoint; `client_bet_id` already works as the idempotency key. No schema changes required.
- **REJECTED bet state** (D-013). Add as a fifth terminal status with a `reject_reason` column and localized copy per reason code (`odds_moved`, `market_closed`, `account_suspended`, etc.).

### Auditability
- **Cryptographic audit trail.** Hash-chain the `balance_ledger` rows so any tampering is detectable client-side. Small schema addition (`prev_hash TEXT`) + a verifier that runs alongside `reconcileBalance()`.
- **Server-side ledger replication.** When a real backend exists, each ledger entry should stream up on sync so Nclusion has a second source of truth for auditing.

### Responsible gambling
- **Session-time limits.** Current daily-stake cap is a one-dimensional signal; a "time spent in app today" warning would complement it.
- **Cool-off / self-exclusion.** A user-triggered pause flow (24 hours, 7 days, 30 days) that blocks new bet placement.
- **Spend analytics.** Simple week/month-over-week stake totals visible in the ledger screen. Helps users notice patterns.

### Infra / dev experience
- **CI.** GitHub Actions: `npm test`, `tsc --noEmit`, `expo export --platform android` on every PR. Two hours of setup.
- **Sentry / Crashlytics.** Real error monitoring for production builds.
- **Automated UI regression via Maestro or Detox.** CLAUDE.md §11 explicitly de-scopes E2E, but a five-test happy-path Maestro suite (place bet, settle, reset DB) would catch most regressions before they hit a reviewer.

### Solana (Brief 2)
- **SolanaSettlementProvider runtime.** Phase 11 delivers the interface and Anchor program; Phase 11.7 wires the TS client. Items still owed after that: RPC fallback hierarchy, retries with exponential backoff, and a user-visible "view on chain" link per bet once `onchain_tx_id` is populated.
- **Keyring security.** Current design stores the dev wallet in a gitignored JSON; production needs a platform keystore (Android Keystore / iOS Keychain) and a passphrase-unlock flow.
