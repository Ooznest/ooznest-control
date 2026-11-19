'use strict';

(() => {
  const endpoint = 'https://api.github.com/repos/Ooznest/ooznest-control/releases/latest';
  const status = document.getElementById('release-status');
  const retry = document.getElementById('retry');
  const platforms = {
    windows: { match: /\.exe$/i, label: 'Download for Windows' },
    mac: { match: /\.dmg$/i, label: 'Download for macOS' },
    linux: { match: /\.AppImage$/i, label: 'Download for Linux' },
    android: { match: /\.apk$/i, label: 'Download Android APK' },
    sd: { match: /SDCard\.zip$/i, label: 'Download SD card files' },
    ios: { match: /\.ipa$/i, label: 'Download iOS package' }
  };

  function architecture(name) {
    if (/arm64|aarch64/i.test(name)) return 'ARM64';
    if (/armv7l/i.test(name)) return 'ARMv7';
    if (/x64|x86_64|amd64/i.test(name)) return 'x64';
    if (/ia32|i[3-6]86/i.test(name)) return '32-bit';
    if (/universal/i.test(name)) return 'Universal';
    return '';
  }

  function isDownload(asset) {
    try {
      const url = new URL(asset.browser_download_url);
      return url.protocol === 'https:' && url.hostname === 'github.com' &&
        url.pathname.startsWith('/Ooznest/ooznest-control/releases/download/');
    } catch { return false; }
  }

  async function loadDownloads() {
    retry.hidden = true;
    status.textContent = 'Checking the latest release…';
    document.querySelectorAll('[data-platform] .links').forEach(el => { el.textContent = 'Loading downloads…'; });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(endpoint, { signal: controller.signal, headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) throw new Error('Release lookup failed');
      const release = await response.json();
      if (!Array.isArray(release.assets) || release.draft || release.prerelease) throw new Error('Invalid release');
      status.textContent = `Latest release · ${release.tag_name}`;
      for (const [platform, config] of Object.entries(platforms)) {
        const container = document.querySelector(`[data-platform="${platform}"] .links`);
        const assets = release.assets.filter(asset => config.match.test(asset.name) && isDownload(asset));
        container.replaceChildren();
        if (!assets.length) {
          container.textContent = 'Not available in this release';
          continue;
        }
        for (const asset of assets) {
          const link = document.createElement('a');
          link.className = 'download-button';
          link.href = asset.browser_download_url;
          const arch = architecture(asset.name);
          link.textContent = config.label + (arch ? ` (${arch})` : '');
          link.title = `${asset.name} · ${(asset.size / 1048576).toFixed(1)} MB`;
          container.append(link);
        }
      }
    } catch {
      status.textContent = 'Unable to load downloads. Please check your connection and try again.';
      document.querySelectorAll('[data-platform] .links').forEach(el => { el.textContent = 'Downloads temporarily unavailable'; });
      retry.hidden = false;
    } finally { clearTimeout(timeout); }
  }

  const ua = navigator.userAgent;
  const platform = /Android|iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    ? null : /Windows/i.test(ua) ? 'windows' : /Macintosh|Mac OS X/i.test(ua) ? 'mac' : /Linux/i.test(ua) ? 'linux' : null;
  if (platform) {
    const card = document.querySelector(`[data-platform="${platform}"]`);
    card.classList.add('recommended');
    const note = document.createElement('span');
    note.className = 'recommendation';
    note.textContent = 'Recommended for this device';
    card.append(note);
  }
  retry.addEventListener('click', loadDownloads);
  loadDownloads();
})();
