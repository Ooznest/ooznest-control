// Job Control Module
// Handles G-code streaming, job progress, pause/resume/stop

class JobController {
    constructor() {
        this.gcodeStreamer = {
            lines: [],
            index: 0,
            active: false,
            paused: false,
            waitingMTC: false
        };
        this.jobStartTime = 0;
        this.sdJobActive = false;

        this.setupEventListeners();
    }

    _getFlow() {
        const ws = window.ws;
        if (!ws) return null;
        return ws.type === 'webserial' ? ws.webSerial : ws.flowControl;
    }

    _updateBufferUI() {
        const flow = this._getFlow();
        if (!flow || !flow.sentBuffer) return;
        const bufSize = flow.rxBufSize || 128;
        const used = flow.sentBuffer.reduce((s, l) => s + l.length, 0);
        const max = bufSize - 1;
        const pct = max > 0 ? (Math.min(used, max) / max) * 100 : 0;

        const bar = document.getElementById('job-buffer-bar');
        const stats = document.getElementById('job-buffer-stats');
        if (bar) bar.style.width = `${pct}%`;
        if (stats) stats.textContent = used;
    }

    setupEventListeners() {
        // Listen for alarm being cleared (state transition Alarm → Idle)
        window.addEventListener('machine-alarm-cleared', () => {
            if (this.gcodeStreamer.active) {
                this.abortGCodeStream("Alarm cleared");
            } else {
                this.resetJobUI();
            }
        });
        // SD Job Progress Listeners
        window.addEventListener('sd-status', (e) => {
            const { pct, filename } = e.detail;

            // If SD job just started (or we just noticed it)
            if (!this.sdJobActive && !this.gcodeStreamer.active) {
                this.sdJobActive = true;
                this.startJobUI();
                window.term.writeln("\x1b[35m[SD Job] Detected active SD print.\x1b[0m");
            }

            if (this.sdJobActive) {
                this.updateJobProgressUI(pct, filename ? `File: ${filename}` : 'Standard Job');
            }
        });

        window.addEventListener('sd-job-complete', () => {
            if (this.sdJobActive) {
                window.term.writeln("\x1b[32m[SD Job] Complete/Idle.\x1b[0m");
                this.resetJobUI();
                // Also ensure we are not in Hold
                const pauseBtn = document.getElementById('pause-job-btn');
                if (pauseBtn && pauseBtn.innerText.includes('Resume')) {
                    // Reset pause button visual state if it was paused
                    pauseBtn.innerHTML = '<i class="bi bi-pause-fill text-lg"></i> Pause';
                    pauseBtn.className = "overlay-btn !bg-yellow-100 !text-yellow-800 border-yellow-300 shadow-lg";
                }
            }
        });
    }

    /**
     * Run the current job loaded in the viewer
     */
    runCurrentJob() {
        if (!window.currentGCodeContent || this.gcodeStreamer.active) {
            window.reporter.showAlert('No G-Code', 'No G-Code loaded in the viewer to run!');
            return;
        }
        window.reporter.showConfirm('Run Job', 'Are you sure you want to run the job currently loaded in the 3D viewer?', () => {
            this.gcodeStreamer.lines = window.currentGCodeContent.split('\n').filter(line => line.trim().length > 0);
            this.gcodeStreamer.index = 0;
            this.gcodeStreamer.active = true;
            this.gcodeStreamer.paused = false;

            document.getElementById('run-job-btn').classList.add('hidden');
            const jac = document.getElementById('job-active-controls');
            if (jac) { jac.classList.remove('hidden'); jac.classList.add('flex'); }

            // Show job progress overlay
            document.getElementById('job-progress-overlay').classList.remove('hidden');
            this.jobStartTime = Date.now();

            window.term.writeln("\x1b[35m[Job Stream] Starting...\x1b[0m");

            if (window.ws.backendWs) {
                window.ws.backendWs.send(JSON.stringify({
                    type: 'updateJob',
                    active: true,
                    currentLine: 0,
                    totalLines: this.gcodeStreamer.lines.length,
                    pct: 0
                }));
            }

            this.advanceGCodeStream();
        });
    }

