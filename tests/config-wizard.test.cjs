const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup(settings = {}) {
    const context = vm.createContext({ window: { grblSettings: { settings } } });
    const source = fs.readFileSync(path.join(__dirname, '../js/features/config-wizard.js'), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace('export class ', 'class ');
    vm.runInContext(source, context);
    return vm.runInContext('Object.create(ConfigWizard.prototype)', context);
}

const custom = () => ({ category: 'custom', travel: { x: 500, y: 500, z: 100 } });

test('Custom endstops generate every XYZ homing direction combination and preserve other axes', () => {
    const wizard = setup({ '23': { val: '45' } });
    for (let mask = 0; mask < 8; mask++) {
        const machine = custom();
        machine.customEndstops = Object.fromEntries(['x', 'y', 'z'].map((axis, i) =>
            [axis, mask & (1 << i) ? 'min' : 'max']));
        const lines = wizard._getMachineConfig(machine).split('\n');
        assert.equal(lines.filter(line => line.startsWith('$23=')).length, 1);
        assert.ok(lines.includes(`$23=${40 | mask}`));
    }
});

test('Custom endstops default to min when no previous homing setting is available', () => {
    assert.ok(setup()._getMachineConfig(custom()).split('\n').includes('$23=7'));
});

test('WorkBee profiles leave homing direction unchanged', () => {
    for (const category of ['z1+', 'z2']) {
        assert.doesNotMatch(setup()._getMachineConfig({ ...custom(), category }), /\$23=/);
    }
});

test('Custom belt and screw calculations retain 1600 steps per revolution', () => {
    const wizard = setup();
    const machine = custom();
    assert.equal(wizard._calcStepsPerMM('x', machine), 40);
    machine.customDrives = { z: 'leadscrew' };
    machine.customLead = { z: 5 };
    assert.equal(wizard._calcStepsPerMM('z', machine), 320);
});
