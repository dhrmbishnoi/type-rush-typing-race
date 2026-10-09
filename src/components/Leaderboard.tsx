import type { ScoreRecord } from '../game/leaderboard';

interface LeaderboardProps {
  entries: ScoreRecord[];
}

export function Leaderboard({ entries }: LeaderboardProps) {
  return (
    <section className="panel leaderboard" aria-labelledby="leaderboard-title">
      <h2 id="leaderboard-title">Top 5 · local</h2>
      {entries.length === 0 ? (
        <p className="muted">No scores yet. Finish a race to claim a spot.</p>
      ) : (
        <ol>
          {entries.map((entry, index) => (
            <li key={`${entry.playedAt}-${index}`}>
              <span className="rank-num">{index + 1}</span>
              <span className="score">{entry.score}</span>
              <span className="meta">
                {entry.wpm.toFixed(1)} wpm · {entry.accuracy.toFixed(1)}%
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
