const { test } = require('node:test');
const assert = require('node:assert/strict');
const { oldReleases, oldRuns } = require('../.github/scripts/cleanup-storage.cjs');

test('release cleanup keeps latest downloads and unfinished draft releases', () => {
    const releases = [{ id: 1 }, { id: 2 }, { id: 3, draft: true }];
    assert.deepEqual(oldReleases(releases, 2), [{ id: 1 }]);
    assert.throws(() => oldReleases(releases, 4), /Latest release missing/);
});

test('run cleanup preserves active runs and the seven-day history', () => {
    const cutoff = Date.parse('2026-11-13T00:00:00Z');
    const runs = [
        { id: 1, status: 'completed', updated_at: '2026-11-12T00:00:00Z' },
        { id: 2, status: 'completed', updated_at: '2026-11-14T00:00:00Z' },
        { id: 3, status: 'in_progress', updated_at: '2026-11-12T00:00:00Z' },
        { id: 4, status: 'queued', updated_at: '2026-11-12T00:00:00Z' }
    ];
    assert.deepEqual(oldRuns(runs, cutoff).map(run => run.id), [1]);
    assert.deepEqual(oldRuns(runs, Infinity).map(run => run.id), [1, 2]);
});
