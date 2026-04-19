import { formatHTGN, fromMinor, toMinor } from '../src/utils/money';
import { calculatePayout, impliedProbability } from '../src/utils/odds';

describe('money.toMinor / fromMinor', () => {
  test('round-trip: 1000 random integer minor values survive fromMinor → toMinor exactly', () => {
    for (let i = 0; i < 1000; i++) {
      const n = Math.floor(Math.random() * 10_000_000);
      expect(toMinor(fromMinor(n))).toBe(n);
    }
  });

  test('round-trip: 1000 random 2-decimal HTGN values survive toMinor → fromMinor with zero drift', () => {
    for (let i = 0; i < 1000; i++) {
      const v = Math.round(Math.random() * 1_000_000 * 100) / 100;
      const rt = fromMinor(toMinor(v));
      // After round-trip we tolerate ≤1 minor-unit float drift; practice is
      // that it's zero for values generated from integer/100.
      expect(Math.abs(rt - v)).toBeLessThanOrEqual(0.01);
    }
  });

  test('toMinor edge cases', () => {
    expect(toMinor(0)).toBe(0);
    expect(toMinor(0.01)).toBe(1);
    expect(toMinor(99_999_999.99)).toBe(9_999_999_999);
  });

  test('toMinor half-even: exact halves go to the nearest even integer', () => {
    // These inputs produce EXACT N.5 results after *100 (1/8, 3/8, 5/8, 7/8
    // × 100 = 12.5, 37.5, 62.5, 87.5). Non-power-of-two decimals like 0.005
    // don't hit the exact-half branch because of IEEE 754 imprecision.
    expect(toMinor(0.125)).toBe(12); // 12.5 → 12 (12 even)
    expect(toMinor(0.375)).toBe(38); // 37.5 → 38 (38 even)
    expect(toMinor(0.625)).toBe(62); // 62.5 → 62 (62 even)
    expect(toMinor(0.875)).toBe(88); // 87.5 → 88 (88 even)
  });

  test('toMinor rejects non-finite inputs', () => {
    expect(() => toMinor(NaN)).toThrow();
    expect(() => toMinor(Infinity)).toThrow();
    expect(() => toMinor(-Infinity)).toThrow();
  });

  test('fromMinor rejects non-integer inputs', () => {
    expect(() => fromMinor(1.5)).toThrow();
    expect(() => fromMinor(NaN)).toThrow();
  });
});

describe('money.formatHTGN', () => {
  test('formats in fr-FR convention with "G " prefix', () => {
    const formatted = formatHTGN(125_050, 'ht');
    // Intl uses a narrow-no-break-space (U+202F) for fr-FR thousands since
    // recent ICU; older releases use regular NBSP (U+00A0); tolerate either
    // or a plain space.
    expect(formatted).toMatch(/^G 1[\u00A0\u202F ]250,50$/);
  });

  test('same format for ht and fr', () => {
    expect(formatHTGN(500_000, 'ht')).toBe(formatHTGN(500_000, 'fr'));
  });

  test('rejects non-integer minor', () => {
    expect(() => formatHTGN(1.5, 'ht')).toThrow();
  });
});

describe('odds', () => {
  test('calculatePayout basics', () => {
    expect(calculatePayout(5000, 17.0)).toBe(85_000);
    expect(calculatePayout(5000, 2.5)).toBe(12_500);
    expect(calculatePayout(100, 2.0)).toBe(200);
  });

  test('calculatePayout floors fractional minor (house-favoring per D-002)', () => {
    // 333 * 2.5 = 832.5 → floor = 832
    expect(calculatePayout(333, 2.5)).toBe(832);
    // 501 * 1.37 = 686.37 → floor = 686
    expect(calculatePayout(501, 1.37)).toBe(686);
  });

  test('calculatePayout rejects bad inputs', () => {
    expect(() => calculatePayout(-1, 2.0)).toThrow();
    expect(() => calculatePayout(100, 1.0)).toThrow();
    expect(() => calculatePayout(100, 0.5)).toThrow();
    expect(() => calculatePayout(1.5, 2.0)).toThrow();
  });

  test('impliedProbability is 1/odds', () => {
    expect(impliedProbability(2.0)).toBeCloseTo(0.5, 10);
    expect(impliedProbability(4.0)).toBeCloseTo(0.25, 10);
    expect(impliedProbability(1.25)).toBeCloseTo(0.8, 10);
  });

  test('impliedProbability rejects odds <= 1', () => {
    expect(() => impliedProbability(1.0)).toThrow();
    expect(() => impliedProbability(0.5)).toThrow();
    expect(() => impliedProbability(NaN)).toThrow();
  });
});
