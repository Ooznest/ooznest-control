const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/machine/connection-manager.js'), 'utf8');
const Manager = vm.runInNewContext(source.replace(/^import .*\r?\n/gm, '')
    .replace('export class', 'class') + '\nConnectionManager', { setTimeout, clearTimeout, console });

test('network discovery stops probing once a controller connection starts', async () => {
    const manager = Object.create(Manager.prototype);
    let probes = 0;
    Object.assign(manager, {
        CordovaSocket() {}, _setTelnetScanProgress() {},
        async _checkTelnetPortSequential() { probes++; this._isConnecting = true; return '192.168.0.55'; }
    });
    await manager._tcpScanSubnetSequential('192.168.0', 23, 1);
    assert.equal(probes, 1);
    manager._isConnecting = false;
    manager.isConnected = true;
    await manager._tcpScanSubnetSequential('192.168.0', 23, 1);
    assert.equal(probes, 1);
});

test('native Telnet marks the connection in progress before opening the socket', async () => {
    const manager = Object.create(Manager.prototype);
    Object.assign(manager, {
        isConnected: false,
        _setConnectingState(value) { this._isConnecting = value; },
        CordovaSocket: class {
            open() {
                assert.equal(manager.isConnecting, true);
                this.onError('test failure');
            }
        }
    });
    await assert.rejects(manager._connectCordovaTelnet('192.168.0.55', 23), /test failure/);
    assert.equal(manager.isConnecting, false);
});
