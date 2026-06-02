/* --- START OF FILE calibration.js --- */

import { makeLine, getTextWidth, drawTextString } from './gcode-draw.js';

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

    cancel(msg) {
        if (this.posInterval) clearInterval(this.posInterval);
        if (this.alarmWatch) clearInterval(this.alarmWatch);
        this.isCutting = false;
        if (this.okListener) this.ws.removeListener('line', this.okListener);
        this.setStep('intro');
        if (msg && this.term) {
            this.term.writeln(`\x1b[31m[Calibration] ${msg}\x1b[0m`);
        }
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

        // Watch for alarms during the cut job
        if (this.alarmWatch) clearInterval(this.alarmWatch);
        this.alarmWatch = setInterval(() => {
            if (!this.isCutting) {
                clearInterval(this.alarmWatch);
                return;
            }
            if (window.dro && window.dro.status === 'Alarm') {
                clearInterval(this.alarmWatch);
                this.term.writeln(`\x1b[31m[Calibration] Machine alarm detected! Aborting job.\x1b[0m`);
                if (window.reporter) window.reporter.showToast('Calibration aborted due to machine alarm', 'error');
                this.cancel('Aborted due to machine alarm. Check machine and re-home before retrying.');
            }
        }, 200);

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
        
        // Count marks: every time we plunge into the material
        if (/G0?1.*Z-/.test(line)) {
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
        const orientation = this.axis;
        const lengthLet = 3;
        const hightLet = 4;
        const space = 1.5;
        const depth = -0.3;
        const up = 1;
        const feedrate = 500;
        const plungeRate = 150;
        const rotateLabels = true;

        const down = depth;
        const rapide = 'G0';
        const lent = 'G01';

        let gcode = '';
        gcode += `G21 G90 G17 F${feedrate}\n`;
        gcode += `G0 X0 Y0 Z${up}\n`;

        // 1. Draw scale lines spanning 90mm with 101 divisions
        for (let i = 0; i <= 100; i++) {
            const u = i * 0.9;
            let tickHeight = hightLet * 0.5;
            if (i % 10 === 0) {
                tickHeight = hightLet;
            } else if (i % 5 === 0) {
                tickHeight = hightLet * 0.75;
            }

            gcode += makeLine(rapide, orientation, u, 0, { z: up });
            gcode += makeLine(lent, orientation, u, 0, { z: down, f: plungeRate });
            gcode += makeLine(lent, orientation, u, tickHeight, { z: down });
            gcode += makeLine(rapide, orientation, u, tickHeight, { z: up });
        }

        // 2. Render division label values aligning with ticks
        const labelBaseline = hightLet + 1.5;
        for (let i = 0; i <= 100; i += 10) {
            const uTick = i * 0.9;
            const labelText = i + 'X';

            if (rotateLabels) {
                gcode += drawTextString(labelText, uTick, labelBaseline, lengthLet, hightLet, space, depth, up, orientation, true);
            } else {
                const labelWidth = getTextWidth(labelText, lengthLet, space);
                const uStart = uTick - labelWidth / 2;
                gcode += drawTextString(labelText, uStart, labelBaseline, lengthLet, hightLet, space, depth, up, orientation, false);
            }
        }

        // 3. Compute vertical spacing for the upper dimension boundary bar
        let maxLabelLength = 0;
        if (rotateLabels) {
            maxLabelLength = getTextWidth("100X", lengthLet, space);
        } else {
            maxLabelLength = hightLet;
        }

        const dimensionBaseline = labelBaseline + maxLabelLength + 4.5;
        const extensionMinV = labelBaseline + maxLabelLength + 1.2;
        const extensionMaxV = dimensionBaseline + 1.5;

        // Left bounds bar line
        gcode += makeLine(rapide, orientation, 0, extensionMinV, { z: up });
        gcode += makeLine(lent, orientation, 0, extensionMinV, { z: down, f: plungeRate });
        gcode += makeLine(lent, orientation, 0, extensionMaxV, { z: down });
        gcode += makeLine(rapide, orientation, 0, extensionMaxV, { z: up });

        // Right bounds bar line
        gcode += makeLine(rapide, orientation, 90, extensionMinV, { z: up });
        gcode += makeLine(lent, orientation, 90, extensionMinV, { z: down, f: plungeRate });
        gcode += makeLine(lent, orientation, 90, extensionMaxV, { z: down });
        gcode += makeLine(rapide, orientation, 90, extensionMaxV, { z: up });

        // Dimension text "90mm" centered along the main axis
        const dimText = "90MM";
        const dimTextWidth = getTextWidth(dimText, lengthLet, space);
        const dimTextStart = 45 - dimTextWidth / 2;
        const dimTextBaseline = dimensionBaseline - (hightLet / 2);

        gcode += drawTextString(dimText, dimTextStart, dimTextBaseline, lengthLet, hightLet, space, depth, up, orientation, false);

        const textGap = 2.0;
        const lineV = dimensionBaseline;

        // Horizontal connector segments
        gcode += makeLine(rapide, orientation, 0, lineV, { z: up });
        gcode += makeLine(lent, orientation, 0, lineV, { z: down, f: plungeRate });
        gcode += makeLine(lent, orientation, 45 - (dimTextWidth / 2) - textGap, lineV, { z: down });
        gcode += makeLine(rapide, orientation, 45 - (dimTextWidth / 2) - textGap, lineV, { z: up });

        gcode += makeLine(rapide, orientation, 45 + (dimTextWidth / 2) + textGap, lineV, { z: up });
        gcode += makeLine(lent, orientation, 45 + (dimTextWidth / 2) + textGap, lineV, { z: down, f: plungeRate });
        gcode += makeLine(lent, orientation, 90, lineV, { z: down });
        gcode += makeLine(rapide, orientation, 90, lineV, { z: up });

        // Return safe home
        gcode += makeLine(rapide, orientation, 0, 0, { z: up });

        return gcode;
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
