const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
    const values = new Map();
    const context = vm.createContext({
        console, setTimeout() {}, clearTimeout() {},
        window: { grblSettings: { settings: {} } },
        document: { getElementById() { return null; } }
    });
    for (const file of ['js/machine/toolhead-options.js', 'js/features/config-wizard.js', 'js/machine/grbl_settings.js']) {
        const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
            .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
        vm.runInContext(text, context);
    }
    const wizard = vm.runInContext('Object.create(ConfigWizard.prototype)', context);
    const listeners = {};
    const writes = [];
    const metadata = {
        '395': 'PWM2,Nowforever,PWM,Huanyang v1,Huanyang P2A,Durapulse GS20,Yalang YS620,MODVFD,H-100',
        '511': 'Disabled,PWM,Huanyang v1,PWM2,Nowforever',
        '512': 'Disabled,Huanyang v1,Nowforever,PWM2,PWM'
    };
    const ws = {
        isConnected: true,
        on(event, callback) { (listeners[event] ||= new Set()).add(callback); },
        off(event, callback) { listeners[event]?.delete(callback); },
        emit(event, line) { for (const callback of listeners[event] || []) callback(line); },
        async sendCommandWithAck(command) {
            writes.push(command);
            if (command === '$ES') {
                for (const [id, format] of Object.entries(metadata)) {
                    ws.emit('line', '[SETTING:' + id + '|10|Spindle||3|' + format + '|||0]');
                }
            }
            if (command === '$$') ws.emit('line', '$512=0');
            return { command, response: 'ok' };
        },
        sendRealtime(value) { writes.push(value); }
    };
    Object.assign(wizard, {
        ws, modal: { isOpen() { return false; } }, _toolheadSettings: {}, _toolheadLoadError: '',
        wizardStep: 1, spindles: {},
        wizardData: {
            machine: { id: 'z2-500x500', name: '500×500mm', category: 'z2', travel: { x: 270, y: 270, z: 88 } },
            toolheads: { '395': null, '511': null, '512': null },
            skipFirmware: true, probeType: 'ooznest', plateThickness: 5, xyPlateOffset: 10,
            wifiMode: '0', dustShoe: false, enclosure: false
        },
        store: { set(key, value) { values.set(key, value); } },
        _sleep: async () => {},
        _showWizardStatus(text, type) { wizard.lastStatus = { text, type }; },
        hideWizard() { wizard.hidden = true; }
    });
    return { wizard, ws, writes, listeners, metadata, values, context };
}

function select(wizard, id, profile) {
    const option = wizard._getToolheadOptions(id).find(option => option.profile === profile || option.source === profile);
    assert.ok(option, 'Missing ' + profile + ' for ' + id);
    wizard.wizardData.toolheads[id] = option.key;
}

test('Reads slot-specific indexes, expands PWM heads, and cleans every VFD name', async () => {
    const { wizard, writes, listeners } = load();
    await wizard._loadToolheadOptions();
    assert.deepEqual(writes, ['$ES', '$$']);
    assert.equal(listeners.line.size, 0);
    const primary = wizard._getToolheadOptions('395');
    assert.equal(primary.filter(option => option.kind === 'router').length, 4);
    for (const option of primary.filter(option => option.kind === 'router')) assert.equal(option.value, 2);
    assert.equal(primary.find(option => option.name === 'Laser').value, 0);
    assert.ok(primary.some(option => option.name === 'Generic VFD (Modbus)'));
    assert.ok(primary.some(option => option.name === 'Huanyang V1 (Modbus)'));
    assert.equal(primary.filter(option => option.kind === 'vfd').length, 7);
    select(wizard, '395', 'mafell-digital');
    select(wizard, '511', 'laser-pwm');
    select(wizard, '512', 'nowforever');
    const assignments = wizard._computeToolheadAssignments();
    assert.equal(assignments.$395.value, 2);
    assert.equal(assignments.$511.value, 3);
    assert.equal(assignments.$512, undefined);
    assert.equal(wizard._toolheadValidationError(), '');
    const html = wizard._renderRouterStep();
    for (const label of ['Primary Toolhead', 'Secondary Toolhead', 'Mafell FM 1000', 'Laser']) assert.ok(html.includes(label));
    assert.doesNotMatch(html, />PWM2?</);
});

test('None uses the reported index, while missing slots never get guessed writes', async () => {
    const { wizard, metadata } = load();
    metadata['511'] = 'PWM2,PWM,Disabled,Huanyang v1';
    delete metadata['512'];
    await wizard._loadToolheadOptions();
    select(wizard, '395', 'workbee-router-head');
    assert.equal(wizard._computeToolheadAssignments().$511.value, 2);
    assert.equal(wizard._computeToolheadAssignments().$512, undefined);
    assert.equal(wizard._toolheadValidationError(), '');
});

test('Duplicate physical outputs and stale or missing selections block applying', async () => {
    const { wizard } = load();
    await wizard._loadToolheadOptions();
    assert.match(wizard._toolheadValidationError(), /primary/);
    select(wizard, '395', 'mafell-manual');
    select(wizard, '511', 'vfd-0-10v');
    assert.match(wizard._toolheadValidationError(), /only.*one/);
    wizard.wizardData.toolheads['511'] = '99:stale';
    assert.match(wizard._toolheadValidationError(), /each available slot/);
    wizard.ws.isConnected = false;
    assert.match(wizard._toolheadValidationError(), /Connect/);
});

test('Discovery errors leave no guessed options and remove the listener', async () => {
    const { wizard, ws, listeners } = load();
    ws.sendCommandWithAck = async () => { throw new Error('Controller busy'); };
    await wizard._loadToolheadOptions();
    assert.equal(wizard._getToolheadOptions('395').length, 0);
    assert.match(wizard._toolheadValidationError(), /Controller busy/);
    assert.equal(listeners.line.size, 0);
});

