'use strict';

(async () => {
  const status = document.getElementById('status');
  const link = document.getElementById('installer');
  const retry = document.getElementById('retry');
  const platform = document.body.dataset.platform;
  const extensions = { windows: /\.exe$/i, mac: /\.dmg$/i, linux: /\.AppImage$/i };
  const architecture = document.body.dataset.arch || new URLSearchParams(location.search).get('arch');
  const architectures = { x64: /x64|x86_64|amd64/i, arm64: /arm64|aarch64/i };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch('https://api.github.com/repos/Ooznest/ooznest-control/releases/latest', {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' }
    });
    if (!response.ok) throw new Error('Release lookup failed');
    const release = await response.json();
    if (!Array.isArray(release.assets) || release.draft || release.prerelease) throw new Error('Invalid release');
    const assets = release.assets.filter(asset => {
      if (!extensions[platform]?.test(asset.name)) return false;
      try {
        const url = new URL(asset.browser_download_url);
        return url.protocol === 'https:' && url.hostname === 'github.com' &&
          url.pathname.startsWith('/Ooznest/ooznest-control/releases/download/');
      } catch { return false; }
    });
    if (architecture && !architectures[architecture]) throw new Error('Unknown architecture');
    const installer = architecture
      ? assets.find(asset => architectures[architecture].test(asset.name))
      : assets.find(asset => /universal/i.test(asset.name)) ||
        assets.find(asset => /x64|x86_64|amd64/i.test(asset.name)) ||
        (assets.length === 1 ? assets[0] : null);
    if (!installer) {
      status.textContent = 'A matching installer is not available in the latest release.';
      return;
    }
    link.href = installer.browser_download_url;
    link.textContent = 'Download ' + installer.name;
    link.hidden = false;
    status.textContent = 'Your download is starting. If it does not start, use the link below.';
    location.replace(installer.browser_download_url);
  } catch {
    status.textContent = 'Could not start the download. Please check your connection and try again.';
    retry.hidden = false;
  } finally {
    clearTimeout(timeout);
  }
  retry.addEventListener('click', () => location.reload());
})();
