import { describe, expect, test } from 'bun:test';
import { partitionTournaments } from '@/lib/validators';

const validTournament = {
  id: 't-valid',
  name: 'Friday Night',
  format: 'single-elimination',
  status: 'draft',
  players: [
    { id: 'p1', name: 'Alice', seed: 1 },
    { id: 'p2', name: 'Bob', seed: 2 },
  ],
  matches: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  completedAt: null,
};

describe('partitionTournaments', () => {
  test('keeps entries that fail validation instead of dropping them', () => {
    const missingName = { ...validTournament, id: 't-bad', name: '' };
    const futureFormat = { ...validTournament, id: 't-future', format: 'ladder' };
    const { valid, invalid } = partitionTournaments([validTournament, missingName, futureFormat]);

    expect(valid.map((t) => t.id)).toEqual(['t-valid']);
    expect(valid[0].createdAt).toBeInstanceOf(Date);
    // Invalid entries come back untouched so they can be written back as-is
    expect(invalid).toEqual([missingName, futureFormat]);
    expect(invalid[0]).toBe(missingName);
  });

  test('handles junk entries without throwing', () => {
    const { valid, invalid } = partitionTournaments([null, 42, 'oops', validTournament]);
    expect(valid).toHaveLength(1);
    expect(invalid).toEqual([null, 42, 'oops']);
  });

  test('keeps an unreadable non-list value as a single entry', () => {
    expect(partitionTournaments('not json')).toEqual({ valid: [], invalid: ['not json'] });
    expect(partitionTournaments({ some: 'object' })).toEqual({ valid: [], invalid: [{ some: 'object' }] });
  });

  test('treats missing storage as empty', () => {
    expect(partitionTournaments(null)).toEqual({ valid: [], invalid: [] });
    expect(partitionTournaments(undefined)).toEqual({ valid: [], invalid: [] });
    expect(partitionTournaments([])).toEqual({ valid: [], invalid: [] });
  });
});
