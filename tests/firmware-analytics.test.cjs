const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
    const events = [];
    const window = { ws: { isConnected: true }, reportAnalyticsFirmware: (...args) => events.push(args) };
    const source = fs.readFileSync(path.join(__dirname, '../js/features/firmware-version.js'), 'utf8');
    const Checker = vm.runInNewContext(source.replace(/^import .*\r?\n/gm, '')
        .replace(/export /g, '') + '\nFirmwareVersionChecker', { window });
    const checker = Object.create(Checker.prototype);
    Object.assign(checker, {
        availableBuild: 20261110, changelog: [{ grblBuild: 20261001 }],
        _manifestPromise: Promise.resolve(), _notify() {}
    });
    return { checker, window, events };
}

test('firmware telemetry distinguishes released, custom and other-board builds', async () => {
    for (const [version, board, expected] of [
        ['1.1f.20261110', 'Ooznest-Motion-Control-Core', 'matches Ooznest release'],
        ['1.1f.20261001', 'Ooznest-Motion-Control-Core', 'matches Ooznest release'],
        ['1.1f.20261111', 'Ooznest-Motion-Control-Core', 'unrecognized build'],
        ['1.1f.20261110', 'Other', 'other board']
    ]) {
        const { checker, events } = setup();
        checker.setControllerVersion(version, board);
        await checker._manifestPromise;
        assert.deepEqual(events, [['grblhal', `1.1f+${version.slice(-8)}`, expected]]);
    }
});

test('firmware telemetry skips unknown versions, disconnected controllers and stale reports', async () => {
    for (const scenario of ['unknown', 'disconnected', 'stale']) {
        const { checker, window, events } = setup();
        checker.setControllerVersion(scenario === 'unknown' ? 'unknown' : '1.1f.20261110', 'Other');
        if (scenario === 'disconnected') window.ws.isConnected = false;
        if (scenario === 'stale') checker.controllerBuild = 20261111;
        await checker._manifestPromise;
        assert.equal(events.length, 0);
    }
});
