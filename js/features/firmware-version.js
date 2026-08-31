import { registerModal } from '../ui/modal.js';

export function parseGrblBuild(version) {
    const match = String(version || '').match(/(?:^|[^0-9])(\d{8})(?:[^0-9]|$)/);
    return match ? Number(match[1]) : null;
}

export class FirmwareVersionChecker {
    constructor() {
        this.availableBuild = null;
        this.controllerBuild = null;
        this.changelog = [];
        this.promptedUpdateKey = null;
        this.updateModal = registerModal('firmware-update-available-overlay', { closeOnBackdrop: true, closeOnEscape: true });
        this._manifestPromise = this._loadManifest();
    }

    async _loadManifest() {
        try {
            const response = await fetch('./firmware/version.json', { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const manifest = await response.json();
            const build = Number(manifest?.grbl_build);
            this.availableBuild = Number.isInteger(build) && build > 0 ? build : null;
            this.changelog = Array.isArray(manifest?.changelog)
                ? manifest.changelog
                    .map((release) => ({
                        grblBuild: Number(release?.grbl_build),
                        date: typeof release?.date === 'string' ? release.date : null,
                        changes: Array.isArray(release?.changes)
                            ? release.changes.filter((change) => typeof change === 'string' && change.trim())
                            : []
                    }))
                    .filter((release) => Number.isInteger(release.grblBuild) && release.grblBuild > 0)
                    .sort((a, b) => b.grblBuild - a.grblBuild)
                : [];
        } catch (error) {
            console.warn('[FirmwareVersion] Unable to load bundled firmware version:', error);
        }
        this._notify();
    }

    setControllerVersion(version) {
        this.controllerBuild = parseGrblBuild(version);
        this._notify();
    }

    getStatus() {
        const updateAvailable = this.controllerBuild !== null
            && this.availableBuild !== null
            && this.controllerBuild < this.availableBuild;
        const releaseNotes = updateAvailable
            ? this.changelog.filter((release) => release.grblBuild > this.controllerBuild)
            : [];

        return {
            availableBuild: this.availableBuild,
            controllerBuild: this.controllerBuild,
            updateAvailable,
            releaseNotes
        };
    }

    async promptForConfiguredController() {
        await this._manifestPromise;
        const status = this.getStatus();
        if (!status.updateAvailable || !this.updateModal) return;

        const promptKey = `${status.controllerBuild}:${status.availableBuild}`;
        if (this.promptedUpdateKey === promptKey) return;

        const body = document.getElementById('firmware-update-available-body');
        const updateButton = document.getElementById('firmware-update-available-start');
        if (!body || !updateButton) return;

        let html = '<p class="text-sm text-grey">A newer firmware version is available for your controller.</p>';
        html += '<div class="mt-4 rounded-xl border border-grey-light bg-grey-bg/40 px-4 py-3 space-y-1">';
        html += `<div class="flex items-center justify-between gap-4 text-xs"><span class="text-grey">Controller firmware version</span><strong class="text-secondary-dark">${this._escapeHtml(status.controllerBuild)}</strong></div>`;
        html += `<div class="flex items-center justify-between gap-4 text-xs"><span class="text-grey">Available firmware version</span><strong class="text-primary">${this._escapeHtml(status.availableBuild)}</strong></div>`;
        html += '</div>';

        if (status.releaseNotes.length) {
            html += '<div class="mt-4 max-h-52 overflow-y-auto pr-1">';
            html += '<div class="ooznest-instruction-card__info" style="margin-top:0">';
            html += '<p class="ooznest-instruction-card__title mb-0">Newer firmware available</p>';
            status.releaseNotes.forEach((release) => {
                const releaseLabel = [release.date, `Firmware version ${release.grblBuild}`].filter(Boolean).join(' · ');
                if (releaseLabel) html += `<p class="mt-2 text-xs font-bold" style="color:#718087">${this._escapeHtml(releaseLabel)}</p>`;
                if (release.changes?.length) {
                    html += '<ul class="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-relaxed" style="color:#718087">';
                    release.changes.forEach((change) => {
                        html += `<li>${this._escapeHtml(change)}</li>`;
                    });
                    html += '</ul>';
                }
            });
            html += '</div></div>';
        }

        body.innerHTML = html;
        updateButton.onclick = () => {
            this.updateModal.hide();
            window.firmwareFlasher?.showModal();
        };
        this.promptedUpdateKey = promptKey;
        this.updateModal.show();
        if (window.lucide) window.lucide.createIcons();
    }

    _escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = String(value ?? '');
        return div.innerHTML;
    }

    _notify() {
        const status = this.getStatus();
        const badge = document.getElementById('settings-firmware-update-badge');
        if (badge) badge.classList.toggle('hidden', !status.updateAvailable);

        window.dispatchEvent(new CustomEvent('firmware-version-status', { detail: status }));
        window.troubleshootingInfo?.render?.().catch(error => {
            console.warn('[FirmwareVersion] Unable to refresh troubleshooting information:', error);
        });
    }
}
