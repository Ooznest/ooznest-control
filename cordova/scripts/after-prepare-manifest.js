//
// after_prepare hook: patch platforms/android/app/src/main/AndroidManifest.xml
//
// Background: <edit-config file="app/src/main/AndroidManifest.xml" ...> entries
// in config.xml are tracked in config_munge but never materialize in the
// generated manifest with cordova-android 14 (the manifest is rewritten after
// the munge is applied). This hook applies the three additions we need
// idempotently, after every prepare:
//
//   1. <uses-feature android.hardware.usb.host>      (OTG serial support)
//   2. application networkSecurityConfig + usesCleartextTraffic (LAN http/ws)
//   3. USB_DEVICE_ATTACHED intent-filter + device_filter meta-data on
//      MainActivity (system routes the controller USB device to the app)
//
module.exports = function (ctx) {
    const fs = require('fs');
    const path = require('path');

    const manifest = path.join(
        ctx.opts.projectRoot,
        'platforms', 'android', 'app', 'src', 'main', 'AndroidManifest.xml'
    );
    if (!fs.existsSync(manifest)) {
        console.log('[manifest-fix] AndroidManifest.xml not found, skipping.');
        return;
    }

    let s = fs.readFileSync(manifest, 'utf8');
    let changed = false;

    // 1. USB host feature (sibling of existing uses-permission).
    if (!s.includes('android.hardware.usb.host')) {
        s = s.replace(
            '<uses-permission android:name="android.permission.INTERNET" />',
            '<uses-permission android:name="android.permission.INTERNET" />\n' +
            '    <uses-feature android:name="android.hardware.usb.host" android:required="true" />'
        );
        changed = true;
    }

    // 2. Cleartext + network security config on <application>.
    if (!s.includes('networkSecurityConfig')) {
        s = s.replace(
            '<application ',
            '<application android:networkSecurityConfig="@xml/network_security_config" android:usesCleartextTraffic="true" '
        );
        changed = true;
    }

    // 3. USB attach intent-filter + device filter on MainActivity.
    if (!s.includes('USB_DEVICE_ATTACHED')) {
        s = s.replace(
            '            <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>',
            '            <category android:name="android.intent.category.LAUNCHER" />\n' +
            '            </intent-filter>\n' +
            '            <intent-filter>\n' +
            '                <action android:name="android.hardware.usb.action.USB_DEVICE_ATTACHED" />\n' +
            '            </intent-filter>'
        );
        s = s.replace(
            '</activity>',
            '            <meta-data android:name="android.hardware.usb.action.USB_DEVICE_ATTACHED" android:resource="@xml/device_filter" />\n' +
            '        </activity>'
        );
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(manifest, s);
        console.log('[manifest-fix] AndroidManifest.xml patched (USB + cleartext).');
    } else {
        console.log('[manifest-fix] AndroidManifest.xml already patched.');
    }
};
