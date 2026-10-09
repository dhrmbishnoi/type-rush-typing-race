import { COMBO_MILESTONES, COUNTDOWN_MS, RACE_DURATION_MS } from './constants';
import { WORD_LIST } from './wordList';
import { nextRandom } from './random';
import { calcAccuracy, calcWpm, roundTo1, wordPoints } from './stats';

/**
 * Single authoritative race state. The reducer is pure: all time comes from
 * `now` on actions and all randomness comes from the seeded `rng` field, so
 * React StrictMode double-invocation and tests behave deterministically.
 */
export type Phase = 'countdown' | 'running' | 'paused' | 'finished';

export interface RaceState {
  /** Increments on every restart; used to guard once-per-race side effects. */
  raceId: number;
  phase: Phase;
  countdownMs: number;
  /** Active race time (excludes countdown and pauses). */
  elapsedMs: number;
  /** Wall-clock timestamp of the last clock update, or null while frozen. */
  lastTick: number | null;
  rng: number;
  /** The one word the player must type. */
  target: string;
  /** Authoritative typed buffer for `target`; always shorter than `target`. */
  typed: string;
  completedWords: number;
  /** Printable keystrokes that matched the expected character at their position. */
  correctKeys: number;
  /** All printable keystrokes (correct, wrong, or rejected). Backspace is excluded. */
  totalKeys: number;
  combo: number;
  bestCombo: number;
  score: number;
  /** Decorative feedback counters; each change triggers one animation. */
  shakeId: number;
  burstId: number;
  boostId: number;
  milestoneLevel: number;
  milestoneId: number;
}

export type RaceAction =
  | { type: 'restart'; seed: number; now: number }
  | { type: 'tick'; now: number }
  | { type: 'input'; value: string }
  | { type: 'toggle-pause'; now: number };

function pickNextWord(rng: number, previous: string | null): { word: string; rng: number } {
  const roll = nextRandom(rng);
  let index = Math.floor(roll.value * WORD_LIST.length);
  if (WORD_LIST[index] === previous) index = (index + 1) % WORD_LIST.length;
  return { word: WORD_LIST[index], rng: roll.state };
}

export function createRaceState(seed: number, now: number, raceId: number): RaceState {
  const first = pickNextWord(seed | 0, null);
  return {
    raceId,
    phase: 'countdown',
    countdownMs: COUNTDOWN_MS,
    elapsedMs: 0,
    lastTick: now,
    rng: first.rng,
    target: first.word,
    typed: '',
    completedWords: 0,
    correctKeys: 0,
    totalKeys: 0,
    combo: 0,
    bestCombo: 0,
    score: 0,
    shakeId: 0,
    burstId: 0,
    boostId: 0,
    milestoneLevel: 0,
    milestoneId: 0,
  };
}

/** Adds active race time; finishes the race exactly at the duration limit. */
function runRace(state: RaceState, deltaMs: number, now: number): RaceState {
  const elapsedMs = state.elapsedMs + deltaMs;
  if (elapsedMs >= RACE_DURATION_MS) {
    return { ...state, phase: 'finished', elapsedMs: RACE_DURATION_MS, lastTick: null };
  }
  return { ...state, elapsedMs, lastTick: now };
}

function tick(state: RaceState, now: number): RaceState {
  if (state.phase !== 'countdown' && state.phase !== 'running') return state;
  if (state.lastTick === null) return { ...state, lastTick: now };
  const delta = Math.max(0, now - state.lastTick);

  if (state.phase === 'countdown') {
    const remaining = state.countdownMs - delta;
    if (remaining > 0) return { ...state, countdownMs: remaining, lastTick: now };
    // Carry the overshoot into the race clock so no time is lost at the handoff.
    return runRace({ ...state, phase: 'running', countdownMs: 0 }, -remaining, now);
  }
  return runRace(state, delta, now);
}

/** Brings the clock up to `now` (used right before freezing for pause). */
function accrue(state: RaceState, now: number): RaceState {
  if (state.phase !== 'running' || state.lastTick === null) return state;
  return runRace(state, Math.max(0, now - state.lastTick), now);
}

