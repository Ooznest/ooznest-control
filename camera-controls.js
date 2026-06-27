// Camera Controls Module
// Handles camera mode switching and grid toggling for 3D viewer

class CameraControls {
    /**
     * Toggle between camera modes (Perspective -> Orthographic -> Spindle View -> Perspective)
     */
    toggleCamera() {
        if (!window.viewer) return;

        let nextMode = 'Perspective';
        const currentText = document.getElementById('cam-toggle-btn').innerText.trim();

        if (currentText === 'Perspective') nextMode = 'Orthographic';
        if (currentText === 'Orthographic') nextMode = 'Spindle View';
        if (currentText === 'Spindle View') nextMode = 'Perspective';

        let label = nextMode;
        let icon = 'eye';

        // Show/hide view cube based on mode
        var vcEl = window.viewer.viewCube && window.viewer.viewCube.renderer && window.viewer.viewCube.renderer.domElement;
        var vcParent = vcEl && vcEl.parentNode;

        if (nextMode === 'Perspective') {
            if (window.viewer.getCameraType() === 'Orthographic') window.viewer.toggleCamera();
            window.viewer.setCameraMode('orbit');
            window.viewer.resetCamera();
            if (vcParent) vcEl.style.display = '';
        }
        else if (nextMode === 'Orthographic') {
            if (window.viewer.getCameraType() === 'Perspective') window.viewer.toggleCamera();
            window.viewer.setCameraMode('orbit');
            label = 'Orthographic';
            icon = 'box';
            if (vcParent) vcEl.style.display = '';
        }
        else if (nextMode === 'Spindle View') {
            if (window.viewer.getCameraType() === 'Orthographic') window.viewer.toggleCamera();
            window.viewer.setCameraMode('spindle');
            label = 'Spindle View';
            icon = 'video';
            if (vcParent) vcEl.style.display = 'none';
        }

        document.getElementById('cam-toggle-btn').innerHTML = `<i data-lucide="${icon}" class="text-secondary"></i> ${label}`;
        if (window.lucide) lucide.createIcons();
    }

    /**
     * Toggle grid mode
     */
    toggleGridMode() {
        if (!window.viewer) return;
        const label = window.viewer.toggleGridMode();
        document.getElementById('grid-toggle-btn').innerHTML = `<i data-lucide="grid-3x3" class="text-secondary"></i> ${label}`;
        if (window.lucide) lucide.createIcons();
    }

    /**
     * Reset camera to default view
     */
    resetCamera() {
        if (!window.viewer) return;
        window.viewer.resetCamera();
    }

    /**
     * Set work zero at machine coordinates (context menu handler)
     * @param {number} mX - Machine X coordinate
     * @param {number} mY - Machine Y coordinate
     */
    setWorkZeroAt(mX, mY) {
        let activeP = 1; // Default to G54 (P1)

        // Try to parse active WCS from last status
        if (window.lastStatus) {
            const match = window.lastStatus.match(/WCS:G(\d+)/);
            if (match) {
                const val = parseInt(match[1]);
                if (val >= 54 && val <= 59) activeP = val - 53;
            }
        }

        // Command: G10 L2 P<active> X<mX> Y<mY>
        window.sendCmd(`G10 L2 P${activeP} X${mX} Y${mY}`);
        window.reporter.showToast(`Set Work Zero (G${53 + activeP}) to X${mX} Y${mY}`);
    }

    /**
     * Setup event listeners for viewer
     */
    setupEventListeners() {
        // G-code line progress
        window.addEventListener('gcode-line', (e) => {
            if (window.viewer) {
                window.viewer.updateProgress(e.detail.line);
            }
        });

        // SD mount state
        window.addEventListener('sd-mount-state', (e) => {
            const state = e.detail.state;
            const isMounted = (state === 1 || state === 3);
            window.sdMounted = isMounted;
            const sdLink = document.querySelector("button[onclick*='switchTab'][onclick*='sd-view']");

            if (isMounted) {
                if (sdLink) {
                    sdLink.classList.remove('opacity-50', 'pointer-events-none');
                }
            } else {
                if (sdLink && !window.sdJobActive) {
                    sdLink.classList.add('opacity-50', 'pointer-events-none');
                }
            }
        });
    }
}

// Export singleton instance
window.cameraControls = new CameraControls();

// Expose global functions for HTML onclick handlers
window.toggleCamera = () => window.cameraControls.toggleCamera();
window.toggleGridMode = () => window.cameraControls.toggleGridMode();
window.resetCamera = () => window.cameraControls.resetCamera();
window.setWorkZeroAt = (mX, mY) => window.cameraControls.setWorkZeroAt(mX, mY);
