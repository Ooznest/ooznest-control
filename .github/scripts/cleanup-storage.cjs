const { execFileSync } = require('node:child_process');

const repo = process.env.GITHUB_REPOSITORY || 'Ooznest/ooznest-control';

function api(path, method = 'GET') {
    const result = execFileSync('gh', ['api', '--method', method, `repos/${repo}/${path}`], {
        encoding: 'utf8', maxBuffer: 32 * 1024 * 1024
    });
    return result ? JSON.parse(result) : null;
}

function list(path, key) {
    const results = [];
    for (let page = 1; ; page++) {
        const response = api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
        const items = key ? response[key] : response;
        results.push(...items);
        if (items.length < 100) return results;
    }
}

function oldReleases(releases, latestId) {
    if (!releases.some(release => release.id === latestId)) throw new Error('Latest release missing from inventory');
    return releases.filter(release => release.id !== latestId && !release.draft);
}

function oldRuns(runs, cutoff) {
    return runs.filter(run => run.status === 'completed' && Date.parse(run.updated_at) < cutoff);
}

function main() {
    if (repo.toLowerCase() !== 'ooznest/ooznest-control') throw new Error('Unexpected cleanup repository');
    const latest = api('releases/latest');
    if (!latest.assets.length) throw new Error('Latest release has no downloads; refusing cleanup');
    const releases = oldReleases(list('releases'), latest.id);
    const cutoff = process.argv.includes('--all-completed-runs') ? Infinity : Date.now() - 7 * 86400000;
    const runs = oldRuns(list('actions/runs', 'workflow_runs'), cutoff);
    console.log(`Keeping ${latest.tag_name} and all its downloads. Git tags are preserved.`);
    console.log(`Removing ${releases.length} releases and ${runs.length} completed Actions runs.`);
    for (const release of releases) {
        if (api('releases/latest').id !== latest.id) throw new Error('Latest release changed; stopping cleanup');
        api(`releases/${release.id}`, 'DELETE');
        console.log(`Deleted release ${release.tag_name}`);
    }
    let deletedRuns = 0;
    for (const run of runs) {
        api(`actions/runs/${run.id}`, 'DELETE');
        if (++deletedRuns % 25 === 0) console.log(`Deleted ${deletedRuns}/${runs.length} completed runs`);
    }
    console.log(`Finished: deleted ${releases.length} releases and ${deletedRuns} completed runs.`);
}

module.exports = { oldReleases, oldRuns };
if (require.main === module) main();
