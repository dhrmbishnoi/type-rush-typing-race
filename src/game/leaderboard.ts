import { LEADERBOARD_SIZE } from './constants';

/**
 * Local leaderboard persisted under a versioned LocalStorage envelope:
 *   { "version": 1, "entries": [ScoreRecord, ...] }
 * Any unreadable, unversioned, or malformed data is treated as an empty board.
 * Bumping LEADERBOARD_VERSION (with a migration) is the way to change the schema.
 */
export const LEADERBOARD_STORAGE_KEY = 'type-rush:leaderboard';
export const LEADERBOARD_VERSION = 1;

export interface ScoreRecord {
  score: number;
  wpm: number;
  accuracy: number;
  completedWords: number;
  bestCombo: number;
  playedAt: string;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function toRecord(value: unknown): ScoreRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (
    !isFiniteNonNegative(raw.score) ||
    !isFiniteNonNegative(raw.wpm) ||
    !isFiniteNonNegative(raw.accuracy) ||
    raw.accuracy > 100 ||
    !isFiniteNonNegative(raw.completedWords) ||
    !isFiniteNonNegative(raw.bestCombo) ||
    typeof raw.playedAt !== 'string' ||
    Number.isNaN(Date.parse(raw.playedAt))
  ) {
    return null;
  }
  return {
    score: raw.score,
    wpm: raw.wpm,
    accuracy: raw.accuracy,
    completedWords: raw.completedWords,
    bestCombo: raw.bestCombo,
    playedAt: raw.playedAt,
  };
}

/** Highest score first; ties broken by earlier date. Keeps only the top entries. */
function rankEntries(entries: ScoreRecord[]): ScoreRecord[] {
  return [...entries]
    .sort((a, b) => b.score - a.score || Date.parse(a.playedAt) - Date.parse(b.playedAt))
    .slice(0, LEADERBOARD_SIZE);
}

/** Parses raw LocalStorage text. Never throws. */
export function parseLeaderboard(raw: string | null): ScoreRecord[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return [];
  const envelope = data as { version?: unknown; entries?: unknown };
  if (envelope.version !== LEADERBOARD_VERSION || !Array.isArray(envelope.entries)) return [];

  const records: ScoreRecord[] = [];
  for (const entry of envelope.entries) {
    const record = toRecord(entry);
    if (record) records.push(record);
  }
  return rankEntries(records);
}

function getStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    // Accessing localStorage can throw (e.g. disabled cookies or sandboxed frames).
    return null;
  }
}

export function loadLeaderboard(storage: Storage | null = getStorage()): ScoreRecord[] {
  if (!storage) return [];
  try {
    return parseLeaderboard(storage.getItem(LEADERBOARD_STORAGE_KEY));
  } catch {
    return [];
  }
}

/** Returns true when the write succeeded. Storage failures never break gameplay. */
export function saveLeaderboard(entries: ScoreRecord[], storage: Storage | null = getStorage()): boolean {
  if (!storage) return false;
  try {
    const envelope = { version: LEADERBOARD_VERSION, entries: rankEntries(entries) };
    storage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

/** Returns the new top-five board including `record`. */
export function addScore(entries: ScoreRecord[], record: ScoreRecord): ScoreRecord[] {
  return rankEntries([...entries, record]);
}

export function personalBest(entries: ScoreRecord[]): number {
  return entries.reduce((best, entry) => Math.max(best, entry.score), 0);
}
