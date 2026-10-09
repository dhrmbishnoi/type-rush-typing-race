import { describe, expect, it } from 'vitest';
import { COUNTDOWN_MS, RACE_DURATION_MS } from './constants';
import { createRaceState, raceReducer, summarizeRace } from './raceReducer';
import type { RaceState } from './raceReducer';
import { WORD_LIST } from './wordList';
import { calcAccuracy, calcWpm, secondsRemaining, wordPoints } from './stats';

const T0 = 1_000_000;

/** Starts a fresh race and advances past the 3-2-1 countdown. */
function startRunning(seed = 42): RaceState {
  let s = createRaceState(seed, T0, 1);
  s = raceReducer(s, { type: 'tick', now: T0 + COUNTDOWN_MS });
  expect(s.phase).toBe('running');
  return s;
}

/** Types text one keystroke at a time, the same way the controlled input reports it. */
function typeText(state: RaceState, text: string): RaceState {
  let s = state;
  for (const ch of text) {
    s = raceReducer(s, { type: 'input', value: s.typed + ch });
  }
  return s;
}

/** Types a wrong character at the current position. */
function typeWrong(state: RaceState): RaceState {
  const wrong = state.target[state.typed.length] === 'z' ? 'y' : 'z';
  return raceReducer(state, { type: 'input', value: state.typed + wrong });
}

