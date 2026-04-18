# DECISION_LOG.md — Pari Ayiti

Architectural and scope decisions, in chronological order. See CLAUDE.md §2 and §11 for scope discipline.

---

## D-001 — Expo SDK version pinned

**Context:** CLAUDE.md §3 requires pinning the Expo SDK at kickoff and recording it here.
**Decision:** Expo SDK **54.0.33** (dependency range `~54.0.33`), via `npx create-expo-app@latest --template blank-typescript` on 2026-04-18. React `19.1.0`, React Native `0.81.5`, TypeScript `~5.9.2`.
**Why:** Latest stable at kickoff; matches CLAUDE.md §3 guidance.
**Tradeoff:** Locked in; no mid-project upgrades. Any Expo-module install later in the build will use the SDK 54-compatible version resolved by `npx expo install`.
