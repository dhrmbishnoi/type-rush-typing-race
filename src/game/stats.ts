import { RACE_DURATION_MS } from './constants';

/** WPM = completed words / elapsed minutes. Zero (or negative) elapsed time yields 0. */
export function calcWpm(completedWords: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return completedWords / (elapsedMs / 60_000);
}

/**
 * Accuracy = correct printable keystrokes / total printable keystrokes × 100.
 * Zero keystrokes yields 0 so an idle race cannot report a perfect score.
 */
export function calcAccuracy(correctKeys: number, totalKeys: number): number {
  if (totalKeys <= 0) return 0;
  return (correctKeys / totalKeys) * 100;
}

/** Points for completing one word: 10 base plus 1 per 10 combo (capped at +10). */
export function wordPoints(combo: number): number {
  return 10 + Math.min(Math.floor(combo / 10), 10);
}

/** Whole seconds shown on the timer; reaches 0 exactly when the race ends. */
export function secondsRemaining(elapsedMs: number): number {
  const remainingMs = Math.max(0, RACE_DURATION_MS - elapsedMs);
  return Math.ceil(remainingMs / 1000);
}

export function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}
