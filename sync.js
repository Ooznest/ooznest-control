const fs = require('fs');
const path = require('path');

const srcPath = path.resolve(__dirname);
const destPath = path.join(__dirname, 'cordova', 'www');

const version = require('./package.json').version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Android builds require a numeric release version');
const [major, minor, patch] = version.split('.').map(Number);
if (major > 2000 || minor > 99 || patch > 9999) throw new Error('Release version exceeds Android version-code limits');
const versionCode = major * 1000000 + minor * 10000 + patch;
const configPath = path.join(__dirname, 'cordova', 'config.xml');
let config = fs.readFileSync(configPath, 'utf8').replace(/(<widget\b[^>]*\bversion=")[^"]+"/, `$1${version}"`);
config = config.replace(/ android-versionCode="[^"]*"/, '').replace('<widget ', `<widget android-versionCode="${versionCode}" `);
fs.writeFileSync(configPath, config);

// Recreate generated assets so old development files cannot remain in the app.
fs.rmSync(destPath, { recursive: true, force: true });
fs.mkdirSync(destPath, { recursive: true });
fs.writeFileSync(path.join(destPath, 'package.json'), JSON.stringify({ version }));
const assets = ['index.html', 'js', 'themes', 'vendor', 'firmware', 'machine.json', 'ooznestlogo.gcode',
    'favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png',
    'android-chrome-192x192.png', 'android-chrome-512x512.png', 'site.webmanifest', 'splash.png'];
for (const item of assets) {
    fs.cpSync(path.join(srcPath, item), path.join(destPath, item), {
        recursive: true, filter: file => !file.endsWith('.gz')
    });
}

console.log("Copied web UI to cordova/www");
