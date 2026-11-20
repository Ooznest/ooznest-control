const { test } = require('node:test');
const assert = require('node:assert/strict');
const { oldReleases, oldRuns } = require('../.github/scripts/cleanup-storage.cjs');

test('release cleanup keeps fewer than five releases and unfinished drafts', () => {
    const releases = [{ id: 1 }, { id: 2 }, { id: 3, draft: true }];
    assert.deepEqual(oldReleases(releases, 2), []);
    assert.throws(() => oldReleases(releases, 4), /Latest release missing/);
});

test('release cleanup keeps the newest five regardless of API ordering', () => {
    const releases = [3, 1, 7, 5, 2, 6, 4].map(id => ({
        id, published_at: `2026-11-${String(id).padStart(2, '0')}T00:00:00Z`
    }));
    releases.push({ id: 8, draft: true });
    assert.deepEqual(oldReleases(releases, 7).map(release => release.id), [2, 1]);
    // GitHub can mark an older release as latest; always protect it too.
    assert.deepEqual(oldReleases(releases, 1).map(release => release.id), [3, 2]);
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
