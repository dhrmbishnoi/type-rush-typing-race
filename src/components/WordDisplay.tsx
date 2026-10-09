interface WordDisplayProps {
  target: string;
  typed: string;
}

/** Renders the target word with per-character feedback. Typed characters are never shown beyond the target. */
export function WordDisplay({ target, typed }: WordDisplayProps) {
  return (
    <div className="word" aria-label={`Type: ${target}`} data-testid="target-word">
      {target.split('').map((char, index) => {
        let state = 'pending';
        if (index < typed.length) state = typed[index] === char ? 'correct' : 'wrong';
        return (
          <span key={index} className={`char char-${state}`}>
            {char}
          </span>
        );
      })}
    </div>
  );
}

/** Decorative particle burst, remounted (via key) on every completed word. */
export function ParticleBurst() {
  return (
    <div className="burst" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} style={{ ['--angle' as string]: `${(i * 360) / 14}deg` }} />
      ))}
    </div>
  );
}
