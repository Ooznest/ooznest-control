import { registerModal } from '../ui/modal.js';

// Set this to the public project token from the Ooznest PostHog EU project.
const projectToken = 'phc_CrMGPrEUx5fGfBEGsYUGUAMhqeK53peawNxrwYSTByHd';
const configured = projectToken.startsWith('phc_');
const noticeVersion = 8;
const consentKey = 'ooznest.analytics-consent';
const modal = registerModal('analytics-consent');
const allow = document.getElementById('analytics-allow');
const decline = document.getElementById('analytics-decline');
const status = document.getElementById('analytics-status');
const pendingRequests = new Set();
let reportedOpen = false;
let sessionId;
const runtime = window.electron?.isElectron ? 'electron' : window.cordova ? 'cordova' : 'web';

function readConsent() {
    try {
        const choice = JSON.parse(localStorage.getItem(consentKey));
        if (choice?.version === noticeVersion && typeof choice.allowed === 'boolean' &&
            (!choice.allowed || typeof choice.installationId === 'string')) return choice;
    } catch {
        // If storage is unavailable, analytics stays off.
    }
    return null;
}

function reportOpen() {
    if (reportedOpen || !capture('app opened')) return;
    reportedOpen = true;
    if (runtime === 'web' && ['https:', 'http:'].includes(location.protocol)) {
        capture('$pageview', { $current_url: location.origin + location.pathname, $pathname: location.pathname });
    }
}

function capture(event, properties = {}) {
    const choice = readConsent();
    if (!configured || choice?.allowed !== true) return false;
    sessionId ??= crypto.randomUUID();
    const agent = navigator.userAgent;
    const os = /Android/i.test(agent) ? 'Android' : /iPhone|iPad|iPod/i.test(agent) ? 'iOS'
        : /Windows/i.test(agent) ? 'Windows' : /Macintosh/i.test(agent) ? 'macOS'
        : /Linux/i.test(agent) ? 'Linux' : 'Other';
    const request = new AbortController();
    pendingRequests.add(request);
    void fetch('https://eu.i.posthog.com/i/v0/e', {
        method: 'POST',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: request.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            api_key: projectToken,
            event,
            properties: {
                ...properties,
                app_edition: 'grblhal',
                app_version: document.title.match(/\bv?(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/)?.[1],
                runtime,
                os,
                distinct_id: choice.installationId,
                $session_id: sessionId,
                $os: os,
                $process_person_profile: event === 'app opened' || event === '$pageview',
                $geoip_disable: event !== 'app opened' && event !== '$pageview'
            }
        })
    }).catch(() => {}).finally(() => {
        pendingRequests.delete(request);
    });
    return true;
}

window.appAnalytics = capture;
let lastFirmwareReport;
window.reportAnalyticsFirmware = (family, version, buildSource) => {
    const firmwareVersion = typeof version === 'string' &&
        /^(?:\d{8}|\d+(?:\.\d+){1,3}[a-z]?(?:[-+]\d{8}|-?(?:beta|rc)\d+)?)$/i.test(version)
        ? version : 'unknown';
    const properties = { controller_family: family, firmware_version: firmwareVersion, build_source: buildSource };
    const key = JSON.stringify(properties);
    if (lastFirmwareReport !== key && capture('controller firmware detected', properties)) lastFirmwareReport = key;
};

document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-analytics-tool]');
    if (!button || button.disabled) return;
    capture('tool action selected', { tool: button.dataset.analyticsTool });
});

function showConsent() {
    const enabled = configured && readConsent()?.allowed === true;
    status.textContent = configured
        ? `Analytics is ${enabled ? 'on' : 'off'}.`
        : 'Analytics is currently unavailable.';
    decline.textContent = enabled ? 'Turn off analytics' : 'Decline analytics';
    allow.disabled = !configured || enabled;
    modal.show();
}

function saveConsent(allowed) {
    if (allowed && allow.disabled) return;
    if (!allowed) {
        sessionId = undefined;
        reportedOpen = false;
        for (const request of pendingRequests) request.abort();
    }
    try {
        if (!allowed) localStorage.removeItem(consentKey);
        localStorage.setItem(consentKey, JSON.stringify({
            allowed,
            installationId: allowed ? crypto.randomUUID() : undefined,
            version: noticeVersion,
            recordedAt: new Date().toISOString()
        }));
    } catch {
        status.textContent = 'Could not save your choice. Analytics is off for this session.';
        reportedOpen = true;
        return;
    }
    modal.hide();
    if (allowed) reportOpen();
}

modal.root.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const controls = [document.getElementById('analytics-details-toggle'), decline, allow]
        .filter(control => !control.disabled);
    const current = controls.indexOf(document.activeElement);
    const step = event.shiftKey ? -1 : 1;
    controls[(current + step + controls.length) % controls.length].focus();
});
document.getElementById('analytics-settings-button').addEventListener('click', showConsent);
decline.addEventListener('click', () => saveConsent(false));
allow.addEventListener('click', () => saveConsent(true));
window.addEventListener('storage', (event) => {
    if ((event.key === consentKey || event.key === null) && readConsent()?.allowed !== true) {
        for (const request of pendingRequests) request.abort();
    }
});

if (configured && !readConsent()) showConsent();
reportOpen();
