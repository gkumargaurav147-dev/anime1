import type { AgeBracket } from '@anime/shared-types';

export const MIN_AGE = 13;
export const ADULT_AGE = 18;
const MAX_AGE = 120;

export type AgeResult =
  { ok: true; age: number } | { ok: false; reason: 'invalid_date' | 'future_date' | 'implausible' };

/** Exact age in whole years, computed in UTC. The full date is used here and then discarded. */
export function computeAge(
  year: number,
  month: number,
  day: number,
  now: Date = new Date(),
): AgeResult {
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (
    birth.getUTCFullYear() !== year ||
    birth.getUTCMonth() !== month - 1 ||
    birth.getUTCDate() !== day
  ) {
    return { ok: false, reason: 'invalid_date' };
  }
  if (birth.getTime() > now.getTime()) return { ok: false, reason: 'future_date' };

  let age = now.getUTCFullYear() - year;
  const hadBirthdayThisYear =
    now.getUTCMonth() > month - 1 || (now.getUTCMonth() === month - 1 && now.getUTCDate() >= day);
  if (!hadBirthdayThisYear) age -= 1;

  if (age > MAX_AGE) return { ok: false, reason: 'implausible' };
  return { ok: true, age };
}

export const bracketForAge = (age: number): AgeBracket => (age < ADULT_AGE ? 'teen' : 'adult');
