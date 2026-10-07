const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const elements = new Map();
function element(id) {
    if (!elements.has(id)) {
        const classes = new Set();
        elements.set(id, { textContent: '', style: {}, classList: {
            add(name) { classes.add(name); }, remove(name) { classes.delete(name); },
            toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
            contains(name) { return classes.has(name); }
        }});
    }
    return elements.get(id);
}
const sent = [];
const ws = { isConnected: true, isGrblHAL: true, supportsProbeStatus: true,
    on() {}, sendCommand(command) { sent.push(command); }, sendRealtime(char) { sent.push(char); } };
const context = vm.createContext({ console, Date, setTimeout() {}, clearTimeout() {},
    setInterval() {}, clearInterval() {},
    document: { getElementById: element, querySelector: () => null, documentElement: { dataset: {} } },
    window: { ws } });
vm.runInContext(fs.readFileSync('js/ui/troubleshooting.js', 'utf8').replace('export class TroubleshootingHandler', 'class TroubleshootingHandler') + '\nwindow.troubleshooting = new TroubleshootingHandler(window.ws, {});', context);
const trouble = context.window.troubleshooting;
trouble.updatePins('PI', { full: true });
assert.equal(element('probe-status-primary').textContent, 'P: ON');
assert.equal(element('probe-status-tls').textContent, 'TLS: OFF');
assert.equal(element('pin-indicator-P').textContent, 'ON');
trouble.updatePins('P');
assert.equal(element('probe-status-primary').textContent, 'P: ON');
trouble.updatePins('PJ', { full: true });
assert.equal(element('probe-status-primary').textContent, 'P: OFF');
assert.equal(element('probe-status-tls').textContent, 'TLS: ON');
trouble.updatePins('PK', { full: true });
assert.equal(element('probe-status-secondary').textContent, 'P2: ON');
trouble.updatePins('IJK', { full: true });
for (const id of ['primary', 'tls', 'secondary']) assert.equal(element(`probe-status-${id}`).classList.contains('signal-on'), true);
trouble.updatePins('', { full: true });
for (const id of ['primary', 'tls', 'secondary']) assert.equal(element(`probe-status-${id}`).classList.contains('signal-on'), false);
trouble.updatePins('H', { full: true });
assert.equal(element('pin-indicator-H').textContent, 'ON');
assert.equal(element('probe-status-tls').textContent, 'TLS: OFF');
trouble.resetProbeStatus();
assert.equal(element('probe-status-primary').textContent, 'P: --');
ws.supportsProbeStatus = false; trouble.syncProbeControls();
assert.equal(element('probe-mode-radios').classList.contains('hidden'), false);
assert.equal(element('probe-status-buttons').classList.contains('hidden'), true);
ws.isGrblHAL = false; trouble.selectProbeMode('tls'); assert.deepEqual(sent, []);
vm.runInContext(fs.readFileSync('js/ui/ui.js', 'utf8'), context);
const ui = context.window.uiManager;
context.window.lineProcessor = {};
for (const [build, hal, expected] of [[20261007,true,false],[20261008,true,true],[20261008,false,false]]) {
    ui._identifyingFirmware = true;
    ws.isGrblHAL = hal;
    ui.handleFirmwareIdentification(`[VER:1.1f.${build}:]`);
    ui.handleFirmwareIdentification('ok');
    assert.equal(ws.supportsProbeStatus, expected);
}
ws.supportsProbeStatus = true;
ui._lastFullStatusPoll = null;
for (const now of [0,250,500,750,1000]) ui.pollStatus(ws, now);
assert.deepEqual(sent, ['\x87','?','\x87','?','\x87']);
sent.length = 0; ws.supportsProbeStatus = false;
for (const now of [1250,1500]) ui.pollStatus(ws, now);
assert.deepEqual(sent, ['?','?']);
console.log('Probe build gate, full/normal snapshots, fallback, and 2 Hz polling passed.');
