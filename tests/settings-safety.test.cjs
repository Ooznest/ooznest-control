const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load(file, name, extra = {}) {
    const window = { addEventListener() {}, requestAnimationFrame() {}, setTimeout, clearTimeout };
    const document = { addEventListener() {}, getElementById() { return null; }, hidden: false, hasFocus: () => true };
    const context = vm.createContext({ window, document, navigator: {}, localStorage: { getItem: () => null, setItem() {} },
        console, setTimeout, clearTimeout, TextEncoder, TextDecoder, Blob, URL, registerModal: () => null, ...extra });
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export class /g, 'class ');
    vm.runInContext(source + `\nglobalThis.Subject = ${name};`, context, { filename: file });
    return { Class: context.Subject, context };
}
function bus() {
    return { isConnected: true, listeners: {}, sent: [], on(event, cb) { (this.listeners[event] ||= []).push(cb); },
        off(event, cb) { this.listeners[event] = (this.listeners[event] || []).filter(f => f !== cb); },
        emit(event, value) { [...(this.listeners[event] || [])].forEach(cb => cb(value)); },
        async sendCommand(line) { this.sent.push(line); } };
}
function settings(extra = {}) {
    const { Class, context } = load('js/machine/grbl_settings.js', 'GrblSettings', extra);
    const ws = bus(), output = [], instance = new Class(ws, { writeln: line => output.push(line) });
    instance.render = () => {};
    instance.settings = { '100': { id: '100', val: '400', type: 5, min: '1', max: '1000', label: 'X resolution' },
        '110': { id: '110', val: '4000', type: 5, label: 'X maximum rate' },
        '75': { id: '75', val: 'private', type: 7, label: 'WiFi Password' } };
    return { instance, ws, context, output };
}
function reviewRoot() {
    const body = {}, buttons = [{}, {}], confirm = {};
    buttons.forEach(b => { b.hasAttribute = () => false; });
    return { body, confirm, querySelector: s => s === '.oz-modal__body' ? body : confirm,
        querySelectorAll: s => s === 'button' ? [...buttons, confirm] : buttons };
}

test('Refresh Cancel preserves pending edits and sends no discovery commands', () => {
    const { instance, ws, context } = settings();
    instance.pendingChanges = { '100': '401' };
    let confirm;
    context.window.reporter = { showConfirm: (...args) => { confirm = args; } };
    instance.fetchSettings();
    assert.equal(ws.sent.length, 0);
    assert.equal(instance.pendingChanges['100'], '401');
    assert.equal(confirm[0], 'Discard unsaved settings?');
    let refreshed = false;
    instance._fetchSettings = () => { refreshed = true; };
    confirm[2]();
    assert.equal(refreshed, true);
});

test('Restore only previews and rejects unknown IDs, invalid numbers and command injection', () => {
    class Reader { readAsText(file) { this.onload({ target: { result: file } }); } }
    const { instance, ws } = settings({ FileReader: Reader });
    let preview;
    instance._showWriteReview = (...args) => { preview = args; };
    instance.restore(JSON.stringify({ controller: { board: 'test' }, settings: { '100': 401, '110': '12\n$100=1', '9999': 1, '75': 'safe password' } }));
    assert.equal(ws.sent.length, 0);
    assert.equal(preview[1].length, 2);
    assert.equal(preview[2].length, 2);
    assert.equal(preview[3].board, 'test');
    assert.match(instance._validateSetting('100', '-1'), /Minimum/);
    assert.match(instance._validateSetting('100', 'NaN'), /finite/);
    assert.equal(instance._reviewValue('75', 'secret'), '[hidden]');
});

