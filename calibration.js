/* --- START OF FILE calibration.js --- */

export class CalibrationHandler {
    constructor(ws, term, store) {
        this.ws = ws;
        this.term = term;
        this.store = store;

        this.axis = 'X'; // Default
        this.step = 'intro';
        this.oldSteps = 100;
        this.newSteps = 100;
        this.errorFactor = 1;

        this.initUI();
    }

    initUI() {
        const markInput = document.getElementById('cal-input-mark');
        if (markInput) {
            markInput.addEventListener('input', () => {
                const n = parseFloat(markInput.value) || 0;
                const dist = n * 0.9;
                document.getElementById('cal-cnc-dist-display').textContent = dist.toFixed(2);
            });
        }
        this.refreshA();
    }

    refreshA() {
        const btnA = document.getElementById('cal-btn-axis-a');
        if (btnA && window.dro && window.dro.mpos) {
            // grblHAL typically has mpos array length matching number of axes
            if (window.dro.mpos.length > 3) btnA.classList.remove('hidden');
            else btnA.classList.add('hidden');
        }
    }

    startWizard(axis) {
        this.axis = axis;
        
        // Show/Hide A axis button based on machine configuration
        const btnA = document.getElementById('cal-btn-axis-a');
        if (btnA && window.dro && window.dro.mpos) {
            if (window.dro.mpos.length > 3) btnA.classList.remove('hidden');
            else btnA.classList.add('hidden');
        }

        // Only X and Y use the Vernier Wizard for now
        if (axis !== 'X' && axis !== 'Y') {
            this.term.writeln(`\x1b[33m[Calibration] ${axis} axis calibration coming soon.\x1b[0m`);
            if (window.reporter) window.reporter.showToast(`${axis} axis calibration coming soon.`, 'info');
            return;
        }

        this.setStep('setup');
        
        document.getElementById('cal-axis-display').textContent = axis;
        document.getElementById('cal-axis-display-2').textContent = axis;
        document.querySelectorAll('.cal-axis-name').forEach(el => el.textContent = axis);

        // Fetch current steps/mm for this axis
        const settingId = axis === 'X' ? '100' : '101';
        document.getElementById('cal-setting-num').textContent = settingId;
        
        if (window.grblSettings && Object.keys(window.grblSettings.settings).length > 0) {
            if (window.grblSettings.settings[settingId]) {
                this.oldSteps = parseFloat(window.grblSettings.settings[settingId].val);
            }
        } else if (window.grblSettings) {
            this.term.writeln('\x1b[33m[Calibration] Fetching settings from machine...\x1b[0m');
            window.grblSettings.fetchSettings();
            // We'll wait a bit for the value to arrive, or just use 100 as default
            setTimeout(() => {
                if (window.grblSettings.settings[settingId]) {
                    this.oldSteps = parseFloat(window.grblSettings.settings[settingId].val);
                }
            }, 2000);
        }

        this.oldSteps = this.oldSteps || 100;

        // Start position monitoring for Z
        if (this.posInterval) clearInterval(this.posInterval);
        this.posInterval = setInterval(() => {
            if (window.dro && window.dro.wpos) {
                const zPosEl = document.getElementById('cal-z-pos');
                if (zPosEl) zPosEl.textContent = window.dro.wpos[2].toFixed(3);
            }
        }, 200);
    }

    setStep(step) {
        this.step = step;
        // Hide all steps
        ['intro', 'setup', 'cut', 'measure', 'result', 'done'].forEach(s => {
            const el = document.getElementById(`cal-step-${s}`);
            if (el) el.classList.add('hidden');
        });
        // Show current
        const target = document.getElementById(`cal-step-${step}`);
        if (target) target.classList.remove('hidden');

        // Re-enable buttons if we leave the 'cut' step or reset
        const btnRun = document.getElementById('btn-cal-run');
        const btnBack = document.getElementById('btn-cal-back-1');
        if (btnRun) btnRun.disabled = false;
        if (btnBack) btnBack.disabled = false;
    }

    nextStep() {
        if (this.step === 'setup') this.setStep('cut');
        else if (this.step === 'cut') this.setStep('measure');
        else if (this.step === 'measure') this.setStep('result');
        else if (this.step === 'result') this.setStep('done');
    }

    prevStep() {
        if (this.step === 'setup') this.setStep('intro');
        else if (this.step === 'cut') this.setStep('setup');
        else if (this.step === 'measure') this.setStep('cut');
        else if (this.step === 'result') this.setStep('measure');
    }

    cancel() {
        if (this.posInterval) clearInterval(this.posInterval);
        this.isCutting = false;
        if (this.okListener) this.ws.removeListener('line', this.okListener);
        this.setStep('intro');
    }

