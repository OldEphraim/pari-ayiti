// All balance and stake values are stored as integer minor units
// (1 HTGN = 100 minor units). Floats never cross into the DB or the
// state layer — see CLAUDE.md §4.5, §9 ("Money invariant").

// IEEE 754 half-even (banker's) rounding. JavaScript's built-in
// Math.round is half-up (rounds 0.5 toward +∞), which the spec in
// CLAUDE.md §3 explicitly rejects. See DECISION_LOG D-004.
function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  // Exactly 0.5 — round to the nearest even integer.
  return floor % 2 === 0 ? floor : floor + 1;
}

export function toMinor(htgn: number): number {
  if (!Number.isFinite(htgn)) {
    throw new Error(`toMinor: expected finite number, got ${htgn}`);
  }
  return roundHalfEven(htgn * 100);
}

export function fromMinor(minor: number): number {
  if (!Number.isInteger(minor)) {
    throw new Error(`fromMinor: expected integer minor units, got ${minor}`);
  }
  return minor / 100;
}

// One formatter instance reused across calls — Intl.NumberFormat
// construction is non-trivial and stable inputs give identical output.
const htgnNumberFormat = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatHTGN(minor: number, _locale: 'ht' | 'fr'): string {
  if (!Number.isInteger(minor)) {
    throw new Error(`formatHTGN: expected integer minor units, got ${minor}`);
  }
  // Haitian Creole borrows French number conventions (space thousands,
  // comma decimal). We pass the locale param for future divergence but
  // currently format both the same way.
  return `G ${htgnNumberFormat.format(minor / 100)}`;
}