test('Save waits for acknowledgements and retains rejected pending values', async () => {
    const { instance, ws, output } = settings();
    instance.pendingChanges = { '100': '401', '110': '4100' };
    let count = 0;
    ws.sendCommandWithAck = async command => ({ command, response: ++count === 1 ? 'ok' : 'error:3' });
    instance.writeReviewModal = { options: {} };
    const root = reviewRoot();
    await instance._writeBatch([{ id: '100', value: '401' }, { id: '110', value: '4100' }], root);
    assert.equal(instance.settings['100'].val, '401');
    assert.equal(instance.pendingChanges['100'], undefined);
    assert.equal(instance.settings['110'].val, '4000');
    assert.equal(instance.pendingChanges['110'], '4100');
    assert.match(root.body.innerHTML, /1 accepted; 1 rejected/);
    assert.match(root.body.innerHTML, /\$110: error:3/);
    assert.deepEqual(ws.sent, ['$$']);
    assert.equal(instance.writing, false);
    assert.equal(output.length, 1);
});

test('Timeout stops the batch, preserves edits and avoids unsafe follow-up reads', async () => {
    const { instance, ws } = settings();
    instance.pendingChanges = { '100': '401', '110': '4100' };
    let writes = 0;
    ws.sendCommandWithAck = async () => { writes++; throw Error('timeout'); };
    instance.writeReviewModal = { options: {} };
    const root = reviewRoot();
    await instance._writeBatch([{ id: '100', value: '401' }, { id: '110', value: '4100' }], root);
    assert.equal(writes, 1);
    assert.equal(instance.pendingChanges['100'], '401');
    assert.match(root.body.innerHTML, /1 unconfirmed; 1 not sent/);
    assert.equal(ws.sent.length, 0);
});

test('Backup warns about unsaved edits; automatic backup does not open an asynchronous prompt', () => {
    const { instance, context } = settings();
    instance.pendingChanges = { '100': '401' };
    let prompts = 0;
    context.window.reporter = { showConfirm() { prompts++; } };
    assert.equal(instance.backup(), null);
    assert.equal(prompts, 1);
    assert.equal(instance.backup({ prefix: 'pre_flash' }), null);
    assert.equal(prompts, 1);
});

test('History redacts new password changes and identity resets between connections', () => {
    const { instance, ws } = settings();
    instance.recordSentCommand('$75=very-secret');
    assert.equal(instance.settingChangeHistory[0].to, '[hidden]');
    assert.equal(instance.settingChangeHistory[0].from, '[hidden]');
    ws.emit('line', '[VER:1.1:test]');
    ws.emit('line', '[BOARD:test-board]');
    assert.equal(instance.controllerIdentity.board, 'test-board');
    ws.emit('disconnect');
    assert.equal(Object.keys(instance.controllerIdentity).length, 0);
});

function ackManager() {
    const { Class } = load('js/machine/connection-manager.js', 'ConnectionManager');
    const manager = Object.create(Class.prototype);
    manager.listeners = Object.fromEntries(['command-result', 'disconnect', 'error', 'line'].map(k => [k, []]));
    manager.isConnected = true;
    manager.type = 'webserial';
    manager.webSerial = { isDrained: () => true };
    manager.sendCommand = async () => {};
    return manager;
}
test('Acknowledgements ignore unrelated replies and handle explicit controller errors', async () => {
    const manager = ackManager();
    const pending = manager.sendCommandWithAck('$100=401');
    manager.emit('command-result', { command: '$I', response: 'ok' });
    assert.ok(manager._ackRequest);
    manager.emit('command-result', { command: '$100=401', response: 'error:3' });
    assert.equal((await pending).response, 'error:3');
    assert.equal(manager._ackRequest, null);
});
test('Acknowledgements reject busy, disconnect, timeout and reset with listener cleanup', async () => {
    const manager = ackManager();
    manager.webSerial.isDrained = () => false;
    await assert.rejects(manager.sendCommandWithAck('$100=401'), /busy/);
    manager.webSerial.isDrained = () => true;
    let pending = manager.sendCommandWithAck('$100=401');
    manager.emit('disconnect');
    await assert.rejects(pending, /disconnected/);
    pending = manager.sendCommandWithAck('$100=401', { timeoutMs: 5 });
    await assert.rejects(pending, /timed out/);
    pending = manager.sendCommandWithAck('$100=401');
    manager.emit('line', 'GrblHAL 1.1');
    await assert.rejects(pending, /reset/);
    assert.equal(Object.values(manager.listeners).flat().length, 0);
});
test('Both transport FIFOs report the actual command whose reply arrived', () => {
    const { Class: Serial } = load('js/machine/webserial.js', 'WebSerial');
    const serial = new Serial();
    let result;
    serial.on('command-result', r => { result = r; });
    serial.sentBuffer.push('$I', '$100=401');
    serial.emit('line', 'ok');
    assert.equal(result.command, '$I');
    serial.emit('line', 'error:3');
    assert.equal(result.command, '$100=401');
    const { Class: Flow } = load('js/machine/grbl-flow-control.js', 'GrblFlowControl');
    const flow = new Flow({ emit: (event, r) => { result = r; } });
    flow.sentBuffer.push('$110=4000');
    flow.processLine('ok');
    assert.equal(result.command, '$110=4000');
});

