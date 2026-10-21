/**
 * Deterministic pseudo-random numbers.
 *
 * Mock data and property tests share this generator so both are reproducible
 * from a fixed seed, which is a hard requirement for the test suite.
 */

/**
 * Creates a seeded PRNG (mulberry32).
 *
 * @example
 * const random = createRandom(42);
 * random.nextInt(1, 6); // deterministic dice roll
 */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const random: Random = {
    next,
    nextInt(minInclusive: number, maxInclusive: number): number {
      const span = maxInclusive - minInclusive + 1;
      return minInclusive + Math.floor(next() * span);
    },
    nextFloat(min: number, max: number): number {
      return min + next() * (max - min);
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('Cannot pick from an empty list');
      return items[Math.floor(next() * items.length)]!;
    },
    chance(probability: number): boolean {
      return next() < probability;
    },
  };
  return random;
}

/** A seeded random number generator. */
export interface Random {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [minInclusive, maxInclusive]. */
  nextInt(minInclusive: number, maxInclusive: number): number;
  /** Uniform float in [min, max). */
  nextFloat(min: number, max: number): number;
  /** Uniformly picks one item. */
  pick<T>(items: readonly T[]): T;
  /** True with the given probability. */
  chance(probability: number): boolean;
}