    /**
     * Pause or resume the current job
     */
    pauseJob() {
        if (!this.gcodeStreamer.active) return;
        const btn = document.getElementById('pause-job-btn');
        if (!btn) return;
        this.gcodeStreamer.paused = !this.gcodeStreamer.paused;

        if (this.gcodeStreamer.paused) {
            window.ws.sendRealtime('!');
            btn.innerHTML = '<i class="bi bi-play-fill text-lg"></i> Resume';
            btn.classList.replace('!bg-yellow-100', '!bg-green-100');
            btn.classList.replace('!text-yellow-800', '!text-green-800');
            btn.classList.replace('border-yellow-300', 'border-green-300');
            window.term.writeln("\x1b[33m[Job Stream] Paused.\x1b[0m");
        } else {
            window.ws.sendRealtime('~');
            btn.innerHTML = '<i class="bi bi-pause-fill text-lg"></i> Pause';
            btn.classList.replace('!bg-green-100', '!bg-yellow-100');
            btn.classList.replace('!text-green-800', '!text-yellow-800');
            btn.classList.replace('border-green-300', 'border-yellow-300');
            window.term.writeln("\x1b[32m[Job Stream] Resuming...\x1b[0m");
        }
    }

    /**
     * Stop the current job
     */
    stopJob() {
        if (!this.gcodeStreamer.active) return;
        window.reporter.showConfirm('Stop Job', 'Stop Job? This will reset the machine.', () => {
            window.ws.sendRealtime('\x18');
            this.abortGCodeStream("User Stopped");
        });
    }

    /**
     * Advance to the next line in the G-code stream
     */
    advanceGCodeStream() {
        if (!this.gcodeStreamer.active || this.gcodeStreamer.paused) return;

        const flow = this._getFlow();
        if (!flow) {
            console.warn("advanceGCodeStream: flow is undefined — sending without limit!");
        }
        let sentAny = false;

        while (this.gcodeStreamer.index < this.gcodeStreamer.lines.length) {
            const line = this.gcodeStreamer.lines[this.gcodeStreamer.index];
            const canSend = flow ? flow.canSend(line) : false;
            if (flow && !canSend) break;
            window.ws.sendCommand(line);
            this.gcodeStreamer.index++;
            sentAny = true;
        }

        if (sentAny) {
            this._updateBufferUI();
            const pct = Math.round((this.gcodeStreamer.index / this.gcodeStreamer.lines.length) * 100);
            const label = `Line ${this.gcodeStreamer.index} of ${this.gcodeStreamer.lines.length}`;
            this.updateJobProgressUI(pct, label);

            if (window.ws.backendWs) {
                window.ws.backendWs.send(JSON.stringify({
                    type: 'updateJob',
                    active: true,
                    currentLine: this.gcodeStreamer.index,
                    totalLines: this.gcodeStreamer.lines.length,
                    pct: pct
                }));
            }
        }
    }

    /**
     * Check if all sent lines have been acknowledged and finish if so
     */
    _checkStreamComplete() {
        if (this.gcodeStreamer.index < this.gcodeStreamer.lines.length) return;
        const flow = this._getFlow();
        if (!flow || flow.isDrained()) {
            this._updateBufferUI();
            this.finishGCodeStream();
        }
    }

    /**
     * Finish the G-code stream
     */
    finishGCodeStream() {
        this.gcodeStreamer.active = false;
        this.gcodeStreamer.waitingMTC = false;
        window.term.writeln("\x1b[32m[Job Stream] Complete.\x1b[0m");
        this.resetJobUI();

        if (window.ws.backendWs) {
            window.ws.backendWs.send(JSON.stringify({ type: 'updateJob', active: false }));
        }
    }

    /**
     * Abort the G-code stream with an error
     */
    abortGCodeStream(error) {
        this.gcodeStreamer.active = false;
        this.gcodeStreamer.waitingMTC = false;
        window.term.writeln(`\x1b[31m[Job Stream] Aborted: ${error}\x1b[0m`);
        this.resetJobUI();

        if (window.ws.backendWs) {
            window.ws.backendWs.send(JSON.stringify({ type: 'updateJob', active: false }));
        }
    }