function togglePause(state: RaceState, now: number): RaceState {
  if (state.phase === 'running') {
    const accrued = accrue(state, now);
    if (accrued.phase !== 'running') return accrued; // expired before the pause landed
    return { ...accrued, phase: 'paused', lastTick: null };
  }
  if (state.phase === 'paused') {
    return { ...state, phase: 'running', lastTick: now };
  }
  return state;
}

function isPrintable(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return code >= 0x20 && code !== 0x7f;
}

function registerWrongKey(state: RaceState): RaceState {
  return { ...state, combo: 0, shakeId: state.shakeId + 1 };
}

function completeWord(state: RaceState): RaceState {
  const next = pickNextWord(state.rng, state.target);
  return {
    ...state,
    completedWords: state.completedWords + 1,
    score: state.score + wordPoints(state.combo),
    typed: '',
    target: next.word,
    rng: next.rng,
    burstId: state.burstId + 1,
    boostId: state.boostId + 1,
  };
}

/** Processes exactly one printable character against the current target. */
function typeChar(state: RaceState, ch: string): RaceState {
  if (!isPrintable(ch)) return state;
  const totalKeys = state.totalKeys + 1;

  // Buffer already full (only possible with a wrong final character): reject.
  if (state.typed.length >= state.target.length) {
    return registerWrongKey({ ...state, totalKeys });
  }

  const expected = state.target[state.typed.length];
  if (ch !== expected) {
    // Wrong characters stay in the buffer so Backspace is needed to correct them.
    return registerWrongKey({ ...state, totalKeys, typed: state.typed + ch });
  }

  const combo = state.combo + 1;
  let next: RaceState = {
    ...state,
    totalKeys,
    correctKeys: state.correctKeys + 1,
    combo,
    bestCombo: Math.max(state.bestCombo, combo),
    typed: state.typed + ch,
  };
  if (COMBO_MILESTONES.includes(combo)) {
    next = { ...next, milestoneLevel: combo, milestoneId: state.milestoneId + 1 };
  }
  // Exact full match is the only thing that advances the word.
  return next.typed === next.target ? completeWord(next) : next;
}

function backspace(state: RaceState): RaceState {
  if (state.typed.length === 0) return state;
  return { ...state, typed: state.typed.slice(0, -1) };
}

/**
 * Applies a controlled-input value. The value is diffed against the
 * authoritative `state.typed`: characters removed become Backspaces and
 * characters added become keystrokes. Once a word completes, the rest of this
 * input event is ignored so one event can never advance twice.
 */
function applyInput(state: RaceState, value: string): RaceState {
  if (state.phase !== 'running') return state;

  const previous = state.typed;
  const limit = Math.min(previous.length, value.length);
  let common = 0;
  while (common < limit && previous[common] === value[common]) common++;

  let next = state;
  for (let i = previous.length; i > common; i--) next = backspace(next);

  for (const ch of value.slice(common)) {
    const completedBefore = next.completedWords;
    next = typeChar(next, ch);
    if (next.completedWords !== completedBefore) break;
  }
  return next;
}

export function raceReducer(state: RaceState, action: RaceAction): RaceState {
  switch (action.type) {
    case 'restart':
      return createRaceState(action.seed, action.now, state.raceId + 1);
    case 'tick':
      return tick(state, action.now);
    case 'input':
      return applyInput(state, action.value);
    case 'toggle-pause':
      return togglePause(state, action.now);
    default:
      return state;
  }
}

export interface RaceSummary {
  raceId: number;
  score: number;
  wpm: number;
  accuracy: number;
  completedWords: number;
  bestCombo: number;
  correctKeys: number;
  totalKeys: number;
}

/** Derived, display-ready result of a race. Rounded values are what gets stored. */
export function summarizeRace(state: RaceState): RaceSummary {
  return {
    raceId: state.raceId,
    score: state.score,
    wpm: roundTo1(calcWpm(state.completedWords, state.elapsedMs)),
    accuracy: roundTo1(calcAccuracy(state.correctKeys, state.totalKeys)),
    completedWords: state.completedWords,
    bestCombo: state.bestCombo,
    correctKeys: state.correctKeys,
    totalKeys: state.totalKeys,
  };
}
