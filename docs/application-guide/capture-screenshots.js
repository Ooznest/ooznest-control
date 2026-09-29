/*
 * Captures the browser-available Ooznest Control tabs through a local Chrome
 * DevTools endpoint. Start Chrome with --remote-debugging-port=9229 first.
 * Electron-only and connected-controller dialogs deliberately need a real
 * desktop/controller capture and are not fabricated here.
 */
const fs = require('fs');
const path = require('path');
const WebSocket = globalThis.WebSocket;
if (!WebSocket) throw new Error('This capture script needs a Node.js runtime with WebSocket support.');

const endpoint = process.env.CAPTURE_ENDPOINT || 'http://127.0.0.1:9229/json/list';
const pageUrl = process.env.CAPTURE_URL || 'https://ooznest.github.io/ooznest-control/';
const output = path.join(__dirname, 'screenshots');
const captures = [
  ['viewer-view', '01-dashboard-3d-preview.png'],
  ['editor-view', '05-editor-gcode.png'],
  ['probe-view', '06-probe-tab.png'],
  ['macros-view', '07-macros-tab.png'],
  ['sd-view', '08-sd-card-tab.png'],
  ['tools-view', '09-tools-tab.png'],
  ['console-view', '10-console-tab.png'],
  ['settings-view', '11-settings-tab.png'],
  ['troubleshooting-view', '12-troubleshooting-tab.png'],
];

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  const targets = await (await fetch(endpoint)).json();
  const page = targets.find((target) => target.type === 'page' && target.url === pageUrl);
  if (!page) throw new Error(`Ooznest Control was not found at ${pageUrl} on the local Chrome DevTools endpoint.`);

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let id = 0;
  socket.addEventListener('message', (event) => {
    const response = JSON.parse(event.data);
    if (response.method === 'Runtime.exceptionThrown') console.error(`Browser exception: ${JSON.stringify(response.params.exceptionDetails)}`);
    const complete = pending.get(response.id);
    if (complete) {
      pending.delete(response.id);
      complete(response);
    }
  });
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  const send = (method, params = {}) => new Promise((resolve) => {
    const requestId = ++id;
    pending.set(requestId, resolve);
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.reload');
  await pause(4000);

  // Screenshot-only examples. They live solely in the temporary headless
  // Chrome profile and have prominent DEMO labels so they cannot be mistaken
  // for a machine-specific macro library.
  const demoMacros = [
    { name: 'DEMO — Jig Loading Position', icon: 'package', color: 'Orange', gcode: '; Demo only — review coordinates before use\nG21\nG90\nG0 Z25\nG0 X50 Y50' },
    { name: 'DEMO — Jig Clamp Check', icon: 'crosshair', color: 'Teal', gcode: '; Demo only — review coordinates before use\nG21\nG90\nG0 Z25\nG0 X450 Y50' },
    { name: 'DEMO — Jig Centre Inspection', icon: 'ruler', color: 'Blue', gcode: '; Demo only — review coordinates before use\nG21\nG90\nG0 Z25\nG0 X250 Y250' },
  ];
  await send('Runtime.evaluate', { expression: `localStorage.setItem('cnc_macros', ${JSON.stringify(JSON.stringify(demoMacros))})` });
  await send('Page.reload');
  await pause(1500);

  // Documentation-only SD card data, passed through SDCardHandler's normal
  // serial-line parser. It exists only in this temporary browser profile.
  const demoSdListing = [
    '[DIR:/Jobs]', '[DIR:/Jigs]', '[DIR:/Macros]', '[DIR:/Archive]',
    '[FILE:/Read_Me_First.txt|SIZE:1840]', '[FILE:/Setup_Checklist.ngc|SIZE:4296]', '[FILE:/P1.macro|SIZE:312]',
    '[FILE:/Jobs/DEMO_Pocket_Logo.ngc|SIZE:18472]', '[FILE:/Jobs/DEMO_Profile_Cutout.nc|SIZE:24391]',
    '[FILE:/Jigs/DEMO_Jig_Location_Check.ngc|SIZE:1206]', '[FILE:/Macros/P10_Spindle_Warmup.macro|SIZE:486]',
    '[FILE:/Archive/Previous_Revision.ngc|SIZE:16003]',
  ];
  const seedSdExpression = `window.ws.isConnected = true; window.sdMounted = true; window.sdHandler.path = '/'; window.sdHandler._prepareListing(); ${demoSdListing.map((line) => `window.sdHandler.processLine(${JSON.stringify(line)});`).join(' ')} document.querySelectorAll('#sd-new-folder, #sd-refresh, #sd-format').forEach((button) => { button.disabled = false; }); window.sdHandler._renderBreadcrumb(); if (window.lucide) window.lucide.createIcons();`;
  await send('Runtime.evaluate', { expression: seedSdExpression });

  for (const [tabId, filename] of captures) {
    await send('Runtime.evaluate', { expression: `document.querySelector('button[data-tab="${tabId}"]').click()` });
    await pause(900);
    const response = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(output, filename), Buffer.from(response.result.data, 'base64'));
    console.log(`Captured ${filename}`);
  }

  async function captureExpression(expression, filename) {
    await send('Runtime.evaluate', { expression });
    await pause(900);
    const response = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(output, filename), Buffer.from(response.result.data, 'base64'));
    console.log(`Captured ${filename}`);
  }

  async function captureClip(expression, filename, clip) {
    await send('Runtime.evaluate', { expression });
    await pause(900);
    const response = await send('Page.captureScreenshot', { format: 'png', clip });
    fs.writeFileSync(path.join(output, filename), Buffer.from(response.result.data, 'base64'));
    console.log(`Captured ${filename}`);
  }

  async function captureElement(selector, filename) {
    const expression = `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'center' }); const r = el.getBoundingClientRect(); return { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 12), width: Math.min(window.innerWidth, r.width + 24), height: Math.min(window.innerHeight, r.height + 24), dpr: window.devicePixelRatio }; })()`;
    const result = await send('Runtime.evaluate', { expression, returnByValue: true });
    const clip = result.result?.result?.value;
    if (!clip || clip.width < 2 || clip.height < 2) { console.warn(`Skipped ${filename}: ${selector} not visible`); return; }
    await pause(450);
    const response = await send('Page.captureScreenshot', { format: 'png', clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: 1 } });
    fs.writeFileSync(path.join(output, filename), Buffer.from(response.result.data, 'base64'));
    console.log(`Captured ${filename}`);
  }

  await captureExpression("document.querySelector('button[data-tab=\\\"viewer-view\\\"]').click(); document.querySelector('#grid-toggle-btn').click()", '04-3d-preview-camera-controls.png');
  await captureClip("document.querySelector('button[data-tab=\\\"viewer-view\\\"]').click()", '03-machine-controls-jogging.png', { x: 0, y: 0, width: 380, height: 1080, scale: 1 });
  await captureExpression("document.querySelector('button[data-tab=\\\"macros-view\\\"]').click(); document.querySelector('#macro-grid .edit-btn').click()", '07-macro-edit-modal.png');
  const closeUps = [
    ['#btn-connect', '16-connect-button.png'], ['#machine-state', '17-machine-state.png'], ['#unitToggle', '18-units-toggle.png'], ['#wcs-select', '19-wcs-selector.png'], ['#home-all-btn', '20-home-all.png'], ['#jog-panel', '21-jog-panel.png'], ['#feedRate', '22-jog-feedrate.png'], ['#stepSize', '23-jog-step-size.png'],
    ['#viewer-file-name', '24-preview-file-name.png'], ['#run-job-btn', '25-run-job.png'], ['#cam-toggle-btn', '26-perspective-toggle.png'], ['#grid-toggle-btn', '27-grid-toggle.png'], ['#endmill-setup-btn', '28-endmill-button.png'], ['#gcode-stats-panel', '29-job-statistics.png'],
    ['#editor-file-name', '30-editor-file-name.png'], ['#gcode-editor', '31-editor-surface.png'], ['#editor-upload-sd-btn', '32-editor-sd-upload.png'],
  ];
  await send('Runtime.evaluate', { expression: "document.querySelector('button[data-tab=\\\"viewer-view\\\"]').click()" });
  for (const [selector, filename] of closeUps.slice(0, 14)) await captureElement(selector, filename);
  await send('Runtime.evaluate', { expression: "document.querySelector('button[data-tab=\\\"editor-view\\\"]').click()" });
  for (const [selector, filename] of closeUps.slice(14)) await captureElement(selector, filename);
  await send('Runtime.evaluate', { expression: "document.querySelector('button[data-tab=\\\"probe-view\\\"]').click()" });
  for (const [selector, filename] of [['#probe-config-banner', '33-probe-warning.png'], ['#probe-safety-bar', '34-probe-safety.png'], ['#probe-test-btn', '35-probe-test.png'], ['#prb-feed', '36-probe-feed.png'], ['#prb-dist', '37-probe-distance.png'], ['#tab-probe-config', '38-probe-configuration-tab.png']]) await captureElement(selector, filename);
  await send('Runtime.evaluate', { expression: "document.querySelector('button[data-tab=\\\"macros-view\\\"]').click(); document.querySelector('#macro-grid .edit-btn').click()" });
  for (const [selector, filename] of [['#macro-name-input', '39-macro-name.png'], ['#macro-color-select', '40-macro-color.png'], ['#macro-icon-grid', '41-macro-icons.png'], ['#macro-gcode-input', '42-macro-gcode.png'], ['#btn-save-macro', '43-macro-save.png']]) await captureElement(selector, filename);
  await send('Runtime.evaluate', { expression: "document.querySelector('#btn-close-macro').click(); document.querySelector('button[data-tab=\\\"sd-view\\\"]').click()" });
  for (const [selector, filename] of [['#sd-tools', '44-sd-actions.png'], ['#sd-breadcrumb', '45-sd-breadcrumb.png'], ['#sd-table', '46-sd-file-table.png'], ['#sd-format-btn', '47-sd-format.png']]) await captureElement(selector, filename);
  await send('Runtime.evaluate', { expression: "document.querySelector('button[data-tab=\\\"tools-view\\\"]').click()" });
  for (const [selector, filename] of [['#tool-table-body', '48-tool-table.png'], ['#tab-tool-surfacing', '49-surfacing-tab.png'], ['#surf-dim-fields', '50-surfacing-dimensions.png'], ['#surf-z-safe', '51-surfacing-safe-z.png'], ['#surf-generate-btn', '52-surfacing-generate.png'], ['#tab-tool-spoilboard', '53-spoilboard-tab.png'], ['#tab-tool-bowl', '54-bowl-tab.png']]) await captureElement(selector, filename);
  await send('Runtime.evaluate', { expression: "document.querySelector('button[data-tab=\\\"console-view\\\"]').click()" });
  for (const [selector, filename] of [['#console-toolbar', '55-console-toolbar.png'], ['#terminal-container', '56-console-terminal.png'], ['#console-input-area', '57-console-input.png']]) await captureElement(selector, filename);
  await send('Runtime.evaluate', { expression: "document.querySelector('button[data-tab=\\\"settings-view\\\"]').click()" });
  for (const [selector, filename] of [['#settings-toolbar', '58-settings-toolbar.png'], ['#grbl-settings-container', '59-settings-table.png'], ['#settings-firmware-button', '60-settings-firmware.png']]) await captureElement(selector, filename);
  await send('Runtime.evaluate', { expression: "document.querySelector('button[data-tab=\\\"troubleshooting-view\\\"]').click()" });
  for (const [selector, filename] of [['#troubleshooting-toolbar', '61-troubleshooting-toolbar.png'], ['#trouble-tab-signals', '62-troubleshooting-signals.png'], ['#pin-indicator-X', '63-troubleshooting-input.png'], ['#trouble-tab-power', '64-troubleshooting-power.png'], ['#trouble-tab-spindles', '65-troubleshooting-spindles.png'], ['#trouble-tab-info', '66-troubleshooting-info.png']]) await captureElement(selector, filename);
  await send('Runtime.evaluate', { expression: "window.calibration.hideModal(); document.querySelector('#endmill-modal-overlay')?.classList.add('hidden'); document.querySelector('button[data-tab=\\\"viewer-view\\\"]').click(); document.querySelector('#endmill-setup-btn').click()" });
  await captureElement('#endmill-modal-overlay', '67-endmill-setup-modal.png');
  await send('Runtime.evaluate', { expression: "document.querySelector('#endmill-modal-overlay')?.classList.add('hidden'); window.gamepadController?.showSettings()" });
  await captureElement('#gamepad-settings-overlay', '68-gamepad-settings-modal.png');
  await captureExpression("document.querySelector('button[data-tab=\\\"settings-view\\\"]').click(); window.calibration.showModal()", '13-calibration-dialog.png');
  await captureExpression("window.calibration.hideModal(); window.configWizard.showWizard()", '14-configuration-wizard.png');
  await captureExpression("window.configWizard.hideWizard(); window.firmwareFlasher.showModal()", '15-firmware-flasher.png');
  await captureExpression("window.firmwareFlasher.hideModal(); document.getElementById('connection-modal').classList.remove('hidden'); document.getElementById('config-webserial').classList.remove('hidden')", '02-electron-connection-dialog.png');
  socket.close();
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
