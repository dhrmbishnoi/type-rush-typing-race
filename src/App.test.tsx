import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { COUNTDOWN_MS, RACE_DURATION_MS } from './game/constants';
import { LEADERBOARD_STORAGE_KEY } from './game/leaderboard';

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function currentTarget(): string {
  return screen.getByTestId('target-word').textContent ?? '';
}

function input(): HTMLInputElement {
  return screen.getByTestId('typing-input') as HTMLInputElement;
}

/** Simulates the browser reporting the full input value after each keystroke. */
function typeKeys(text: string) {
  for (const ch of text) {
    fireEvent.change(input(), { target: { value: input().value + ch } });
  }
}

function startRace() {
  advance(COUNTDOWN_MS);
  expect(input()).toBeEnabled();
}

function secondsShown(): string {
  return screen.getByTestId('stat-time').textContent ?? '';
}

describe('TYPE//RUSH app', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date('2026-10-09T10:00:00+05:30'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows a 3-2-1 countdown with typing disabled', () => {
    render(<App />);
    expect(screen.getByTestId('countdown')).toHaveTextContent('3');
    expect(input()).toBeDisabled();
    advance(1_000);
    expect(screen.getByTestId('countdown')).toHaveTextContent('2');
    advance(1_000);
    expect(screen.getByTestId('countdown')).toHaveTextContent('1');
    advance(1_000);
    expect(screen.queryByTestId('countdown')).toBeNull();
    expect(input()).toBeEnabled();
    expect(secondsShown()).toBe('60s');
  });

  it('advances to the next word only on an exact full match', () => {
    render(<App />);
    startRace();
    const first = currentTarget();
    typeKeys(first.slice(0, -1));
    expect(currentTarget()).toBe(first);
    expect(screen.getByTestId('stat-words')).toHaveTextContent('0');

    typeKeys(first.at(-1)!);
    expect(currentTarget()).not.toBe(first);
    expect(screen.getByTestId('stat-words')).toHaveTextContent('1');
    expect(input().value).toBe('');
  });

  it('does not advance on wrong input and recovers with Backspace', () => {
    render(<App />);
    startRace();
    const target = currentTarget();
    const wrong = target[0] === 'z' ? 'y' : 'z';
    typeKeys(wrong);
    expect(currentTarget()).toBe(target);
    expect(screen.getByTestId('stat-words')).toHaveTextContent('0');
    expect(screen.getByTestId('stat-combo')).toHaveTextContent('0');

    fireEvent.change(input(), { target: { value: '' } });
    typeKeys(target);
    expect(screen.getByTestId('stat-words')).toHaveTextContent('1');
  });

  it('updates the live accuracy from correct and total keystrokes', () => {
    render(<App />);
    startRace();
    const target = currentTarget();
    typeKeys(target[0] === 'z' ? 'y' : 'z'); // 1 wrong of 1
    fireEvent.change(input(), { target: { value: '' } });
    expect(screen.getByTestId('stat-accuracy')).toHaveTextContent('0%');
    typeKeys(target[0]); // 1 correct of 2
    expect(screen.getByTestId('stat-accuracy')).toHaveTextContent('50%');
  });

  it('ends the race at exactly 60 seconds and disables typing', () => {
    render(<App />);
    startRace();
    typeKeys(currentTarget());
    advance(RACE_DURATION_MS - 1_000);
    expect(secondsShown()).toBe('1s');
    advance(999);
    expect(secondsShown()).toBe('1s');
    advance(1);
    expect(screen.getByRole('dialog', { name: /race complete/i })).toBeInTheDocument();
    expect(input()).toBeDisabled();
    expect(secondsShown()).toBe('0s');
  });

  it('ignores keystrokes after game over', () => {
    render(<App />);
    startRace();
    advance(RACE_DURATION_MS);
    const target = currentTarget();
    const words = screen.getByTestId('stat-words').textContent;
    // Even a direct change event must not update the state.
    fireEvent.change(input(), { target: { value: target } });
    expect(input()).toBeDisabled();
    expect(screen.getByTestId('stat-words')).toHaveTextContent(words!);
    expect(currentTarget()).toBe(target);
  });

  it('freezes the timer and typing while paused, then resumes without duplicate intervals', () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    render(<App />);
    startRace();
    advance(5_000);
    expect(secondsShown()).toBe('55s');

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(input()).toBeDisabled();
    advance(20_000);
    expect(secondsShown()).toBe('55s');

    const overlay = screen.getByRole('dialog', { name: 'Paused' });
    fireEvent.click(within(overlay).getByRole('button', { name: 'Resume' }));
    expect(input()).toBeEnabled();
    advance(1_000);
    expect(secondsShown()).toBe('54s');

    // Only one live race interval: created intervals minus cleared ones must equal 1.
    const live = setIntervalSpy.mock.calls.length - clearIntervalSpy.mock.calls.length;
    expect(live).toBe(1);
  });

  it('resumes the timer when Escape is pressed', () => {
    render(<App />);
    startRace();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Paused' })).toBeInTheDocument();
    advance(10_000);
    expect(secondsShown()).toBe('60s');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(input()).toBeEnabled();
  });

  it('restarts with every race statistic and the timer reset', () => {
    render(<App />);
    startRace();
    typeKeys(currentTarget());
    typeKeys('q');
    advance(10_000);
    expect(screen.getByTestId('stat-words')).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(screen.getByTestId('countdown')).toBeInTheDocument();
    expect(screen.getByTestId('stat-words')).toHaveTextContent('0');
    expect(screen.getByTestId('stat-score')).toHaveTextContent('0');
    expect(screen.getByTestId('stat-accuracy')).toHaveTextContent('0%');
    expect(screen.getByTestId('stat-best-combo')).toHaveTextContent('0');
    startRace();
    expect(secondsShown()).toBe('60s');
  });

  it('saves the finished race to the local leaderboard exactly once', () => {
    render(<App />);
    startRace();
    typeKeys(currentTarget());
    advance(RACE_DURATION_MS);
    advance(1_000);

    const stored = JSON.parse(window.localStorage.getItem(LEADERBOARD_STORAGE_KEY)!);
    expect(stored.version).toBe(1);
    expect(stored.entries).toHaveLength(1);
    expect(stored.entries[0].completedWords).toBe(1);
    expect(screen.getByTestId('result-score')).toHaveTextContent('10');
    expect(screen.getByText('New personal best!')).toBeInTheDocument();
  });

  it('does not save a race that scored nothing', () => {
    render(<App />);
    startRace();
    advance(RACE_DURATION_MS);
    expect(window.localStorage.getItem(LEADERBOARD_STORAGE_KEY)).toBeNull();
    expect(screen.getByTestId('result-score')).toHaveTextContent('0');
  });

  it('restarts instantly from the results overlay', () => {
    render(<App />);
    startRace();
    advance(RACE_DURATION_MS);
    fireEvent.click(screen.getByRole('button', { name: 'Race again' }));
    expect(screen.queryByRole('dialog', { name: /race complete/i })).toBeNull();
    expect(screen.getByTestId('countdown')).toBeInTheDocument();
  });

  it('loads persisted top scores into the leaderboard panel', () => {
    window.localStorage.setItem(
      LEADERBOARD_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        entries: [
          { score: 42, wpm: 30, accuracy: 90, completedWords: 9, bestCombo: 8, playedAt: '2026-01-01T00:00:00Z' },
        ],
      }),
    );
    render(<App />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('survives corrupt stored leaderboard data', () => {
    window.localStorage.setItem(LEADERBOARD_STORAGE_KEY, '<<garbage');
    render(<App />);
    expect(screen.getByText(/No scores yet/)).toBeInTheDocument();
  });
});
