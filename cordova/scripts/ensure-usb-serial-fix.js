//
// after_prepare hook: re-apply the cordovarduino USB serial fixes.
//
// The fixes live in cordova/plugins/cordovarduino/... but that directory is
// NOT tracked by git (reinstalled from npm) and `cordova prepare` does not
// reliably re-copy plugin Java into platforms/android. This hook re-applies
// the patches idempotently to both trees on every prepare, so any fresh
// checkout / platform re-add still builds the crash-free driver:
//
//   1. PendingIntent FLAG_IMMUTABLE (Android 12+ crashes without it)
//   2. Skip permission dialog when already granted
//   3. RECEIVER_EXPORTED for the permission result (NOT_EXPORTED gets
//      0 receivers on Android 14+ -> silent hang, no dialog, no error)
//   4. openSerial null-guard + SecurityException guard
//   5. onResume manager-null guard
//   6. UsbBroadcastReceiver safe unregister
//
module.exports = function (ctx) {
    const fs = require('fs');
    const path = require('path');

    const projectRoot = ctx.opts.projectRoot; // cordova/
    const pluginSerialDir = path.join(projectRoot, 'plugins', 'cordovarduino', 'src', 'android', 'fr', 'drangies', 'cordova', 'serial');
    const platformSerialDir = path.join(projectRoot, 'platforms', 'android', 'app', 'src', 'main', 'java', 'fr', 'drangies', 'cordova', 'serial');
    const dirs = [pluginSerialDir, platformSerialDir].filter(d => {
        try { return fs.statSync(d).isDirectory(); } catch (e) { return false; }
    });

    const T = '\t';
    const patches = [
        {
            file: 'Serial.java',
            marker: 'FLAG_IMMUTABLE required on Android 12+',
            old: 'PendingIntent pendingIntent = PendingIntent.getBroadcast(cordova.getActivity(), 0, new Intent(UsbBroadcastReceiver.USB_PERMISSION), 0);',
            new: [
                T + T + T + T + T + 'int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;',
                T + T + T + T + T + 'if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {',
                T + T + T + T + T + T + 'piFlags |= PendingIntent.FLAG_IMMUTABLE;',
                T + T + T + T + T + '}',
                T + T + T + T + T + 'PendingIntent pendingIntent = PendingIntent.getBroadcast(cordova.getActivity(), 0, new Intent(UsbBroadcastReceiver.USB_PERMISSION), piFlags); // FLAG_IMMUTABLE required on Android 12+ or requestPermission crashes'
            ].join('\n')
        },
        {
            file: 'Serial.java',
            marker: 'skipping dialog',
            old: T + T + T + T + T + 'UsbBroadcastReceiver usbReceiver = new UsbBroadcastReceiver(callbackContext, cordova.getActivity());',
            new: [
                T + T + T + T + T + '// If permission was already granted (e.g. via the USB attach',
                T + T + T + T + T + '// auto-launch), skip the permission dialog entirely.',
                T + T + T + T + T + 'if (manager.hasPermission(device)) {',
                T + T + T + T + T + T + 'Log.d(TAG, "USB permission already granted, skipping dialog.");',
                T + T + T + T + T + T + 'callbackContext.success("Permission to connect to the device was already granted!");',
                T + T + T + T + T + T + 'return;',
                T + T + T + T + T + '}',
                T + T + T + T + T + 'UsbBroadcastReceiver usbReceiver = new UsbBroadcastReceiver(callbackContext, cordova.getActivity());'
            ].join('\n')
        },
        {
            file: 'Serial.java',
            marker: 'RECEIVER_EXPORTED',
            old: T + T + T + T + T + 'cordova.getActivity().registerReceiver(usbReceiver, filter);',
            new: [
                T + T + T + T + T + '// NOTE: the permission result is broadcast by the system',
                T + T + T + T + T + '// (UsbManagerService), so this receiver must be EXPORTED.',
                T + T + T + T + T + '// With RECEIVER_NOT_EXPORTED the result finds 0 receivers',
                T + T + T + T + T + '// on Android 14+ and Connect hangs with no dialog/error.',
                T + T + T + T + T + 'if (android.os.Build.VERSION.SDK_INT >= 33) {',
                T + T + T + T + T + T + 'cordova.getActivity().registerReceiver(usbReceiver, filter, Context.RECEIVER_EXPORTED);',
                T + T + T + T + T + '} else {',
                T + T + T + T + T + T + 'cordova.getActivity().registerReceiver(usbReceiver, filter);',
                T + T + T + T + T + '}'
            ].join('\n')
        },
        {
            file: 'Serial.java',
            marker: 'openSerial called with no device',
            old: T + T + T + 'public void run() {\n' + T + T + T + T + 'UsbDeviceConnection connection = manager.openDevice(driver.getDevice());',
            new: [
                T + T + T + 'public void run() {',
                T + T + T + T + 'if (manager == null || driver == null || driver.getDevice() == null) {',
                T + T + T + T + T + 'Log.d(TAG, "openSerial called with no device (permission was not granted yet)");',
                T + T + T + T + T + 'callbackContext.error("No USB device selected. Grant permission first, then try again.");',
                T + T + T + T + T + 'return;',
                T + T + T + T + '}',
                T + T + T + T + 'UsbDeviceConnection connection;',
                T + T + T + T + 'try {',
                T + T + T + T + T + 'connection = manager.openDevice(driver.getDevice());',
                T + T + T + T + '} catch (SecurityException se) {',
                T + T + T + T + T + 'Log.d(TAG, "USB permission not granted: " + se.getMessage());',
                T + T + T + T + T + 'callbackContext.error("USB permission not granted: " + se.getMessage());',
                T + T + T + T + T + 'return;',
                T + T + T + T + '}'
            ].join('\n')
        },
        {
            file: 'Serial.java',
            marker: 'No UsbManager to resume',
            old: T + T + T + 'else {\n' + T + T + T + T + 'UsbDeviceConnection connection = manager.openDevice(driver.getDevice());',
            new: [
                T + T + T + 'else if (manager == null) {',
                T + T + T + T + 'Log.d(TAG, "No UsbManager to resume with (permission was never requested).");',
                T + T + T + '}',
                T + T + T + 'else {',
                T + T + T + T + 'UsbDeviceConnection connection = null;',
                T + T + T + T + 'try {',
                T + T + T + T + T + 'connection = manager.openDevice(driver.getDevice());',
                T + T + T + T + '} catch (SecurityException se) {',
                T + T + T + T + T + 'Log.d(TAG, "USB permission not granted on resume: " + se.getMessage());',
                T + T + T + T + '}'
            ].join('\n')
        },
        {
            file: 'UsbBroadcastReceiver.java',
            marker: 'Already unregistered',
            old: 'activity.unregisterReceiver(this);',
            new: [
                T + T + T + 'try {',
                T + T + T + T + 'activity.unregisterReceiver(this);',
                T + T + T + '} catch (IllegalArgumentException ignored) {',
                T + T + T + T + '// Already unregistered (e.g. activity recreated) - safe to ignore',
                T + T + T + '}'
            ].join('\n')
        }
    ];

    let patched = 0;
    for (const dir of dirs) {
        for (const name of ['Serial.java', 'UsbBroadcastReceiver.java']) {
            const target = path.join(dir, name);
            if (!fs.existsSync(target)) continue;
            let s = fs.readFileSync(target, 'utf8');
            let changed = false;
            for (const p of patches) {
                if (p.file !== name) continue;
                if (s.includes(p.marker)) continue; // already patched
                if (!s.includes(p.old)) {
                    console.error(`[serial-fix] WARNING: pattern not found in ${target} (plugin updated upstream?) — manual review needed.`);
                    continue;
                }
                s = s.replace(p.old, p.new);
                changed = true;
            }
            if (changed) {
                fs.writeFileSync(target, s);
                patched++;
                console.log(`[serial-fix] patched ${target}`);
            }
        }
    }
    if (!patched) console.log('[serial-fix] USB serial driver already patched.');
};
