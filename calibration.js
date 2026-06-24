/* --- START OF FILE calibration.js --- */

import { makeLine, getTextWidth, drawTextString } from './gcode-draw.js';

export class CalibrationHandler {
    constructor(ws, term, store) {
        this.ws = ws;
        this.term = term;
        this.store = store;

        this.axis = 'X'; // Default
        this.method = 'distance';
        this.step = 'intro';
        this.oldSteps = 100;
        this.newSteps = 100;
        this.errorFactor = 1;
        this.commandedDistance = 100;

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

        const commandedInput = document.getElementById('cal-input-commanded');
        if (commandedInput) {
            commandedInput.addEventListener('input', () => this.syncCommandedDistanceUI());
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

    startWizard(axis, method = 'distance') {
        this.axis = axis;
        this.method = method;
        
        // Show/Hide A axis button based on machine configuration
        const btnA = document.getElementById('cal-btn-axis-a');
        if (btnA && window.dro && window.dro.mpos) {
            if (window.dro.mpos.length > 3) btnA.classList.remove('hidden');
            else btnA.classList.add('hidden');
        }

        if (method === 'vernier' && axis !== 'X' && axis !== 'Y') {
            this.term.writeln(`\x1b[33m[Calibration] Vernier calibration is available for X and Y only.\x1b[0m`);
            if (window.reporter) window.reporter.showToast('Vernier calibration is available for X and Y only.', 'info');
            return;
        }

        if (axis === 'A') {
            this.term.writeln(`\x1b[33m[Calibration] A axis calibration coming soon.\x1b[0m`);
            if (window.reporter) window.reporter.showToast('A axis calibration coming soon.', 'info');
            return;
        }

        this.setStep('setup');
        this.commandedDistance = this.getDefaultDistance(axis);
        this.resetWizardFields();
        
        document.getElementById('cal-axis-display').textContent = axis;
        document.getElementById('cal-axis-display-2').textContent = axis;
        document.querySelectorAll('.cal-axis-name').forEach(el => el.textContent = axis);
        this.renderWizard();

        // Fetch current steps/mm for this axis
        const settingId = this.getAxisSettingId(axis);
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
                const posEl = document.getElementById('cal-axis-pos');
                if (posEl) {
                    const axisIndex = this.getAxisIndex(this.axis);
                    posEl.textContent = (window.dro.wpos[axisIndex] || 0).toFixed(3);
                }
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

        this.renderWizard();
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
        this.okListener = null;
        this.setStep('intro');
        if (msg && this.term) {
            this.term.writeln(`\x1b[31m[Calibration] ${msg}\x1b[0m`);
        }
    }

    runCutJob() {
        if (this.method === 'distance') {
            this.runDistanceMove();
            return;
        }

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

    runDistanceMove() {
        const input = document.getElementById('cal-input-commanded');
        const distance = parseFloat(input?.value);
        if (isNaN(distance) || distance <= 0) {
            alert('Please enter a valid commanded distance.');
            return;
        }

        this.commandedDistance = distance;
        this.syncCommandedDistanceUI();

        const btnRun = document.getElementById('btn-cal-run');
        const btnBack = document.getElementById('btn-cal-back-1');
        if (btnRun) btnRun.disabled = true;
        if (btnBack) btnBack.disabled = true;

        const feed = this.axis === 'Z' ? 300 : 1000;
        const axisWord = `${this.axis}${distance}`;
        this.term.writeln(`\x1b[34m[Calibration] Moving ${this.axis} axis by ${distance.toFixed(3)}mm...\x1b[0m`);
        this.ws.sendCommand('G21');
        this.ws.sendCommand('G91');
        this.ws.sendCommand(`G1 ${axisWord} F${feed}`);
        this.ws.sendCommand('G90');
        this.waitForIdle(true);
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

    waitForIdle(mustSeeMotion = false) {
        this.term.writeln(`\x1b[34m[Calibration] Waiting for machine to finish moving...\x1b[0m`);
        
        let attempts = 0;
        let sawMotion = !mustSeeMotion;
        const checkIdle = setInterval(() => {
            attempts++;
            if (window.dro && window.dro.status && window.dro.status !== 'Idle' && window.dro.status !== 'Check') {
                sawMotion = true;
            }
            // Check for Idle or Check state
            if (window.dro && sawMotion && (window.dro.status === 'Idle' || window.dro.status === 'Check')) {
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
        if (this.method === 'distance') {
            const commanded = parseFloat(document.getElementById('cal-input-commanded')?.value);
            const actual = parseFloat(document.getElementById('cal-input-actual-travel')?.value);

            if (isNaN(commanded) || commanded <= 0 || isNaN(actual) || actual <= 0) {
                alert("Please enter valid travel values.");
                return;
            }

            this.commandedDistance = commanded;
            this.errorFactor = actual / commanded;
            this.newSteps = this.oldSteps * (commanded / actual);

            document.getElementById('cal-old-steps').textContent = this.oldSteps.toFixed(3);
            document.getElementById('cal-new-steps').textContent = this.newSteps.toFixed(3);
            document.getElementById('cal-error-factor').textContent = this.errorFactor.toFixed(6);

            this.nextStep();
            return;
        }

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
        const settingId = this.getAxisSettingId(this.axis);
        const val = this.newSteps.toFixed(3);
        
        this.ws.sendCommand(`$${settingId}=${val}`);
        if (this.axis === 'Y') {
            this.ws.sendCommand(`$103=${val}`);
        }
        this.term.writeln(`\x1b[32m[Calibration] Applied $${settingId}=${val} to firmware.\x1b[0m`);
        
        if (window.reporter) {
            window.reporter.showToast(`Updated $${settingId} to ${val}`, 'success');
        }

        this.setStep('done');
    }

    zeroSelectedAxis() {
        this.ws.sendCommand(`G10 L20 P0 ${this.axis}0`);
    }

    getAxisSettingId(axis) {
        return { X: '100', Y: '101', Z: '102', A: '103' }[axis] || '100';
    }

    getAxisIndex(axis) {
        return { X: 0, Y: 1, Z: 2, A: 3 }[axis] ?? 0;
    }

    getDefaultDistance(axis) {
        return axis === 'Z' ? 25 : axis === 'A' ? 360 : 100;
    }

    resetWizardFields() {
        const commandedInput = document.getElementById('cal-input-commanded');
        const actualTravelInput = document.getElementById('cal-input-actual-travel');
        const markInput = document.getElementById('cal-input-mark');
        const realInput = document.getElementById('cal-input-real');
        const progress = document.getElementById('cal-cut-progress');
        const bar = document.getElementById('cal-cut-bar');
        const pct = document.getElementById('cal-cut-pct');
        const markNum = document.getElementById('cal-mark-num');

        if (commandedInput) commandedInput.value = this.commandedDistance;
        if (actualTravelInput) actualTravelInput.value = '';
        if (markInput) markInput.value = '';
        if (realInput) realInput.value = '';
        if (progress) progress.classList.add('hidden');
        if (bar) bar.style.width = '0%';
        if (pct) pct.textContent = '0%';
        if (markNum) markNum.textContent = '0';

        this.syncCommandedDistanceUI();
    }

    syncCommandedDistanceUI() {
        const value = parseFloat(document.getElementById('cal-input-commanded')?.value) || this.commandedDistance || 0;
        const display = document.getElementById('cal-commanded-display');
        const displayInline = document.getElementById('cal-commanded-display-inline');
        if (display) display.value = value.toFixed(2);
        if (displayInline) displayInline.textContent = value.toFixed(2);
    }

    renderWizard() {
        const isVernier = this.method === 'vernier';
        const axis = this.axis;

        const setupTitle = document.getElementById('cal-setup-title');
        const setupStep1 = document.getElementById('cal-setup-step-1');
        const setupStep2 = document.getElementById('cal-setup-step-2');
        const setupStep3 = document.getElementById('cal-setup-step-3');
        const setupWarning = document.getElementById('cal-setup-warning');
        const liveLabel = document.getElementById('cal-live-axis-label');
        const zeroBtn = document.getElementById('cal-zero-axis-btn');
        const methodChip = document.getElementById('cal-method-chip');
        const step2Title = document.getElementById('cal-step2-title');
        const step2Heading = document.getElementById('cal-step2-heading');
        const step2Desc = document.getElementById('cal-step2-desc');
        const spindleWarning = document.getElementById('cal-cut-spindle-warning');
        const progress = document.getElementById('cal-cut-progress');
        const distancePanel = document.getElementById('cal-distance-panel');
        const runLabel = document.getElementById('cal-run-btn-label');
        const measureVernierHelp = document.getElementById('cal-measure-vernier-help');
        const measureDistanceHelp = document.getElementById('cal-measure-distance-help');
        const measureVernierImage = document.getElementById('cal-measure-vernier-image');
        const measureVernierInputs = document.getElementById('cal-measure-vernier-inputs');
        const measureDistanceInputs = document.getElementById('cal-measure-distance-inputs');
        const measureTitle = document.getElementById('cal-measure-title');
        const resultVerifyTail = document.getElementById('cal-result-verify-tail');
        const doneDesc = document.getElementById('cal-done-desc');

        if (methodChip) methodChip.textContent = isVernier ? 'VERNIER SCALE' : 'MEASURED TRAVEL';
        if (liveLabel) liveLabel.textContent = axis;
        if (zeroBtn) zeroBtn.textContent = `Zero ${axis} Axis`;

        if (setupTitle) setupTitle.textContent = isVernier ? 'Step 1: Machine Setup' : 'Step 1: Setup Measurement';
        if (setupStep1) setupStep1.textContent = isVernier
            ? 'Secure a scrap piece of MDF or wood to your wasteboard. Ensure it is at least 120mm long.'
            : `Set up a ruler, calipers, or dial indicator so you can measure ${axis} axis travel accurately.`;
        if (setupStep2) setupStep2.textContent = isVernier
            ? 'Install a sharp V-Bit or engraving tool.'
            : `Jog to a safe start point with enough room to move ${this.commandedDistance}mm in the positive ${axis} direction.`;
        if (setupStep3) setupStep3.textContent = isVernier
            ? 'Jog to the starting position on the scrap material and zero the Z axis on the surface.'
            : `Zero or reference your measuring device, then zero the ${axis} work coordinate if that helps your setup.`;
        if (setupWarning) setupWarning.textContent = isVernier
            ? `Ensure there is enough travel in the ${axis} direction (approx 100mm) from the current position.`
            : `Ensure there is enough clear travel in the ${axis} direction for the commanded move before starting.`;

        if (step2Title) step2Title.textContent = isVernier ? 'Step 2: Cut Calibration Scale' : 'Step 2: Run Test Move';
        if (step2Heading) step2Heading.textContent = isVernier ? 'Ready to cut?' : 'Ready to move?';
        if (step2Desc) step2Desc.textContent = isVernier
            ? 'The machine will now cut 100 lines spaced 0.9mm apart. This will take approximately 2 minutes.'
            : `The machine will move the ${axis} axis by the commanded distance. Measure the actual travel, then enter it on the next step.`;
        if (runLabel) runLabel.textContent = isVernier ? 'Start Cut' : 'Run Test Move';

        if (spindleWarning) spindleWarning.classList.toggle('hidden', !isVernier);
        if (progress) progress.classList.toggle('hidden', !isVernier || progress.classList.contains('hidden'));
        if (distancePanel) distancePanel.classList.toggle('hidden', isVernier);

        if (measureTitle) measureTitle.textContent = isVernier ? 'How to Read' : 'How to Measure';
        if (measureVernierHelp) measureVernierHelp.classList.toggle('hidden', !isVernier);
        if (measureDistanceHelp) measureDistanceHelp.classList.toggle('hidden', isVernier);
        if (measureVernierImage) measureVernierImage.classList.toggle('hidden', !isVernier);
        if (measureVernierInputs) measureVernierInputs.classList.toggle('hidden', !isVernier);
        if (measureDistanceInputs) measureDistanceInputs.classList.toggle('hidden', isVernier);

        if (resultVerifyTail) resultVerifyTail.textContent = isVernier
            ? 'It is recommended to perform a test cut after applying to verify the accuracy.'
            : 'It is recommended to repeat the travel check after applying to verify the accuracy.';
        if (doneDesc) doneDesc.textContent = isVernier
            ? `The new steps/mm have been saved to your machine's non-volatile memory. Your ${axis} axis is now tuned using the Vernier method.`
            : `The new steps/mm have been saved to your machine's non-volatile memory. Your ${axis} axis is now tuned using measured travel.`;

        this.syncCommandedDistanceUI();
    }
}