function pad() {
    const values = new Map(), ws = bus();
    const { Class, context } = load('js/features/gamepad.js', 'GamepadController');
    const instance = new Class(ws, { get: k => values.get(k), set: (k, v) => values.set(k, v) });
    instance.modal = { open: true, isOpen() { return this.open; }, hide() { this.open = false; instance.pendingMappings = null; } };
    instance.gamepadIndex = 0;
    instance.pendingMappings = { x: 'none', y: 'none', a: 'none', b: 'none', 'left-button': 'none', 'right-button': 'none', select: 'none', start: 'none' };
    instance.pendingEnabled = false;
    return { instance, values, context, ws };
}
test('Gamepad staging does not affect runtime mappings; Apply commits after confirmation', () => {
    const { instance, values, context } = pad();
    instance.pendingMappings.x = 'home-all';
    assert.equal(instance._mapping('x'), 'none');
    let confirm;
    context.window.reporter = { showConfirm: (...args) => { confirm = args; } };
    instance._applySettings();
    assert.equal(values.size, 0);
    confirm[2]();
    assert.equal(values.get('gamepad.mappings.x'), 'home-all');
    assert.equal(instance.modal.open, false);
});
test('Gamepad cancelled confirmation leaves stored mappings unchanged', () => {
    const { instance, values, context } = pad();
    instance.pendingMappings.x = 'home-all';
    let confirm;
    context.window.reporter = { showConfirm: (...args) => { confirm = args; } };
    instance._applySettings();
    confirm[3]();
    instance.pendingMappings = null; // Same discard used by Close/Escape/backdrop.
    assert.equal(values.size, 0);
    assert.equal(instance._mapping('x'), 'none');
});
test('Gamepad starts disabled, enables only with confirmation and disables on disconnect', () => {
    const { instance, context, ws } = pad();
    assert.equal(instance.enabled, false);
    instance.pendingEnabled = true;
    let confirm;
    context.window.reporter = { showConfirm: (...args) => { confirm = args; } };
    instance._applySettings();
    assert.equal(instance.enabled, false);
    confirm[2]();
    assert.equal(instance.enabled, true);
    ws.emit('disconnect');
    assert.equal(instance.enabled, false);
});
test('Held controls do not activate after closing settings until neutral', () => {
    const { instance } = pad();
    const gamepad = { axes: [1, 0, 0, 0], buttons: [{ pressed: false, value: 0 }] };
    instance._getActiveGamepad = () => gamepad;
    instance.enabled = true;
    instance.modal.open = false;
    instance.awaitingNeutral = true;
    let actions = 0;
    instance._handleButtonActions = () => { actions++; };
    instance._handleDpad = () => {};
    instance._handleAnalogJog = () => {};
    instance._loop();
    assert.equal(actions, 0);
    gamepad.axes[0] = 0;
    instance._loop();
    assert.equal(actions, 0);
    instance._loop();
    assert.equal(actions, 1);
});

