import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

// Single mockable point-of-truth for "current time" in unix seconds.
// The DB schema stores all timestamps as unix seconds (CLAUDE.md §4.5).
export function now(): number {
  return Math.floor(Date.now() / 1000);
}

// date-fns has no Haitian Creole locale; per DECISION_LOG D-003 we use
// the French locale for both UIs as a pragmatic concession.
const DATE_PATTERN = "EEE d MMM yyyy 'à' HH'h'mm";

export function formatDate(unixSeconds: number, _locale: 'ht' | 'fr'): string {
  if (!Number.isFinite(unixSeconds)) {
    throw new Error(`formatDate: expected finite unix seconds, got ${unixSeconds}`);
  }
  return format(new Date(unixSeconds * 1000), DATE_PATTERN, { locale: fr });
}
