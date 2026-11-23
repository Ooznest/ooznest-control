const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup(lines = [], isConnected = true) {
    let download;
    const context = vm.createContext({
        Blob, TextEncoder, Uint8Array, DataView,
        document: {
            title: 'Ooznest Control test',
            createElement: () => ({ click() {} }),
            body: { appendChild() {}, removeChild() {} }
        },
        URL: { createObjectURL(blob) { download = blob; return 'blob:test'; }, revokeObjectURL() {} },
        setTimeout() {},
        window: { ws: { isConnected, type: 'usb' }, configWizard: { _verLines: lines } }
    });
    const source = fs.readFileSync(path.join(__dirname, '../js/ui/troubleshooting-info.js'), 'utf8')
        .replace('export class ', 'class ');
    vm.runInContext(source, context);
    const view = vm.runInContext('new TroubleshootingInfoView()', context);
    return { view, window: context.window, download: () => download };
}

for (const [line, module, link] of [
    ['[ETHERNET LINK:UP]', 'Installed', 'Up'],
    ['[ETHERNET LINK:DOWN]', 'Installed', 'Down'],
    ['[ETHERNET MODULE NOT INSTALLED]', 'Not installed', 'Not applicable']
]) {
    test(`Ethernet report ${line} appears in the troubleshooting card and exports`, async () => {
        const { view, download } = setup([line]);
        const status = view._getEthernetStatus();
        assert.equal(status.module, module);
        assert.equal(status.link, link);
        const card = view._networkStatusCard();
        assert.match(card, /Ethernet module/);
        assert.match(card, /Ethernet link/);
        assert.ok(card.includes(module));
        assert.ok(card.includes(link));

        const snapshot = await view._buildSnapshot();
        assert.equal(snapshot.ethernet.module, module);
        assert.equal(snapshot.ethernet.link, link);
        const text = view._buildPlainTextReport(snapshot);
        assert.ok(text.includes(`=== Ethernet ===\nModule: ${module}\nLink: ${link}`));
        await view.exportHtml();
        const html = await download().text();
        assert.match(html, /<h2>Ethernet<\/h2>/);
        assert.ok(html.includes(module));
        assert.ok(html.includes(link));
        view._createZipBlob = (name, content) => new Blob([content]);
        await view.exportJson();
        const json = JSON.parse(await download().text());
        assert.deepEqual(json.ethernet, { module, link });
    });
}

test('Missing reports remain unknown even when IP or MAC information is present', () => {
    for (const lines of [[], ['[IP:192.168.0.10]', '[MAC:00:11:22:33:44:55]'], ['[ETHERNET LINK:INVALID]']]) {
        const { view } = setup(lines);
        assert.equal(view._getEthernetStatus().module, 'Unknown');
        assert.equal(view._getEthernetStatus().link, 'Unknown');
    }
});

test('Disconnect and refreshed build info do not retain the previous Ethernet result', async () => {
    const { view, window } = setup(['[ETHERNET LINK:UP]']);
    window.ws.isConnected = false;
    assert.equal((await view._buildSnapshot()).ethernet.module, 'Unknown');
    assert.equal((await view._buildSnapshot()).ethernet.link, 'Unknown');
    assert.doesNotMatch(view._networkStatusCard(), /Installed|Ethernet link/);
    window.ws.isConnected = true;
    window.configWizard._verLines = [];
    assert.equal(view._getEthernetStatus().module, 'Unknown');
    assert.equal(view._getEthernetStatus().link, 'Unknown');
});
