import type { RaceSummary } from '../game/raceReducer';

interface ResultsOverlayProps {
  summary: RaceSummary;
  personalBest: number;
  isNewBest: boolean;
  rank: number | null;
  onRestart: () => void;
}

export function ResultsOverlay({ summary, personalBest, isNewBest, rank, onRestart }: ResultsOverlayProps) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="results-title">
      <div className="panel results">
        <p className="eyebrow">Time&apos;s up</p>
        <h2 id="results-title">Race complete</h2>
        {isNewBest && <p className="new-best">New personal best!</p>}
        <dl className="results-grid">
          <div>
            <dt>Score</dt>
            <dd data-testid="result-score">{summary.score}</dd>
          </div>
          <div>
            <dt>WPM</dt>
            <dd data-testid="result-wpm">{summary.wpm.toFixed(1)}</dd>
          </div>
          <div>
            <dt>Accuracy</dt>
            <dd data-testid="result-accuracy">{summary.accuracy.toFixed(1)}%</dd>
          </div>
          <div>
            <dt>Best combo</dt>
            <dd data-testid="result-best-combo">{summary.bestCombo}</dd>
          </div>
          <div>
            <dt>Words</dt>
            <dd>{summary.completedWords}</dd>
          </div>
          <div>
            <dt>Personal best</dt>
            <dd>{personalBest}</dd>
          </div>
        </dl>
        <p className="rank">{rank ? `Local rank #${rank}` : 'Not in the local top five'}</p>
        <button type="button" className="btn primary" onClick={onRestart} autoFocus>
          Race again
        </button>
      </div>
    </div>
  );
}
