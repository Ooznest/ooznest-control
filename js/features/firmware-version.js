export function parseGrblBuild(version) {
    const match = String(version || '').match(/(?:^|[^0-9])(\d{8})(?:[^0-9]|$)/);
    return match ? Number(match[1]) : null;
}

export class FirmwareVersionChecker {
    constructor() {
        this.availableBuild = null;
        this.controllerBuild = null;
        this._manifestPromise = this._loadManifest();
    }

    async _loadManifest() {
        try {
            const response = await fetch('./firmware/version.json', { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const manifest = await response.json();
            const build = Number(manifest?.grbl_build);
            this.availableBuild = Number.isInteger(build) && build > 0 ? build : null;
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

        return {
            availableBuild: this.availableBuild,
            controllerBuild: this.controllerBuild,
            updateAvailable
        };
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
