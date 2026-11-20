const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../sync.js'), 'utf8');

test('mobile packaging excludes development files and removes stale assets', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-package-'));
    try {
        fs.mkdirSync(path.join(root, 'cordova/www/.github'), { recursive: true });
        fs.writeFileSync(path.join(root, 'cordova/www/.github/secret.txt'), 'stale');
        fs.writeFileSync(path.join(root, 'cordova/config.xml'), '<widget id="com.ooznest.control" version="1.0.0"></widget>');
        const assets = ['index.html', 'js', 'themes', 'vendor', 'firmware', 'machine.json', 'ooznestlogo.gcode',
            'favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png',
            'android-chrome-192x192.png', 'android-chrome-512x512.png', 'site.webmanifest', 'splash.png'];
        for (const asset of assets) fs.writeFileSync(path.join(root, asset), 'asset');
        fs.writeFileSync(path.join(root, 'private-upload.jks'), 'secret');
        fs.writeFileSync(path.join(root, 'old-chat.txt'), 'private');
        const context = {
            __dirname: root, console: { log() {} },
            require: name => name === './package.json' ? { version: '1.0.205' } : require(name)
        };
        vm.runInNewContext(source, { ...context });
        assert.deepEqual(fs.readdirSync(path.join(root, 'cordova/www')).sort(), [...assets, 'package.json'].sort());
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'cordova/www/package.json'))), { version: '1.0.205' });
        const config = fs.readFileSync(path.join(root, 'cordova/config.xml'), 'utf8');
        assert.match(config, /android-versionCode="1000205"/);
        assert.match(config, /version="1.0.205"/);
        vm.runInNewContext(source, { ...context });
        assert.equal(fs.readFileSync(path.join(root, 'cordova/config.xml'), 'utf8'), config);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
