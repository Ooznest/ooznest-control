const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const base = 'https://github.com/Ooznest/ooznest-control/releases/download/v1/';
const source = name => fs.readFileSync(path.join(__dirname, '../download/', name), 'utf8');
const asset = name => ({ name, size: 1024, browser_download_url: base + name });
function element() {
  return { hidden: false, textContent: '', children: [], listeners: {}, classList: { add() {} }, addEventListener(event, fn) { this.listeners[event] = fn; }, replaceChildren() { this.children = []; }, append(child) { this.children.push(child); } };
}
async function landing(response) {
  const status = element(), retry = element();
  const containers = Object.fromEntries(['windows', 'mac', 'linux', 'android', 'sd', 'ios'].map(p => [p, element()]));
  const context = {
    document: { getElementById: id => id === 'retry' ? retry : status,
      querySelectorAll: selector => selector === '.mobile-menu a' ? [] : Object.values(containers),
      querySelector: selector => containers[selector.match(/data-platform="(.*?)"/)[1]], createElement: element },
    navigator: { userAgent: 'Test', platform: 'Test' }, URL, AbortController, setTimeout, clearTimeout,
    fetch: async () => typeof response === 'function' ? response() : ({ ok: true, json: async () => response })
  };
  vm.runInNewContext(source('download.js'), context);
  await new Promise(resolve => setImmediate(resolve));
  return { status, retry, containers, context };
}
test('landing resolves current assets with familiar Mac labels and AppImage only', async () => {
  const { containers, status } = await landing({ tag_name: 'v1', assets: ['app.exe', 'app-arm64.dmg', 'app-x64.dmg', 'app-x64.AppImage', 'app.deb'].map(asset) });
  assert.match(status.textContent, /v1/);
  assert.deepEqual(containers.mac.children.map(x => x.textContent), ['Download for Apple Silicon', 'Download for Intel Mac']);
  assert.equal(containers.linux.children.length, 1);
  assert.equal(containers.windows.children[0].href, base + 'app.exe');
});
test('missing and untrusted packages cannot produce download links', async () => {
  const { containers } = await landing({ assets: [{ ...asset('app.exe'), browser_download_url: 'https://example.com/app.exe' }] });
  assert.match(containers.windows.textContent, /Not available/);
  assert.equal(containers.windows.children.length, 0);
});
test('failed release lookup can recover through retry', async () => {
  const result = await landing(() => { throw new Error('offline'); });
  assert.equal(result.retry.hidden, false);
  assert.match(result.status.textContent, /Unable/);
  result.context.fetch = async () => ({ ok: true, json: async () => ({ tag_name: 'v2', assets: [asset('app.exe')] }) });
  await result.retry.listeners.click();
  assert.equal(result.retry.hidden, true);
  assert.match(result.status.textContent, /v2/);
  assert.equal(result.containers.windows.children.length, 1);
});
test('invalid release metadata enters error state', async () => {
  for (const response of [{ assets: [], draft: true }, { assets: [], prerelease: true }, {}]) {
    assert.equal((await landing(response)).retry.hidden, false);
  }
});
test('all direct routes resolve the intended package and retain a manual fallback', async () => {
  const names = ['app.exe', 'app-arm64.dmg', 'app-x64.dmg', 'app-x64.AppImage'];
  for (const [route, expected] of Object.entries({ windows: names[0], macarm: names[1], macx64: names[2], linux: names[3] })) {
    const html = fs.readFileSync(path.join(__dirname, '../download', route, 'index.html'), 'utf8');
    const dataset = { platform: html.match(/data-platform="(.*?)"/)[1], arch: html.match(/data-arch="(.*?)"/)?.[1] };
    const elements = { status: element(), installer: element(), retry: element() };
    let destination;
    await vm.runInNewContext(source('direct.js'), { document: { body: { dataset }, getElementById: id => elements[id] }, location: { search: '', replace: url => { destination = url; } }, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, fetch: async () => ({ ok: true, json: async () => ({ assets: names.map(asset) }) }) });
    assert.equal(destination, base + expected, route);
    assert.equal(elements.installer.href, destination);
    assert.equal(elements.installer.hidden, false);
  }
});
test('direct missing-package and network-error states offer a working retry', async () => {
  for (const offline of [false, true]) {
    const elements = { status: element(), installer: { ...element(), hidden: true }, retry: { ...element(), hidden: true } };
    let reloaded = false;
    await vm.runInNewContext(source('direct.js'), { document: { body: { dataset: { platform: 'windows' } }, getElementById: id => elements[id] }, location: { search: '', reload: () => { reloaded = true; } }, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, fetch: async () => { if (offline) throw Error('offline'); return { ok: true, json: async () => ({ assets: [] }) }; } });
    assert.equal(elements.installer.hidden, true);
    assert.equal(elements.retry.hidden, false);
    elements.retry.listeners.click();
    assert.equal(reloaded, true);
  }
});

test('landing images are bundled within the download directory', () => {
  const html = fs.readFileSync(path.join(__dirname, '../download/index.html'), 'utf8');
  for (const [, src] of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) {
    assert.ok(!src.includes('/'), src);
    assert.ok(fs.statSync(path.join(__dirname, '../download', src)).size > 0, src);
  }
});
