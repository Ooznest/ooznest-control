const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/features/firmware-flasher.js', 'utf8');
const port = {};
const FirmwareFlasher = vm.runInNewContext(
    source.replace(/^import .*\r?\n/gm, '').replace('export class', 'class') + '\nFirmwareFlasher',
    { navigator: { serial: { getPorts: async () => [port] } } }
);

async function checkReconnect(identifies) {
    const flasher = Object.create(FirmwareFlasher.prototype);
    const log = [];
    const waits = [];
    flasher.browserReconnectPending = true;
    flasher._render = () => {};
    flasher._appendLog = line => log.push(line);
    flasher._sleep = async ms => {
        waits.push(ms);
        assert.equal(flasher._reconnectSucceeded, undefined);
        if (identifies && waits.length === 4) flasher.ws.isGrblHAL = true;
    };
    flasher.ws = {
        isConnected: false,
        isGrblHAL: false,
        webSerial: {
            async connectToPort(foundPort) {
                assert.equal(foundPort, port);
                assert.deepEqual(waits, [1500]);
                flasher.ws.isConnected = true;
            }
        },
        disconnect() { this.isConnected = false; }
    };

    await flasher._reconnectBrowserController();
    assert.equal(Boolean(flasher._reconnectSucceeded), identifies);
    assert.equal(flasher.browserReconnectPending, !identifies);
    assert.equal(flasher.ws.isConnected, identifies);
    assert.match(log.at(-1), identifies ? /Reconnected Successfully/ : /unplug USB.*turn the controller on, then reconnect/);
}

async function main() {
    await checkReconnect(true);
    await checkReconnect(false);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