    /**
     * Reset job UI to initial state
     */
    resetJobUI() {
        // Hide job progress overlay
        document.getElementById('job-progress-overlay').classList.add('hidden');
        document.getElementById('job-progress-bar').style.width = '0%';
        document.getElementById('job-progress-pct').textContent = '0%';
        document.getElementById('job-progress-line').textContent = 'Line 0 of 0';
        document.getElementById('job-progress-time').textContent = 'Elapsed: 0:00';

        // Reset buttons
        document.getElementById('run-job-btn').classList.remove('hidden');
        const jac2 = document.getElementById('job-active-controls');
        if (jac2) { jac2.classList.add('hidden'); jac2.classList.remove('flex'); }
        const btn = document.getElementById('pause-job-btn');
        if (btn) {
            btn.innerHTML = '<i class="bi bi-pause-fill text-lg"></i> Pause';
            btn.className = "overlay-btn !bg-yellow-100 !text-yellow-800 border-yellow-300 shadow-lg";
        }

        // Reset TX buffer
        const bufBar = document.getElementById('job-buffer-bar');
        const bufStats = document.getElementById('job-buffer-stats');
        if (bufBar) bufBar.style.width = '0%';
        if (bufStats) bufStats.textContent = '0';

        this.sdJobActive = false; // Reset SD flag
    }

    /**
     * Start job UI (show progress overlay)
     */
    startJobUI() {
        document.getElementById('run-job-btn').classList.add('hidden');
        const jac3 = document.getElementById('job-active-controls');
        if (jac3) { jac3.classList.remove('hidden'); jac3.classList.add('flex'); }
        document.getElementById('job-progress-overlay').classList.remove('hidden');
        this.jobStartTime = Date.now();
    }

    /**
     * Update job progress UI
     */
    updateJobProgressUI(pct, label) {
        document.getElementById('job-progress-bar').style.width = `${pct}%`;
        document.getElementById('job-progress-pct').textContent = `${pct}%`;
        document.getElementById('job-progress-line').textContent = label;

        // Update elapsed time
        const elapsed = Math.floor((Date.now() - this.jobStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        document.getElementById('job-progress-time').textContent = `Elapsed: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Check if a line should be handled by the job controller
     * @param {string} line - Line from serial
     * @returns {boolean} - True if handled
     */
    processLine(line) {
        if (!this.gcodeStreamer.active) return false;

        // Alarm during streaming → abort immediately, clear planner queue, then unlock
        if (line.toLowerCase().startsWith('alarm:')) {
            this._updateBufferUI();
            this.abortGCodeStream(line);
            if (window.ws) {
                window.ws.sendRealtime('\x18');
                setTimeout(() => {
                    window.ws.sendCommand('$X');
                }, 3000);
            }
            return true;
        }

        if (line === 'ok') {
            this._updateBufferUI();
            this.advanceGCodeStream();
            this._checkStreamComplete();
            return true;
        }

        if (line.toLowerCase().startsWith('error:')) {
            this._updateBufferUI();
            const isMtcError = line.includes('40') && window.toolsHandler?.mtcActive;
            if (isMtcError) {
                this.gcodeStreamer.waitingMTC = true;
                this.gcodeStreamer.paused = true;
                // Decrement index to re-send the errored command after MTC resolves
                this.gcodeStreamer.index = Math.max(0, this.gcodeStreamer.index - 1);
                window.term.writeln(`\x1b[33m[MTC] Tool change pending — streaming paused, waiting for MTC to complete.\x1b[0m`);
            } else {
                this.abortGCodeStream(line);
                if (window.ws) {
                    window.ws.sendRealtime('\x18');
                }
            }
            return true;
        }

        return false;
    }

    resumeMTCStream() {
        if (!this.gcodeStreamer.active || !this.gcodeStreamer.waitingMTC) return;
        this.gcodeStreamer.waitingMTC = false;
        this.gcodeStreamer.paused = false;
        window.term.writeln(`\x1b[32m[MTC] Resuming G-code stream.\x1b[0m`);
        this.advanceGCodeStream();
    }
}

// Export singleton instance
window.jobController = new JobController();

// Expose global functions for HTML onclick handlers
window.runCurrentJob = () => window.jobController.runCurrentJob();
window.pauseJob = () => window.jobController.pauseJob();
window.stopJob = () => window.jobController.stopJob();
