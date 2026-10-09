import { useEffect, useReducer, useRef, useState } from 'react';
import { TICK_MS } from './game/constants';
import { raceReducer, createRaceState, summarizeRace } from './game/raceReducer';
import type { RaceSummary } from './game/raceReducer';
import {
  addScore,
  loadLeaderboard,
  personalBest,
  saveLeaderboard,
} from './game/leaderboard';
import type { ScoreRecord } from './game/leaderboard';
import { calcAccuracy, calcWpm, secondsRemaining } from './game/stats';
import { WordDisplay, ParticleBurst } from './components/WordDisplay';
import { ResultsOverlay } from './components/ResultsOverlay';
import { Leaderboard } from './components/Leaderboard';

function newSeed(): number {
  return Math.floor(Math.random() * 0x100000000) | 0;
}

interface LastResult {
  raceId: number;
  summary: RaceSummary;
  personalBest: number;
  isNewBest: boolean;
  rank: number | null;
}

export default function App() {
  const [state, dispatch] = useReducer(raceReducer, undefined, () =>
    createRaceState(newSeed(), Date.now(), 1),
  );
  const [leaderboard, setLeaderboard] = useState<ScoreRecord[]>(() => loadLeaderboard());
  const [lastResult, setLastResult] = useState<LastResult | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const recordedRaceRef = useRef<number | null>(null);

  // One interval per countdown/running segment. Cleanup on pause, finish, or
  // restart guarantees no duplicate intervals across resume.
  useEffect(() => {
    if (state.phase !== 'countdown' && state.phase !== 'running') return;
    const id = window.setInterval(() => dispatch({ type: 'tick', now: Date.now() }), TICK_MS);
    return () => window.clearInterval(id);
  }, [state.phase, state.raceId]);

  // Escape toggles pause. The reducer decides whether the toggle is valid.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dispatch({ type: 'toggle-pause', now: Date.now() });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Persist exactly once per finished race.
  useEffect(() => {
    if (state.phase !== 'finished' || recordedRaceRef.current === state.raceId) return;
    recordedRaceRef.current = state.raceId;

    const summary = summarizeRace(state);
    const previous = loadLeaderboard();
    const previousBest = personalBest(previous);

    if (summary.score <= 0) {
      setLastResult({ raceId: state.raceId, summary, personalBest: previousBest, isNewBest: false, rank: null });
      return;
    }

    const record: ScoreRecord = {
      score: summary.score,
      wpm: summary.wpm,
      accuracy: summary.accuracy,
      completedWords: summary.completedWords,
      bestCombo: summary.bestCombo,
      playedAt: new Date().toISOString(),
    };
    const next = addScore(previous, record);
    saveLeaderboard(next);
    setLeaderboard(next);

    const index = next.indexOf(record);
    setLastResult({
      raceId: state.raceId,
      summary,
      personalBest: Math.max(previousBest, summary.score),
      isNewBest: summary.score > previousBest,
      rank: index === -1 ? null : index + 1,
    });
  }, [state]);

  // Focus the input whenever typing is allowed.
  useEffect(() => {
    if (state.phase === 'running') inputRef.current?.focus();
  }, [state.phase, state.raceId]);

  // Restrained screen shake on wrong keystrokes.
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || state.shakeId === 0) return;
    shell.classList.remove('shake');
    void shell.offsetWidth; // restart the CSS animation
    shell.classList.add('shake');
  }, [state.shakeId]);

  const restart = () => dispatch({ type: 'restart', seed: newSeed(), now: Date.now() });
  const togglePause = () => dispatch({ type: 'toggle-pause', now: Date.now() });

  const typingEnabled = state.phase === 'running';
  const showResults = state.phase === 'finished' && lastResult?.raceId === state.raceId;
  const secondsLeft = secondsRemaining(state.elapsedMs);
  const liveWpm = calcWpm(state.completedWords, state.elapsedMs);
  const liveAccuracy = calcAccuracy(state.correctKeys, state.totalKeys);

  return (
    <div className="app-root">
      <div className="game-shell" ref={shellRef}>
        <header className="top">
          <h1 className="logo">
            TYPE<span>//</span>RUSH
          </h1>
          <p className="mode">Single player · 60 seconds · Medium</p>
        </header>

        <section className="hud" aria-label="Race statistics">
          <Stat label="Time" value={`${secondsLeft}s`} testId="stat-time" highlight={secondsLeft <= 10} />
          <Stat label="Score" value={state.score} testId="stat-score" />
          <Stat label="WPM" value={liveWpm.toFixed(0)} testId="stat-wpm" />
          <Stat label="Accuracy" value={`${liveAccuracy.toFixed(0)}%`} testId="stat-accuracy" />
          <Stat label="Words" value={state.completedWords} testId="stat-words" />
          <Stat label="Combo" value={state.combo} testId="stat-combo" />
          <Stat label="Best combo" value={state.bestCombo} testId="stat-best-combo" />
        </section>

        <section className="arena" aria-label="Race track">
          {/* Decorative only: a single lane of speed lines. There are no AI racers. */}
          <div className="track">
            <div key={state.boostId} className={`speed-lines ${state.boostId > 0 ? 'boost' : ''}`} />
            <div
              className="timer-bar"
              style={{ width: `${Math.min(100, (state.elapsedMs / 60_000) * 100)}%` }}
            />
          </div>

          <div className="word-stage">
            {state.phase === 'countdown' && (
              <div className="countdown" key={Math.ceil(state.countdownMs / 1000)} data-testid="countdown">
                {Math.max(1, Math.ceil(state.countdownMs / 1000))}
              </div>
            )}
            <WordDisplay target={state.target} typed={state.typed} />
            {state.burstId > 0 && <ParticleBurst key={state.burstId} />}
            {state.milestoneId > 0 && (
              <div className="milestone" key={state.milestoneId} role="status">
                COMBO ×{state.milestoneLevel}!
              </div>
            )}
          </div>

          <input
            ref={inputRef}
            className="typing-input"
            type="text"
            value={state.typed}
            onChange={(event) => dispatch({ type: 'input', value: event.currentTarget.value })}
            disabled={!typingEnabled}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Type the word shown above"
            placeholder={state.phase === 'paused' ? 'Paused' : 'Type here'}
            data-testid="typing-input"
          />

          <div className="controls">
            <button
              type="button"
              className="btn"
              onClick={togglePause}
              disabled={state.phase !== 'running' && state.phase !== 'paused'}
            >
              {state.phase === 'paused' ? 'Resume' : 'Pause'}
            </button>
            <button type="button" className="btn" onClick={restart}>
              Restart
            </button>
            <span className="hint">Esc pauses · Backspace corrects</span>
          </div>
        </section>

        {state.phase === 'paused' && (
          <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="paused-title">
            <div className="panel">
              <h2 id="paused-title">Paused</h2>
              <p className="muted">The timer is frozen.</p>
              <button type="button" className="btn primary" onClick={togglePause}>
                Resume
              </button>
            </div>
          </div>
        )}

        {showResults && lastResult && (
          <ResultsOverlay
            summary={lastResult.summary}
            personalBest={lastResult.personalBest}
            isNewBest={lastResult.isNewBest}
            rank={lastResult.rank}
            onRestart={restart}
          />
        )}
      </div>

      <aside className="side">
        <Leaderboard entries={leaderboard} />
      </aside>
    </div>
  );
}

function Stat({
  label,
  value,
  testId,
  highlight = false,
}: {
  label: string;
  value: string | number;
  testId: string;
  highlight?: boolean;
}) {
  return (
    <div className={`stat ${highlight ? 'stat-alert' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}