test('Backup carries controller identity and scope without application preferences', async () => {
    let blob;
    const anchor = { click() {} };
    const document = { createElement: () => anchor, body: { appendChild() {}, removeChild() {} } };
    const { instance, ws } = settings({ document, URL: { createObjectURL: value => { blob = value; return 'blob:test'; }, revokeObjectURL() {} } });
    ws.emit('line', '[VER:1.1:test-profile]');
    ws.emit('line', '[BOARD:test-board]');
    const result = instance.backup();
    const payload = JSON.parse(await blob.text());
    assert.equal(payload.formatVersion, 2);
    assert.equal(payload.scope, 'controller-settings-only');
    assert.equal(payload.controller.board, 'test-board');
    assert.equal(payload.controller.firmware, '1.1:test-profile');
    assert.equal(payload.settings['75'], 'private'); // Backups are private recovery files, not redacted diagnostics.
    assert.equal(payload.gamepad, undefined);
    assert.equal(result.count, 3);
});

test('A disconnect before the scheduled write never sends the command', async () => {
    const manager = ackManager();
    let sent = false;
    manager.sendCommand = async () => { sent = true; };
    const pending = manager.sendCommandWithAck('$100=401');
    manager.emit('disconnect');
    await assert.rejects(pending, /disconnected/);
    await Promise.resolve();
    assert.equal(sent, false);
});

test('A connection change after one accepted write aborts the rest of the batch', async () => {
    const { instance, ws } = settings();
    instance.pendingChanges = { '100': '401', '110': '4100' };
    let writes = 0;
    ws.sendCommandWithAck = async command => {
        writes++;
        ws.emit('disconnect');
        ws.emit('connect');
        return { command, response: 'ok' };
    };
    instance.writeReviewModal = { options: {} };
    const root = reviewRoot();
    await instance._writeBatch([{ id:'100', value:'401' }, { id:'110', value:'4100' }], root);
    assert.equal(writes, 1);
    assert.equal(instance.pendingChanges['110'], '4100');
    assert.match(root.body.innerHTML, /1 not sent/);
});

test('Gamepad remains paused while disabled, while its modal is open, or when focus is lost', () => {
    const { instance, context } = pad();
    const gamepad = { axes: [0,0,0,0], buttons: [] };
    instance._getActiveGamepad = () => gamepad;
    let actions = 0;
    instance._handleButtonActions = () => { actions++; };
    instance._handleDpad = () => {};
    instance._handleAnalogJog = () => {};
    instance._loop();
    instance.enabled = true;
    instance._loop(); // Modal still open.
    instance.modal.open = false;
    context.document.hasFocus = () => false;
    instance._loop();
    assert.equal(actions, 0);
});

test('A busy transport is reported as not sent rather than an uncertain write', async () => {
    const { instance, ws } = settings();
    ws.sendCommandWithAck = async () => { throw Object.assign(new Error('Controller is busy'), { notSent: true }); };
    instance.writeReviewModal = { options: {} };
    const root = reviewRoot();
    await instance._writeBatch([{ id:'100', value:'401' }], root);
    assert.match(root.body.innerHTML, /0 unconfirmed; 1 not sent/);
    assert.equal(ws.sent.length, 0);
});

test('Dismissing gamepad safety confirmation with Escape does not lock Apply', () => {
    const { instance, context } = pad();
    instance.pendingMappings.x = 'home-all';
    let prompts = 0, open = true;
    context.window.reporter = { modalController: { isOpen: () => open }, showConfirm: () => { prompts++; open = true; } };
    instance._applySettings();
    instance._applySettings();
    assert.equal(prompts, 1);
    open = false; // Same state as shared modal Escape/backdrop dismissal.
    instance._applySettings();
    assert.equal(prompts, 2);
});
