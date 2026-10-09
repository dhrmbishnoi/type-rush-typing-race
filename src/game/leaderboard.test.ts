import { beforeEach, describe, expect, it } from 'vitest';
import {
  LEADERBOARD_STORAGE_KEY,
  LEADERBOARD_VERSION,
  addScore,
  loadLeaderboard,
  parseLeaderboard,
  personalBest,
  saveLeaderboard,
} from './leaderboard';
import type { ScoreRecord } from './leaderboard';

function record(score: number, minute = 0): ScoreRecord {
  return {
    score,
    wpm: 40,
    accuracy: 95,
    completedWords: 10,
    bestCombo: 12,
    playedAt: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(),
  };
}

/** Minimal in-memory Storage with optional failure injection. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  throwOnWrite = false;
  throwOnRead = false;
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  key(index: number) { return [...this.map.keys()][index] ?? null; }
  getItem(key: string) {
    if (this.throwOnRead) throw new DOMException('denied', 'SecurityError');
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.throwOnWrite) throw new DOMException('quota', 'QuotaExceededError');
    this.map.set(key, value);
  }
  removeItem(key: string) { this.map.delete(key); }
}

describe('local leaderboard persistence', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('round-trips records through a versioned envelope', () => {
    expect(saveLeaderboard([record(50)], storage)).toBe(true);
    const raw = JSON.parse(storage.getItem(LEADERBOARD_STORAGE_KEY)!);
    expect(raw.version).toBe(LEADERBOARD_VERSION);
    expect(loadLeaderboard(storage)).toEqual([record(50)]);
  });

  it('keeps only the top five scores, highest first', () => {
    let board: ScoreRecord[] = [];
    for (const score of [30, 80, 10, 60, 50, 90, 20]) board = addScore(board, record(score, score));
    expect(board.map((r) => r.score)).toEqual([90, 80, 60, 50, 30]);
    expect(personalBest(board)).toBe(90);
  });

  it('persists a trimmed top-five board', () => {
    const many = [10, 20, 30, 40, 50, 60, 70].map((s) => record(s));
    saveLeaderboard(many, storage);
    expect(loadLeaderboard(storage)).toHaveLength(5);
  });

  it('breaks score ties by the earlier date', () => {
    const early = record(40, 1);
    const late = record(40, 9);
    expect(addScore([late], early)).toEqual([early, late]);
  });

  it('reports a personal best of 0 for an empty board', () => {
    expect(personalBest([])).toBe(0);
  });

  it('treats missing data as an empty board', () => {
    expect(loadLeaderboard(storage)).toEqual([]);
  });

  it('treats corrupt JSON as an empty board without throwing', () => {
    storage.setItem(LEADERBOARD_STORAGE_KEY, '{not json');
    expect(loadLeaderboard(storage)).toEqual([]);
  });

  it('rejects data from an unknown version', () => {
    storage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify({ version: 99, entries: [record(10)] }));
    expect(loadLeaderboard(storage)).toEqual([]);
  });

  it('rejects unversioned or non-object payloads', () => {
    expect(parseLeaderboard(JSON.stringify([record(10)]))).toEqual([]);
    expect(parseLeaderboard(JSON.stringify({ entries: [record(10)] }))).toEqual([]);
    expect(parseLeaderboard(JSON.stringify('oops'))).toEqual([]);
    expect(parseLeaderboard('null')).toEqual([]);
  });

  it('drops malformed entries but keeps valid ones', () => {
    const payload = {
      version: LEADERBOARD_VERSION,
      entries: [
        record(70),
        { score: 'high', wpm: 1, accuracy: 1, completedWords: 1, bestCombo: 1, playedAt: '2026-01-01T00:00:00Z' },
        { ...record(20), accuracy: 150 },
        { ...record(15), playedAt: 'not a date' },
        { ...record(-5) },
        null,
        42,
      ],
    };
    const parsed = parseLeaderboard(JSON.stringify(payload));
    expect(parsed.map((r) => r.score)).toEqual([70]);
  });

  it('strips unexpected fields from stored entries', () => {
    const payload = { version: LEADERBOARD_VERSION, entries: [{ ...record(33), extra: '<script>' }] };
    const [entry] = parseLeaderboard(JSON.stringify(payload));
    expect(entry).not.toHaveProperty('extra');
  });

  it('fails safely when storage is unavailable', () => {
    storage.throwOnRead = true;
    storage.throwOnWrite = true;
    expect(loadLeaderboard(storage)).toEqual([]);
    expect(saveLeaderboard([record(10)], storage)).toBe(false);
  });

  it('returns empty when there is no storage at all', () => {
    expect(loadLeaderboard(null)).toEqual([]);
    expect(saveLeaderboard([record(10)], null)).toBe(false);
  });
});