describe('createRaceState', () => {
  it('starts in the countdown with a single target word and zeroed statistics', () => {
    const s = createRaceState(7, T0, 3);
    expect(s.phase).toBe('countdown');
    expect(s.countdownMs).toBe(COUNTDOWN_MS);
    expect(s.elapsedMs).toBe(0);
    expect(s.raceId).toBe(3);
    expect(WORD_LIST).toContain(s.target);
    expect(s.typed).toBe('');
    expect([s.completedWords, s.correctKeys, s.totalKeys, s.combo, s.bestCombo, s.score]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('is deterministic for the same seed', () => {
    expect(createRaceState(99, T0, 1).target).toBe(createRaceState(99, T0, 1).target);
  });
});

describe('word advancement', () => {
  it('advances automatically only when the entire target word matches exactly', () => {
    let s = startRunning();
    const first = s.target;
    s = typeText(s, first.slice(0, -1));
    expect(s.completedWords).toBe(0);
    expect(s.target).toBe(first);

    s = typeText(s, first.at(-1)!);
    expect(s.completedWords).toBe(1);
    expect(s.target).not.toBe(first);
    expect(s.typed).toBe('');
  });

  it('does not require Space or Enter to submit a completed word', () => {
    const s = typeText(startRunning(), startRunning().target);
    expect(s.completedWords).toBe(1);
  });

  it('never advances on incorrect characters, even when they complete the length', () => {
    let s = startRunning();
    const target = s.target;
    const wrongLast = target.slice(0, -1) + (target.at(-1) === 'z' ? 'y' : 'z');
    s = typeText(s, wrongLast);
    expect(s.completedWords).toBe(0);
    expect(s.target).toBe(target);
    expect(s.typed).toBe(wrongLast);
    expect(s.combo).toBe(0);
  });

  it('keeps the target while the buffer holds a wrong prefix', () => {
    let s = startRunning();
    const target = s.target;
    s = typeWrong(s);
    s = typeText(s, target.slice(1));
    expect(s.target).toBe(target);
    expect(s.completedWords).toBe(0);
  });
});

describe('Backspace correction', () => {
  it('removes wrong characters so the word can be completed correctly', () => {
    let s = startRunning();
    const target = s.target;
    s = typeWrong(s);
    expect(s.typed.length).toBe(1);
    s = raceReducer(s, { type: 'input', value: '' });
    expect(s.typed).toBe('');
    s = typeText(s, target);
    expect(s.completedWords).toBe(1);
  });

  it('does not count Backspace as a keystroke', () => {
    let s = typeText(startRunning(), 'q');
    const totalBefore = s.totalKeys;
    s = raceReducer(s, { type: 'input', value: '' });
    expect(s.totalKeys).toBe(totalBefore);
  });

  it('is a no-op on an empty buffer', () => {
    const s = startRunning();
    expect(raceReducer(s, { type: 'input', value: '' })).toBe(s);
  });
});

describe('duplicate advancement guards', () => {
  it('ignores characters after completion within the same input event', () => {
    const s0 = startRunning();
    const [a, b] = [s0.target, WORD_LIST.find((w) => w !== s0.target)!];
    const s = raceReducer(s0, { type: 'input', value: a + b });
    expect(s.completedWords).toBe(1);
    expect(s.target).not.toBe(a);
    expect(s.typed).toBe('');
    // The extra characters are discarded, not counted as keystrokes.
    expect(s.totalKeys).toBe(a.length);
  });

  it('does not double-advance when the same completed value is applied twice', () => {
    const s0 = startRunning();
    const completed = raceReducer(s0, { type: 'input', value: s0.target });
    expect(completed.completedWords).toBe(1);
    // Re-applying the stale pre-completion value must not complete another word.
    const replayed = raceReducer(completed, { type: 'input', value: s0.target });
    expect(replayed.completedWords).toBe(1);
  });

  it('counts each printable character exactly once', () => {
    const word = startRunning().target;
    const s = typeText(startRunning(), word);
    expect(s.totalKeys).toBe(word.length);
    expect(s.correctKeys).toBe(word.length);
  });
});

describe('timer lifecycle', () => {
  it('stays in countdown until 3 seconds pass, then runs', () => {
    let s = createRaceState(1, T0, 1);
    s = raceReducer(s, { type: 'tick', now: T0 + 2_999 });
    expect(s.phase).toBe('countdown');
    s = raceReducer(s, { type: 'tick', now: T0 + 3_000 });
    expect(s.phase).toBe('running');
    expect(s.elapsedMs).toBe(0);
  });

  it('expires at exactly 60 seconds and ends the race', () => {
    let s = startRunning();
    s = raceReducer(s, { type: 'tick', now: T0 + COUNTDOWN_MS + RACE_DURATION_MS - 1 });
    expect(s.phase).toBe('running');
    expect(s.elapsedMs).toBe(RACE_DURATION_MS - 1);
    s = raceReducer(s, { type: 'tick', now: T0 + COUNTDOWN_MS + RACE_DURATION_MS });
    expect(s.phase).toBe('finished');
    expect(s.elapsedMs).toBe(RACE_DURATION_MS);
    expect(s.lastTick).toBeNull();
  });

  it('keeps the timer running while the input contains mistakes', () => {
    let s = startRunning();
    s = typeWrong(s);
    s = raceReducer(s, { type: 'tick', now: T0 + COUNTDOWN_MS + 5_000 });
    expect(s.elapsedMs).toBe(5_000);
    expect(s.typed.length).toBe(1);
  });

  it('ignores typing after the race has finished', () => {
    let s = startRunning();
    s = raceReducer(s, { type: 'tick', now: T0 + COUNTDOWN_MS + RACE_DURATION_MS });
    const frozen = s;
    expect(raceReducer(s, { type: 'input', value: s.target })).toBe(frozen);
    expect(raceReducer(frozen, { type: 'toggle-pause', now: T0 + 70_000 })).toBe(frozen);
  });

  it('ignores typing during the countdown', () => {
    const s = createRaceState(1, T0, 1);
    expect(raceReducer(s, { type: 'input', value: 'a' })).toBe(s);
  });
});

describe('pause and resume', () => {
  it('freezes the timer and gameplay while paused', () => {
    let s = startRunning();
    s = raceReducer(s, { type: 'tick', now: T0 + COUNTDOWN_MS + 4_000 });
    s = raceReducer(s, { type: 'toggle-pause', now: T0 + COUNTDOWN_MS + 4_000 });
    expect(s.phase).toBe('paused');
    expect(s.elapsedMs).toBe(4_000);

    const word = s.target;
    s = raceReducer(s, { type: 'tick', now: T0 + COUNTDOWN_MS + 30_000 });
    s = typeText(s, word);
    expect(s.elapsedMs).toBe(4_000);
    expect(s.completedWords).toBe(0);
    expect(s.typed).toBe('');
  });

  it('resumes without counting the paused interval', () => {
    let s = startRunning();
    s = raceReducer(s, { type: 'toggle-pause', now: T0 + COUNTDOWN_MS + 4_000 });
    s = raceReducer(s, { type: 'toggle-pause', now: T0 + COUNTDOWN_MS + 40_000 });
    expect(s.phase).toBe('running');
    s = raceReducer(s, { type: 'tick', now: T0 + COUNTDOWN_MS + 41_000 });
    expect(s.elapsedMs).toBe(5_000);
  });

  it('accrues time up to the pause instant', () => {
    let s = startRunning();
    s = raceReducer(s, { type: 'tick', now: T0 + COUNTDOWN_MS + 1_000 });
    s = raceReducer(s, { type: 'toggle-pause', now: T0 + COUNTDOWN_MS + 2_500 });
    expect(s.elapsedMs).toBe(2_500);
  });

  it('expires the race if the deadline passed before the pause landed', () => {
    let s = startRunning();
    s = raceReducer(s, { type: 'toggle-pause', now: T0 + COUNTDOWN_MS + RACE_DURATION_MS + 500 });
    expect(s.phase).toBe('finished');
    expect(s.elapsedMs).toBe(RACE_DURATION_MS);
  });
});

describe('restart', () => {
  it('resets every race-specific statistic and the timer', () => {
    let s = startRunning();
    s = typeText(s, s.target);
    s = typeWrong(s);
    s = raceReducer(s, { type: 'tick', now: T0 + COUNTDOWN_MS + RACE_DURATION_MS });
    expect(s.phase).toBe('finished');

    const r = raceReducer(s, { type: 'restart', seed: 5, now: T0 + 100_000 });
    expect(r.raceId).toBe(s.raceId + 1);
    expect(r.phase).toBe('countdown');
    expect(r.countdownMs).toBe(COUNTDOWN_MS);
    expect(r.elapsedMs).toBe(0);
    expect(r.typed).toBe('');
    expect([r.completedWords, r.correctKeys, r.totalKeys, r.combo, r.bestCombo, r.score]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(r.burstId).toBe(0);
    expect(r.shakeId).toBe(0);
    expect(r.milestoneId).toBe(0);
  });
});

describe('WPM, accuracy, and combo calculations', () => {
  it('computes WPM as completed words / elapsed minutes', () => {
    expect(calcWpm(30, 60_000)).toBe(30);
    expect(calcWpm(9, 30_000)).toBe(18);
  });

  it('defines WPM as 0 for zero elapsed time', () => {
    expect(calcWpm(5, 0)).toBe(0);
  });

  it('computes accuracy as correct / total keystrokes × 100', () => {
    expect(calcAccuracy(3, 4)).toBe(75);
    expect(calcAccuracy(10, 10)).toBe(100);
  });

  it('defines accuracy as 0 with zero keystrokes', () => {
    expect(calcAccuracy(0, 0)).toBe(0);
  });

  it('tracks wrong keystrokes in accuracy and excludes Backspace', () => {
    let s = startRunning();
    const target = s.target;
    s = typeWrong(s); // 1 total, 0 correct
    s = raceReducer(s, { type: 'input', value: '' }); // Backspace
    s = typeText(s, target); // all correct
    expect(s.totalKeys).toBe(target.length + 1);
    expect(s.correctKeys).toBe(target.length);
    expect(summarizeRace(s).accuracy).toBe(roundTo1(((target.length / (target.length + 1)) * 100)));
  });

  it('builds combo from consecutive correct keystrokes and resets on a mistake', () => {
    const word = startRunning().target;
    let s = typeText(startRunning(), word);
    // Completing a word does not reset the streak.
    expect(s.combo).toBe(word.length);
    const bestBefore = s.bestCombo;
    s = typeWrong(s);
    expect(s.combo).toBe(0);
    expect(s.bestCombo).toBe(bestBefore);
  });

  it('awards the milestone bonus animation at combo 10', () => {
    let s = startRunning();
    // Build a 10-character correct streak across words.
    while (s.combo < 10) {
      s = typeText(s, s.target);
    }
    expect(s.milestoneLevel).toBe(10);
    expect(s.milestoneId).toBeGreaterThan(0);
  });

  it('gives a small combo bonus per word and caps it', () => {
    expect(wordPoints(0)).toBe(10);
    expect(wordPoints(9)).toBe(10);
    expect(wordPoints(30)).toBe(13);
    expect(wordPoints(10_000)).toBe(20);
  });

  it('scores completed words with the combo bonus', () => {
    let s = startRunning();
    s = typeText(s, s.target);
    expect(s.score).toBe(10);
  });

  it('produces a rounded summary', () => {
    let s = startRunning();
    s = typeText(s, s.target);
    s = { ...s, elapsedMs: 30_000 };
    const summary = summarizeRace(s);
    expect(summary.wpm).toBe(2);
    expect(summary.accuracy).toBe(100);
    expect(summary.completedWords).toBe(1);
  });

  it('shows whole seconds remaining, reaching 0 at the end', () => {
    expect(secondsRemaining(0)).toBe(60);
    expect(secondsRemaining(500)).toBe(60);
    expect(secondsRemaining(1_000)).toBe(59);
    expect(secondsRemaining(RACE_DURATION_MS)).toBe(0);
  });
});

function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}
