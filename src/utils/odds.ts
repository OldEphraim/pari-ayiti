// Decimal odds semantics: the payout multiplier, inclusive of stake
// returned. A bet at decimal odds 3.0 on a 100-minor stake yields
// 300 minor on win (100 stake returned + 200 profit).

export function impliedProbability(decimalOdds: number): number {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) {
    throw new Error(
      `impliedProbability: decimal odds must be > 1, got ${decimalOdds}`,
    );
  }
  return 1 / decimalOdds;
}

// Floor rather than round: the house keeps any fractional minor unit.
// See DECISION_LOG D-002 for the house-favoring tradeoff. User-favoring
// would use Math.ceil but we opted for simpler and more conservative math.
export function calculatePayout(stakeMinor: number, decimalOdds: number): number {
  if (!Number.isInteger(stakeMinor) || stakeMinor < 0) {
    throw new Error(
      `calculatePayout: stakeMinor must be a non-negative integer, got ${stakeMinor}`,
    );
  }
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) {
    throw new Error(
      `calculatePayout: decimal odds must be > 1, got ${decimalOdds}`,
    );
  }
  return Math.floor(stakeMinor * decimalOdds);
}