test('Applies exact indexes with acknowledgements and never writes WebUI timeout', async () => {
    const { wizard, writes, values } = load();
    await wizard._loadToolheadOptions();
    select(wizard, '395', 'vfd-0-10v');
    select(wizard, '511', 'laser-pwm');
    select(wizard, '512', 'nowforever');
    assert.match(wizard._renderApplyStep(), /\$395=2/);
    await wizard._applyConfig();
    for (const command of ['$395=2', '$511=3']) assert.ok(writes.includes(command));
    assert.ok(!writes.some(command => /^\$(396|512)=/.test(command)));
    assert.equal(wizard.hidden, true);
    assert.ok(writes.includes('\x18'));
    const profile = JSON.parse(values.get('machine.toolheads'));
    assert.equal(profile.spindle, 'vfd-0-10v');
    assert.equal(profile.laser, true);
    assert.equal(profile.additional.value, 2);
});

test('A rejected assignment stops without reporting success or resetting', async () => {
    const { wizard, ws, writes } = load();
    await wizard._loadToolheadOptions();
    select(wizard, '395', 'mafell-digital');
    select(wizard, '511', 'laser-pwm');
    const original = ws.sendCommandWithAck;
    ws.sendCommandWithAck = async command => command === '$511=3' ? { response: 'error:3' } : original(command);
    await wizard._applyConfig();
    assert.equal(wizard.lastStatus.type, 'error');
    assert.match(wizard.lastStatus.text, /\$511=3.*error:3/);
    assert.ok(!writes.includes('\x18'));
    assert.equal(wizard.hidden, undefined);
});

test('Grbl Settings shares aliases and stages numeric indexes rather than alias keys', () => {
    const { context } = load();
    const settings = vm.runInContext('Object.create(GrblSettings.prototype)', context);
    settings.settings = {};
    settings.pendingChanges = {};
    settings._updateSaveButton = settings._updateSidebarBadges = settings.render = () => {};
    for (const id of ['395', '511', '512']) {
        settings.settings = {};
        const setting = settings.settings[id] = { id, type: 3, val: '1', format: 'Disabled,PWM2,Huanyang v1,PWM' };
        const html = settings._renderInput(setting, '1');
        assert.match(html, />Laser<\/option>/);
        assert.match(html, /Mafell FM 1000/);
        assert.match(html, /Huanyang V1 \(Modbus\)/);
        assert.doesNotMatch(html, />PWM2?</);
        assert.equal((html.match(/ selected/g) || []).length, 1);
        settings.updateToolhead(id, '3:mafell-digital');
        assert.equal(settings.pendingChanges[id], '3');
        assert.match(settings._renderInput(setting, '3'), /value="3:mafell-digital" selected/);
    }
});

test('Assigned PWM aliases, Laser and VFDs disappear from other slots and return when freed', async () => {
    const { wizard } = load();
    await wizard._loadToolheadOptions();
    select(wizard, '395', 'mafell-digital');
    for (const id of ['511', '512']) assert.ok(!wizard._availableToolheadOptions(id).some(option => option.kind === 'router'));
    select(wizard, '511', 'laser-pwm');
    assert.ok(!wizard._availableToolheadOptions('512').some(option => option.kind === 'laser'));
    select(wizard, '512', 'nowforever');
    assert.ok(!wizard._availableToolheadOptions('395').some(option => option.source === 'nowforever'));
    select(wizard, '511', 'disabled');
    assert.ok(wizard._availableToolheadOptions('512').some(option => option.kind === 'laser'));
    const html = wizard._renderRouterStep();
    assert.match(html, /role="radiogroup"/);
    assert.match(html, /type="radio"/);
    assert.doesNotMatch(html, /<select/);
    assert.match(html, /aria-expanded="true"/);
});

test('Grbl Settings excludes assigned sources using current and pending indexes', () => {
    const { context } = load();
    const settings = vm.runInContext('Object.create(GrblSettings.prototype)', context);
    settings.settings = {
        '395': { id: '395', type: 3, val: '0', format: 'PWM,PWM2,Nowforever' },
        '511': { id: '511', type: 3, val: '2', format: 'Disabled,PWM,PWM2,Nowforever' },
        '512': { id: '512', type: 3, val: '0', format: 'Disabled,PWM,PWM2,Nowforever' }
    };
    settings.pendingChanges = {};
    assert.ok(settings._availableToolheadOptions(settings.settings['512']).every(option => ['disabled', 'vfd'].includes(option.kind)));
    settings.pendingChanges['511'] = '0';
    assert.ok(settings._availableToolheadOptions(settings.settings['512']).some(option => option.kind === 'laser'));
});

test('Wizard hides tertiary and preserves an existing $512 assignment and its reserved output', async () => {
    const { wizard, ws } = load();
    const original = ws.sendCommandWithAck;
    ws.sendCommandWithAck = async command => {
        const result = await original(command);
        if (command === '$$') ws.emit('line', '$512=2');
        return result;
    };
    await wizard._loadToolheadOptions();
    assert.equal(wizard._toolheadProfile().additional.source, 'nowforever');
    assert.ok(!wizard._availableToolheadOptions('395').some(option => option.source === 'nowforever'));
    select(wizard, '395', 'mafell-digital');
    const html = wizard._renderRouterStep();
    assert.doesNotMatch(html, /Tertiary Toolhead|wizard-toolhead-512/);
    assert.equal(wizard._computeToolheadAssignments().$512, undefined);
});