    runCutJob() {
        const gcode = this.generateGCode();
        
        document.getElementById('cal-cut-progress').classList.remove('hidden');
        document.getElementById('btn-cal-run').disabled = true;
        document.getElementById('btn-cal-back-1').disabled = true;

        this.term.writeln(`\x1b[34m[Calibration] Starting cut job for ${this.axis} axis...\x1b[0m`);
        
        this.lines = gcode.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        this.currentLineIndex = 0;
        this.marksCut = 0;
        this.isCutting = true;

        // Listener for 'ok' responses
        this.okListener = (line) => {
            if (!this.isCutting) return;
            if (line === 'ok' || line.startsWith('error:')) {
                this.sendNextLine();
            }
        };
        this.ws.on('line', this.okListener);

        // Start by sending the first few lines to fill the buffer
        // We'll send up to 10 lines or until the end
        for (let i = 0; i < 10; i++) {
            if (this.currentLineIndex < this.lines.length) {
                this.sendNextLine();
            }
        }
    }

    sendNextLine() {
        if (!this.isCutting) return;

        if (this.currentLineIndex >= this.lines.length) {
            // All lines sent, now wait for Idle
            this.isCutting = false;
            this.ws.removeListener('line', this.okListener);
            this.waitForIdle();
            return;
        }

        const line = this.lines[this.currentLineIndex];
        this.ws.sendCommand(line);
        this.currentLineIndex++;

        // Update Progress UI
        const pct = Math.round((this.currentLineIndex / this.lines.length) * 100);
        document.getElementById('cal-cut-bar').style.width = `${pct}%`;
        document.getElementById('cal-cut-pct').textContent = `${pct}%`;
        
        // Count marks: every time we start a mark (Z-5.2)
        if (line.includes('Z-5.2')) {
            this.marksCut++;
            document.getElementById('cal-mark-num').textContent = Math.min(this.marksCut, 100);
        }
    }

    waitForIdle() {
        this.term.writeln(`\x1b[34m[Calibration] Waiting for machine to finish moving...\x1b[0m`);
        
        let attempts = 0;
        const checkIdle = setInterval(() => {
            attempts++;
            // Check for Idle or Check state
            if (window.dro && (window.dro.status === 'Idle' || window.dro.status === 'Check')) {
                clearInterval(checkIdle);
                this.term.writeln(`\x1b[32m[Calibration] Cut job complete.\x1b[0m`);
                this.nextStep();
            }
            
            // Safety: if we've waited 30 seconds and status is still something else, maybe it's stuck or we missed it
            if (attempts > 60) {
                clearInterval(checkIdle);
                this.term.writeln(`\x1b[33m[Calibration] Timeout waiting for Idle. Proceeding...\x1b[0m`);
                this.nextStep();
            }
        }, 500);
    }


    generateGCode() {
        let g = "G21 ; Units mm\n";
        g += "G91 ; Incremental\n";
        g += "G0 Z5 ; Safe Z\n";
        
        // 100 Marks, 0.9mm apart
        for (let i = 0; i <= 100; i++) {
            // Mark
            g += "G1 Z-5.2 F100 ; Cut depth (relative to Z0 - assuming user is at Z5)\n";
            if (this.axis === 'X') {
                g += "G1 Y2 F500 ; Cut line\n";
                g += "G0 Z5.2 ; Retract\n";
                g += "G0 Y-2 ; Return Y\n";
                if (i < 100) g += "G0 X0.9 ; Move to next\n";
            } else {
                g += "G1 X2 F500 ; Cut line\n";
                g += "G0 Z5.2 ; Retract\n";
                g += "G0 X-2 ; Return X\n";
                if (i < 100) g += "G0 Y0.9 ; Move to next\n";
            }
        }
        
        g += "G90 ; Absolute\n";
        g += "G0 Z10 ; Safe height\n";
        g += "M5 ; Stop Spindle\n";
        return g;
    }

    calculate() {
        const n = parseFloat(document.getElementById('cal-input-mark').value);
        const real = parseFloat(document.getElementById('cal-input-real').value);

        if (isNaN(n) || isNaN(real) || real <= 0) {
            alert("Please enter valid readings.");
            return;
        }

        const cncDist = n * 0.9;
        this.errorFactor = real / cncDist;
        
        // new = old / k OR new = old * (cnc / real)
        // new = old * (n * 0.9 / real)
        this.newSteps = this.oldSteps * (cncDist / real);

        document.getElementById('cal-old-steps').textContent = this.oldSteps.toFixed(3);
        document.getElementById('cal-new-steps').textContent = this.newSteps.toFixed(3);
        document.getElementById('cal-error-factor').textContent = this.errorFactor.toFixed(6);

        this.nextStep();
    }

    apply() {
        const settingId = this.axis === 'X' ? '100' : '101';
        const val = this.newSteps.toFixed(3);
        
        this.ws.sendCommand(`$${settingId}=${val}`);
        this.term.writeln(`\x1b[32m[Calibration] Applied $${settingId}=${val} to firmware.\x1b[0m`);
        
        if (window.reporter) {
            window.reporter.showToast(`Updated $${settingId} to ${val}`, 'success');
        }

        this.setStep('done');
    }
}
