const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
    let now = 0, nextId = 0;
    const timers = new Map();
    const sent = [], realtime = [];
    const element = { classList: { add() {}, remove() {}, replace() {} } };
    const context = vm.createContext({
        console,
        document: { documentElement: { dataset: {} }, getElementById: () => ({ ...element }), querySelector: () => null, querySelectorAll: () => [] },
        setTimeout(fn, delay) { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; },
        clearTimeout(id) { timers.delete(id); },
        setInterval() { return 0; }, clearInterval() {},
        window: {
            term: { writeln() {} },
            sdHandler: { processLine: () => false, probeAvailabilityOnBoot() { sent.push('$FM'); } },
            grblSettings: { handleLine: () => false }, reporter: { handleLine: () => false },
            jobController: { processLine: () => false },
            troubleshooting: { updateSignalVisibility() {}, primeStartupDiscovery() { sent.push('$pins'); } },
            ws: { isConnected: true, sendCommand: command => sent.push(command), sendRealtime: char => realtime.push(char), disconnect() { this.isConnected = false; } }
        }
    });
    for (const file of ['js/ui/ui.js', 'js/machine/line-processor.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    function tick(duration) {
        const end = now + duration;
        while (true) {
            const entry = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!entry) break;
            timers.delete(entry[0]); now = entry[1].at; entry[1].fn();
        }
        now = end;
    }
    return { window: context.window, context, sent, realtime, tick };
}

for (const version of ['1.1f', '1.1h']) {
    const { window: w, context, sent, realtime, tick } = setup();
    w.uiManager.updateConnectionState(true, w.ws, w.sdHandler);
    tick(2000);
    assert.deepEqual(sent, ['$I']);
    for (const line of [`[VER:${version}.20170801:]`, '[OPT:V,15,128]', 'ok']) w.lineProcessor.processLine(line);
    tick(0); assert.deepEqual(sent, ['$I', '$$']);
    w.lineProcessor.processLine('ok'); tick(500);
    w.lineProcessor.processLine('ok'); tick(500);
    w.lineProcessor.processLine('ok'); tick(6000);
    assert.deepEqual(sent, ['$I', '$$', '$#', '$G']);
    assert.equal(w.ws.isConnected, true);
    assert.equal(w.ws.isGrblHAL, false);
    assert.equal(context.document.documentElement.dataset.controllerFirmware, 'grbl');
    assert.deepEqual(realtime, []);
}
{
    const { window: w, context, sent, tick } = setup();
    w.uiManager.updateConnectionState(true, w.ws, w.sdHandler); tick(2000);
    for (const line of ['[VER:1.1f.20260928:]', '[FIRMWARE:grblHAL]', 'ok']) w.lineProcessor.processLine(line);
    tick(0); tick(4500);
    assert.equal(w.ws.isGrblHAL, true);
    assert.equal(context.document.documentElement.dataset.controllerFirmware, 'grblhal');
    assert.deepEqual(sent, ['$I', '$EA', '$EE', '$FM', '$EG', '$ES', '$$', '$#', '$I+', '$pins']);
}
{
    const { window: w, sent, tick } = setup();
    w.uiManager.updateConnectionState(true, w.ws, w.sdHandler); tick(2000);
    w.ws.isConnected = false;
    w.uiManager.updateConnectionState(false, w.ws, w.sdHandler); tick(10000);
    assert.deepEqual(sent, ['$I']);
}
{
    const { window: w, sent, tick } = setup();
    w.uiManager.updateConnectionState(true, w.ws, w.sdHandler); tick(7000);
    assert.equal(w.ws.isConnected, false);
    assert.deepEqual(sent, ['$I']);
}
(async () => {
    const { context } = setup();
    const source = fs.readFileSync('js/machine/connection-manager.js', 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export class ConnectionManager', 'class ConnectionManager');
    vm.runInContext(source + '\nwindow.manager = Object.create(ConnectionManager.prototype);', context);
    const manager = context.window.manager, sent = [], realtime = [];
    manager.type = 'webserial';
    manager.webSerial = { async sendCommand(cmd) { sent.push(cmd); }, async sendRealtime(char) { realtime.push(char); } };
    for (const cmd of ['$F+', '$FM', '$I+', '$pins', '$pinstate', '$spindlesh', '$EA', '$EE', '$EG', '$ESH', '$HX', '$TLR', '$TPW']) await manager.sendCommand(cmd);
    assert.deepEqual(sent, []);
    for (const cmd of ['$I', '$$', '$#', '$G', '$J=G91 X1 F100']) await manager.sendCommand(cmd);
    assert.equal(sent.length, 5);
    await manager.sendRealtime('\x87'); assert.deepEqual(realtime, ['?']);
    manager.isGrblHAL = true;
    await manager.sendCommand('$pins'); assert.equal(sent.at(-1), '$pins');
    await manager.sendRealtime('\x87'); assert.equal(realtime.at(-1), '\x87');
    console.log('Grbl startup, HAL discovery, command guards, timeout and disconnect checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

{
    const { context } = setup();
    context.localStorage = { getItem() { return null; } };
    vm.runInContext(fs.readFileSync('js/machine/grbl_settings.js', 'utf8').replace('export class GrblSettings', 'class GrblSettings') + '\nwindow.settingsTest = new GrblSettings(window.ws, window.term);', context);
    const settings = context.window.settingsTest, commands = [];
    context.window.ws.sendCommand = cmd => commands.push(cmd);
    settings.fetchSettings();
    assert.deepEqual(commands, ['$$']);
    settings.handleLine('$100=250.000');
    assert.equal(settings.activeGroupId, '0');
    assert.equal(settings.groups['0'].label, 'Grbl Settings');
    assert.equal(settings.settings['100'].label, 'X travel resolution');
    assert.equal(settings.settings['100'].val, '250.000');
    settings.resetControllerData();
    assert.equal(Object.keys(settings.settings).length, 0);
    context.window.ws.isGrblHAL = true;
    settings.handleLine('[SETTING:100|1|Driver resolution|steps/mm|5||||]');
    assert.equal(settings.settings['100'].label, 'Driver resolution');
}
