export class ProbeHandler {
    constructor(ws, term, store) {
        this.ws = ws;
        this.term = term;
        this.store = store;

        // State Machine
        this.activeRoutine = null;
        this.routineStep = 0;
        this.probeData = [];
        this.tempData = {};

        // TLO specific state
        this.tloReferenceZ = null;

        // Selected Corners
        this.selections = {
            outsideCorner: 'FL',
            insideCorner: 'FL'
        };

        // Probe safety test
        this.probeSafe = false;
        this._probeTestInterval = null;
        this._testStage = null; // null, 'trigger', 'release'

        this.initUI();
    }

    initUI() {
        this.renderSettings();
        this._resetProbeTest();

        // Reset safety when probe tab is shown
        window.addEventListener('tab-shown', (e) => {
            if (e.detail && e.detail.id === 'probe-view') {
                this._resetProbeTest();
            }
        });
    }

    // ==========================================
    // PROBE SAFETY TEST
    // ==========================================
    _isProbeTriggered() {
        const dro = window.dro;
        return dro && dro.inputPins && dro.inputPins.includes('P');
    }

    runProbeTest() {
        if (this._testStage) return; // already testing

        const s = this.store.data.probe;
        const isPlate = s.mode === 'plate';
        const bar = document.getElementById('probe-safety-bar');
        const msg = document.getElementById('probe-safety-msg');
        const status = document.getElementById('probe-safety-status');
        const btn = document.getElementById('probe-test-btn');

        bar.className = 'mb-3 p-2 rounded-lg border flex items-center gap-3 text-xs font-bold bg-yellow-50 border-yellow-200 text-yellow-700';
        msg.textContent = isPlate
            ? 'Lift the probe plate and gently touch the endmill to the plate, then release'
            : 'Gently press the probe tip by hand, then release';
        btn.disabled = true;
        btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Waiting...';
        status.className = 'hidden';

        this._testStage = 'trigger';
        this._probeTestInterval = setInterval(() => {
            if (this._testStage === 'trigger') {
                if (this._isProbeTriggered()) {
                    this._testStage = 'release';
                    msg.textContent = 'Probe detected! Now release the probe...';
                    // Reset trigger timeout
                }
            } else if (this._testStage === 'release') {
                if (!this._isProbeTriggered()) {
                    // Test passed!
                    clearInterval(this._probeTestInterval);
                    this._probeTestInterval = null;
                    this._testStage = null;
                    this.probeSafe = true;
                    this._updateProbeButtons();

                    bar.className = 'mb-3 p-2 rounded-lg border flex items-center gap-3 text-xs font-bold safe';
                    msg.textContent = 'Probe test passed — all operations enabled';
                    btn.disabled = false;
                    btn.innerHTML = '<i class="bi bi-hand-index-thumb"></i> Test Probe';
                    status.className = 'text-green-600';
                    status.innerHTML = '<i class="bi bi-check-circle-fill"></i> Probe OK';
                    this.term.writeln('\x1b[32m> Probe safety test PASSED.\x1b[0m');
                }
            }
        }, 100);

        // Timeout after 15 seconds
        setTimeout(() => {
            if (this._testStage) {
                clearInterval(this._probeTestInterval);
                this._probeTestInterval = null;
                this._testStage = null;
                this.probeSafe = false;

                bar.className = 'mb-3 p-2 rounded-lg border flex items-center gap-3 text-xs font-bold unsafe';
                msg.textContent = 'Test timed out — try again';
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-hand-index-thumb"></i> Test Probe';
                this.term.writeln('\x1b[31m> Probe safety test TIMED OUT.\x1b[0m');
            }
        }, 15000);
    }

    _resetProbeTest() {
        if (this._probeTestInterval) {
            clearInterval(this._probeTestInterval);
            this._probeTestInterval = null;
        }
        this._testStage = null;
        this.probeSafe = false;
        this._updateProbeButtons();

        const bar = document.getElementById('probe-safety-bar');
        const msg = document.getElementById('probe-safety-msg');
        const status = document.getElementById('probe-safety-status');
        const btn = document.getElementById('probe-test-btn');

        if (bar) bar.className = 'mb-3 p-2 rounded-lg border flex items-center gap-3 text-xs font-bold unsafe';
        if (msg) msg.textContent = 'Probe not tested — test required before any operation';
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-hand-index-thumb"></i> Test Probe';
        }
        if (status) status.className = 'hidden';
    }

    _updateProbeButtons() {
        const disabled = !this.probeSafe;
        document.querySelectorAll('.probe-btn').forEach(el => {
            if (disabled) {
                el.classList.add('probe-btn-disabled');
            } else {
                el.classList.remove('probe-btn-disabled');
            }
        });
    }

    _requireProbeSafe() {
        if (!this.probeSafe) {
            const reporter = window.reporter || (window.AlarmsAndErrors ? new window.AlarmsAndErrors(this.ws) : null);
            if (reporter) {
                reporter.showAlert('Safety Check', 'Please test the probe first using the "Test Probe" button.');
            }
            return false;
        }
        return true;
    }

    switchProbeTab(targetId, btn) {
        const s = this.store.data.probe;
        if ((targetId === 'tab-centers' || targetId === 'tab-rotation' || targetId === 'tab-inside-corners') && (!s.mode || s.mode === 'plate')) return;

        // Hide all contents
        document.querySelectorAll('.probe-tab-content').forEach(el => el.classList.add('hidden'));
        // Show target
        document.getElementById(targetId).classList.remove('hidden');

        // Reset buttons
        document.querySelectorAll('.probe-tab-btn').forEach(el => {
            el.classList.replace('text-primary-dark', 'text-grey');
            el.classList.replace('border-primary', 'border-transparent');
        });

        // Active button
        btn.classList.replace('text-grey', 'text-primary-dark');
        btn.classList.replace('border-transparent', 'border-primary');
    }

    toggleProbeMode() {
        // Save current mode's values, then switch
        this.saveSettings();
        const s = this.store.data.probe;
        const newMode = s.mode === 'plate' ? 'probe' : 'plate';
        this.store.set('probe.mode', newMode);
        document.body.setAttribute('data-probe-mode', newMode);
        this.renderSettings();
        this._resetProbeTest();
    }

    saveSettings() {
        const s = this.store.data.probe;
        const mode = s.mode || 'plate';

        // Basic Config
        if (document.getElementById('prb-tool')) this.store.set('probe.toolDiameter', parseFloat(document.getElementById('prb-tool').value) || 0);
        if (document.getElementById('prb-z-thick')) this.store.set('probe.plateThickness', parseFloat(document.getElementById('prb-z-thick').value) || 0);
        if (document.getElementById('prb-xy-offset')) this.store.set('probe.xyPlateOffset', parseFloat(document.getElementById('prb-xy-offset').value) || 0);

        if (document.getElementById('prb-feed')) this.store.set('probe.feed', parseFloat(document.getElementById('prb-feed').value) || 100);
        if (document.getElementById('prb-feed-latch')) this.store.set('probe.feedLatch', parseFloat(document.getElementById('prb-feed-latch').value) || 25);
        if (document.getElementById('prb-dist')) this.store.set('probe.travel', parseFloat(document.getElementById('prb-dist').value) || 25);
        if (document.getElementById('prb-retract')) this.store.set('probe.retract', parseFloat(document.getElementById('prb-retract').value) || 10);
        if (document.getElementById('prb-z-depth')) this.store.set('probe.zDepth', parseFloat(document.getElementById('prb-z-depth').value) || 5);

        // Mode-specific clearance
        if (document.getElementById('prb-edge-dist')) this.store.set('probe.plateClearance', parseFloat(document.getElementById('prb-edge-dist').value) || 5);
        if (document.getElementById('prb-probe-dist')) this.store.set('probe.probeClearance', parseFloat(document.getElementById('prb-probe-dist').value) || 5);

        if (document.getElementById('prb-feature-x')) this.store.set('probe.featureW', parseFloat(document.getElementById('prb-feature-x').value) || 0);
        if (document.getElementById('prb-feature-y')) this.store.set('probe.featureH', parseFloat(document.getElementById('prb-feature-y').value) || 0);

        // TLO Settings
        if (document.getElementById('tlo-x')) this.store.set('probe.tloX', parseFloat(document.getElementById('tlo-x').value) || 0);
        if (document.getElementById('tlo-y')) this.store.set('probe.tloY', parseFloat(document.getElementById('tlo-y').value) || 0);
        if (document.getElementById('tlo-z')) this.store.set('probe.tloZ', parseFloat(document.getElementById('tlo-z').value) || -5);

        this.renderSettings();
    }

    renderSettings() {
        const s = this.store.data.probe;
        const mode = s.mode || 'plate';
        const isPlate = mode === 'plate';

        // Set body attribute for CSS visibility
        document.body.setAttribute('data-probe-mode', mode);

        // Set toggle state (inverted: unchecked = Plate (left), checked = Probe (right))
        const toggle = document.getElementById('prb-mode-toggle');
        if (toggle) toggle.checked = !isPlate;

        // Helper to safely set values
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

        setVal('prb-tool', s.toolDiameter);
        setVal('prb-z-thick', s.plateThickness);
        setVal('prb-xy-offset', s.xyPlateOffset);
        setVal('prb-feed', s.feed);
        setVal('prb-feed-latch', s.feedLatch);
        setVal('prb-dist', s.travel);
        setVal('prb-retract', s.retract);
        setVal('prb-edge-dist', s.plateClearance);
        setVal('prb-probe-dist', s.probeClearance);
        setVal('prb-z-depth', s.zDepth);
        setVal('prb-feature-x', s.featureW);
        setVal('prb-feature-y', s.featureH);

        setVal('tlo-x', s.tloX || 0);
        setVal('tlo-y', s.tloY || 0);
        setVal('tlo-z', s.tloZ || -5);

        const statusEls = document.querySelectorAll('.plate-status-text');
        statusEls.forEach(el => {
            if (isPlate) {
                el.textContent = "Mode: Plate";
                el.classList.replace('text-grey', 'text-primary-dark');
            } else {
                el.textContent = "Mode: Probe";
                el.classList.replace('text-primary-dark', 'text-grey');
            }
        });

        ['tab-centers', 'tab-rotation', 'tab-inside-corners'].forEach(tab => {
            const btn = document.querySelector(`.probe-tab-btn[data-target="${tab}"]`);
            if (btn) {
                if (isPlate) {
                    btn.classList.add('opacity-40', 'cursor-not-allowed', 'pointer-events-none');
                    btn.classList.remove('hover:bg-white', 'hover:text-secondary-dark');
                    if (btn.classList.contains('text-primary-dark')) {
                        const edgesBtn = document.querySelector('.probe-tab-btn[data-target="tab-edges"]');
                        if (edgesBtn) this.switchProbeTab('tab-edges', edgesBtn);
                    }
                } else {
                    btn.classList.remove('opacity-40', 'cursor-not-allowed', 'pointer-events-none');
                    btn.classList.add('hover:bg-white', 'hover:text-secondary-dark');
                }
            }
        });
    }

    selectCorner(btn, type, corner) {
        if (type === 'Outside') this.selections.outsideCorner = corner;
        else this.selections.insideCorner = corner;

        const parent = btn.parentElement;
        // Styles
        const selClasses = ['bg-primary', 'border-2', 'border-black/20', 'ring-2', 'ring-primary/30'];
        const outUnsel = ['bg-grey-bg', 'border', 'border-grey-light'];
        const inUnsel = ['bg-white', 'shadow-inner']; // simplified

        parent.querySelectorAll('button').forEach(b => {
            b.className = "corner-sel-btn h-full transition-colors rounded " + (type === 'Outside' ? "bg-grey-bg border border-grey-light hover:bg-primary" : "bg-white shadow-inner hover:bg-primary");
        });

        // Apply active style
        btn.className = "corner-sel-btn h-full rounded " + selClasses.join(' ');
    }

    setTLOFromMachine() {
        if (window.dro && window.dro.mpos) {
            document.getElementById('tlo-x').value = window.dro.mpos[0].toFixed(3);
            document.getElementById('tlo-y').value = window.dro.mpos[1].toFixed(3);
            document.getElementById('tlo-z').value = window.dro.mpos[2].toFixed(3);
            this.saveSettings();
        }
    }

    runAutoCorner() {
        if (!this._requireProbeSafe()) return;
        this.saveSettings();
        this.activeRoutine = 'AUTO_CORNER';
        this.routineStep = 0;
        this.term.writeln('\x1b[34m> Auto Corner: Probing Z surface first...\x1b[0m');
        this.ws.sendCommand('G91 G38.2 Z-' + this.store.data.probe.travel + ' F' + this.store.data.probe.feed);
    }

    handleProbeResult(line) {
        // [PRB:0.000,0.000,0.000:1]
        const content = line.substring(5, line.length - 1);
        const parts = content.split(':');
        const coords = parts[0].split(',').map(Number); // [X, Y, Z] Machine Coords
        const success = parts[1] === '1';

        if (!success) {
            this.activeRoutine = null;
            this._resetProbeTest();
            this.term.writeln('\x1b[31m> Probe Failed: No Contact.\x1b[0m');
            return;
        }

        if (this.activeRoutine === 'AUTO_CORNER') this.stepAutoCorner(coords);
        else if (this.activeRoutine === 'OUTSIDE_CORNER') this.stepOutsideCorner(coords);
        else if (this.activeRoutine === 'POCKET') this.stepPocket(coords);
        else if (this.activeRoutine === 'FEATURE') this.stepFeature(coords);
        else if (this.activeRoutine === 'TLO') this.stepTLO(coords);
        else if (this.activeRoutine === 'ROTATION') this.stepRotation(coords);
    }

    // ==========================================
    // TOOL LENGTH OFFSET (TLO)
    // ==========================================
    runTLO(mode) {
        if (!this._requireProbeSafe()) return;
        this.saveSettings();
        const s = this.store.data.probe;

        // Safety Checks
        if (s.tloZ === 0 || s.tloZ === undefined) {
            const reporter = window.reporter || (window.AlarmsAndErrors ? new window.AlarmsAndErrors(this.ws) : null);
            if (reporter) {
                reporter.showAlert('TLO Setup Required', 'Please set a safe Z start position for the Tool Setter.');
            }
            return;
        }

        this.activeRoutine = 'TLO';
        this.tempData = { mode: mode };
        this.term.writeln(`\x1b[34m> Starting TLO [${mode.toUpperCase()}]...\x1b[0m`);

        // Move to Setter Position (G53 Machine Coords)
        // 1. Lift Z to Safe Machine Height (usually 0 or close to it, careful here!)
        this.ws.sendCommand('G53 G0 Z0');
        // 2. Move XY to setter
        this.ws.sendCommand(`G53 G0 X${s.tloX} Y${s.tloY}`);
        // 3. Move Z to Start Height
        this.ws.sendCommand(`G53 G0 Z${s.tloZ}`);

        // 4. Probe Down
        // Note: TLO usually doesn't use the Plate Thickness offset because we care about the delta.
        this.ws.sendCommand(`G91 G38.2 Z-50 F${s.feed}`);
    }

    stepTLO(coords) {
        const measuredZ = coords[2]; // Machine Z
        const s = this.store.data.probe;
        const statusEl = document.getElementById('tlo-status');

        this.ws.sendCommand(`G53 G0 Z${s.tloZ}`); // Retract

        if (this.tempData.mode === 'reference') {
            this.tloReferenceZ = measuredZ;
            this.term.writeln(`\x1b[32m> Reference Established at Z: ${measuredZ.toFixed(3)}\x1b[0m`);
            statusEl.textContent = `Ref: ${measuredZ.toFixed(3)}`;
            statusEl.classList.replace('text-grey-dark', 'text-primary-dark');
            statusEl.classList.add('font-bold');
        }
        else if (this.tempData.mode === 'measure') {
            if (this.tloReferenceZ === null) {
                this.term.writeln(`\x1b[31mError: No reference set!\x1b[0m`);
                return;
            }

            const diff = measuredZ - this.tloReferenceZ;
            this.term.writeln(`\x1b[32m> New Tool Z: ${measuredZ.toFixed(3)}\x1b[0m`);
            this.term.writeln(`\x1b[32m> Offset Delta: ${diff.toFixed(3)}\x1b[0m`);

            // Apply to WCS Z (Shift current Zero by the difference)
            // G10 L20 P0 Z... effectively sets the current WCS Z value.
            // If we are at the probe point, our WCS Z should be (Old_WCS_Z_at_probe + diff)?
            // Simpler approach: Shift the Coordinate System Origin.
            // Current WCS Z Zero needs to move down by `diff` (if tool is longer/diff is negative).

            // Standard approach for manual tool change (Grbl):
            // The physical Z distance from Work Zero to Probe Point is constant.
            // We just need to reset Z work coordinate based on the known "Height of Part relative to Probe".
            // But we don't know that.

            // "Offset WCS" Method:
            // We want the Z position at the work surface to remain "0" with the new tool.
            // New Length = Old Length + diff.
            // If diff is -1mm (longer tool), it hits probe 1mm earlier (higher Z).
            // We need to shift WCS Z up by 1mm so that the tip is effectively at the same logical Z.

            // The command `G10 L2 P0 Z[Current_WCS_Offset_Z + diff]` ?? No, too complex to read vars.
            // Easy way using relative move:
            // We are currently AT the probe trigger point.
            // The Reference Tool was AT the probe trigger point.
            // If we simply tell the machine "You are now at the same Z height as the reference tool was",
            // we implicitly adjust for the length difference.

            // Wait, we can't say "You are at Z=0". We don't know what Z was.
            // But we can say: Adjust the Z offset by `diff`.
            // G10 L20 P0 Z... sets the current position to value Z.
            // We need `G43.1 Z[diff]` (Dynamic Tool Length Offset). This is safest for GrblHAL.
            // However, `ioSender` often modifies the G54 Z offset.

            // Let's go with G43.1 (Dynamic Offset) if supported, or inform user.
            // Actually, safest generic Grbl way:
            // 1. Get current WCS Z value (from status report, handled in DRO).
            // 2. We don't have synchronous access to that here easily without callbacks.

            // Let's use the G92 (Temporary Offset) or just report it for now?
            // "ioSender" usually does: G10 L2 P{CurrentWCS} Z{NewZOffset}.

            // SIMPLIFIED LOGIC FOR THIS DEMO:
            // Assume we want to zero Z on top of stock using the difference.
            // If we probed Stock Z0 with Ref tool, and now we probe Ref point with New tool...

            // Let's implement G43.1 (TLO) as it's cleaner.
            this.ws.sendCommand(`G43.1 Z${diff.toFixed(3)}`);
            this.term.writeln(`\x1b[35m> Applied TLO (G43.1) Z${diff.toFixed(3)}\x1b[0m`);
        }
        this.activeRoutine = null;
        this._resetProbeTest();
    }

    // ==========================================
    // ROTATION (Angle Finding)
    // ==========================================
    runRotationProbe() {
        if (!this._requireProbeSafe()) return;
        this.saveSettings();
        const s = this.store.data.probe;
        this.activeRoutine = 'ROTATION';
        this.routineStep = 0;
        this.probeData = [];
        this.term.writeln(`\x1b[34m> Starting Rotation Probe (P1)...\x1b[0m`);

        // Probe P1 (Current Location)
        this.ws.sendCommand(`G91 G38.2 Y-20 F${s.feed}`);
        // Assuming we probe Y- direction (Front edge).
        // A full implementation would ask for Axis/Dir. For now, assume Front Edge (Y+ -> Y-).
    }

    stepRotation(coords) {
        const s = this.store.data.probe;

        if (this.routineStep === 0) {
            // P1 Done
            this.probeData.push({ x: coords[0], y: coords[1] });
            this.term.writeln(`\x1b[32m> P1 Recorded.\x1b[0m`);

            // Retract
            this.ws.sendCommand(`G91 G0 Y${s.retract}`);

            // Move to P2 X
            const dist = parseFloat(document.getElementById('rot-dist').value) || 50;
            this.ws.sendCommand(`G0 X${dist}`);

            // Prepare P2
            this.routineStep++;
            this.term.writeln(`\x1b[34m> Probing P2...\x1b[0m`);
            setTimeout(() => {
                this.ws.sendCommand(`G38.2 Y-${s.retract + 10} F${s.feed}`);
            }, 500);
        } else if (this.routineStep === 1) {
            // P2 Done
            const p1 = this.probeData[0];
            const p2 = { x: coords[0], y: coords[1] };

            // Retract
            this.ws.sendCommand(`G91 G0 Y${s.retract}`);
            this.ws.sendCommand(`G90`); // Back to absolute

            // Calculate Angle
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const rad = Math.atan2(dy, dx);
            const deg = rad * (180 / Math.PI);

            document.getElementById('rot-result').textContent = `${deg.toFixed(3)}°`;
            document.getElementById('rot-msg').textContent = "Physical alignment required.";
            this.term.writeln(`\x1b[35m> Angle Calculated: ${deg.toFixed(4)} degrees.\x1b[0m`);

            this.activeRoutine = null;
            this._resetProbeTest();
        }
    }

    // ==========================================
    // AUTO CORNER (Z surface + XY corner)
    // ==========================================
    stepAutoCorner(coords) {
        const s = this.store.data.probe;
        const isPlate = s.mode === 'plate';
        const zSet = isPlate ? s.plateThickness : 0;
        this.ws.sendCommand('G10 L20 P0 Z' + zSet.toFixed(3));
        this.ws.sendCommand('G0 Z' + s.retract);
        this.ws.sendCommand('G90');
        this.term.writeln('\x1b[32m> Z surface set. Starting corner probe...\x1b[0m');
        // Fall through to corner probe
        this.activeRoutine = 'OUTSIDE_CORNER';
        this.routineStep = 1;
        const corner = this.selections.outsideCorner;
        let xDirMult = (corner.includes('R')) ? 1 : -1;
        let yDirMult = (corner.includes('B')) ? 1 : -1;
        this.tempData = { xDir: xDirMult, yDir: yDirMult };
        // Start Z plunge for corner (step 1 handled by stepOutsideCorner)
        this.ws.sendCommand('G91 G38.2 Z-' + s.travel + ' F' + s.feed);
    }

    // ==========================================
    // EXISTING ROUTINES (Z, Single, Corner, Center)
    // ==========================================
    runZProbe() {
        if (!this._requireProbeSafe()) return;
        this.saveSettings();
        const s = this.store.data.probe;
        const isPlate = s.mode === 'plate';
        this.term.writeln(`\x1b[34m> Starting Z-Probe (${isPlate ? 'Plate' : 'Probe'})...\x1b[0m`);
        const zSet = isPlate ? s.plateThickness : 0;
        this.sendBatch(['G91', `G38.2 Z-${s.travel} F${s.feed}`, `G10 L20 P0 Z${zSet.toFixed(3)}`, `G0 Z${s.retract}`, 'G90']);
        this._resetProbeTest();
    }

    runSingleAxis(axis, dir) {
        if (!this._requireProbeSafe()) return;
        this.saveSettings();
        const s = this.store.data.probe;
        const isPlate = s.mode === 'plate';
        const rad = s.toolDiameter / 2;
        const plateOffset = isPlate ? s.xyPlateOffset : 0;
        const totalOffset = rad + plateOffset;
        const setVal = -(dir * totalOffset);
        this.term.writeln(`\x1b[34m> Probing ${axis}... (${isPlate ? 'Plate' : 'Probe'})\x1b[0m`);
        this.sendBatch(['G91', `G38.2 ${axis}${dir * s.travel} F${s.feed}`, `G10 L20 P0 ${axis}${setVal.toFixed(3)}`, `G0 ${axis}${-(dir * s.retract)}`, 'G90']);
        this._resetProbeTest();
    }

    runCornerProbe(type) {
        if (!this._requireProbeSafe()) return;
        if (type === 'Inside') {
            const reporter = window.reporter || (window.AlarmsAndErrors ? new window.AlarmsAndErrors(this.ws) : null);
            if (reporter) {
                reporter.showAlert('Not Implemented', 'Inside corner logic placeholder.');
            }
            this._resetProbeTest();
            return;
        }
        this.saveSettings();
        const corner = this.selections.outsideCorner;
        const s = this.store.data.probe;
        let xDirMult = (corner.includes('R')) ? 1 : -1;
        let yDirMult = (corner.includes('B')) ? 1 : -1;
        this.tempData = { xDir: xDirMult, yDir: yDirMult };
        this.activeRoutine = 'OUTSIDE_CORNER';
        this.routineStep = 1;
        this.term.writeln(`\x1b[34m> Outside Corner (${corner})...\x1b[0m`);
        this.ws.sendCommand(`G91 G38.2 Z-${s.travel} F${s.feed}`);
    }

    stepOutsideCorner(coords) {
        const s = this.store.data.probe;
        const isPlate = s.mode === 'plate';
        const rad = s.toolDiameter / 2;
        const xDir = this.tempData.xDir;
        const yDir = this.tempData.yDir;
        const clearance = isPlate ? (s.plateClearance || s.clearance) : (s.probeClearance || s.clearance);
        const moveDist = clearance + rad + (isPlate ? s.xyPlateOffset : 0) + 2;

        if (this.routineStep === 1) { // Z Done
            this.ws.sendCommand(`G10 L20 P0 Z${isPlate ? s.plateThickness : 0}`);
            this.ws.sendCommand(`G0 Z${s.retract}`);
            this.ws.sendCommand(`G0 X${(xDir * moveDist).toFixed(3)}`);
            this.ws.sendCommand(`G0 Z-${(s.retract + s.zDepth).toFixed(3)}`);
            setTimeout(() => { this.ws.sendCommand(`G38.2 X${(-xDir * s.travel).toFixed(3)} F${s.feed}`); }, 200);
            this.routineStep = 2; // Fixed step logic
        } else if (this.routineStep === 2) { // X Done
            const setX = -(-xDir * (rad + (isPlate ? s.xyPlateOffset : 0)));
            this.ws.sendCommand(`G10 L20 P0 X${setX.toFixed(3)}`);
            this.ws.sendCommand(`G0 X${(xDir * s.retract).toFixed(3)}`);
            this.ws.sendCommand(`G0 Z${(s.retract + s.zDepth).toFixed(3)}`);
            this.ws.sendCommand(`G90 G0 X0`);
            this.ws.sendCommand(`G91 G0 Y${(yDir * moveDist).toFixed(3)}`);
            this.ws.sendCommand(`G0 Z-${(s.retract + s.zDepth).toFixed(3)}`);
            setTimeout(() => { this.ws.sendCommand(`G38.2 Y${(-yDir * s.travel).toFixed(3)} F${s.feed}`); }, 200);
            this.routineStep = 3;
        } else if (this.routineStep === 3) { // Y Done
            const setY = -(-yDir * (rad + (isPlate ? s.xyPlateOffset : 0)));
            this.ws.sendCommand(`G10 L20 P0 Y${setY.toFixed(3)}`);
            this.ws.sendCommand(`G0 Y${(yDir * s.retract).toFixed(3)}`);
            this.ws.sendCommand(`G0 Z${(s.retract + s.zDepth).toFixed(3)}`);
            this.ws.sendCommand(`G90 G0 X0 Y0`);
            this.activeRoutine = null;
            this._resetProbeTest();
        }
    }

    // ==========================================
    // CENTER FINDER (Pocket & Feature)
    // ==========================================
    runPocketCenter() {
        if (!this._requireProbeSafe()) return;
        this.saveSettings();
        const s = this.store.data.probe;
        const isPlate = s.mode === 'plate';
        const clearance = isPlate ? (s.plateClearance || s.clearance) : (s.probeClearance || s.clearance);
        this.activeRoutine = 'POCKET';
        this.routineStep = 1;
        this.probeData = [];
        this.tempData = { clearance: clearance };
        this.term.writeln(`\x1b[34m> Starting Pocket Center (${s.featureW}x${s.featureH})...\x1b[0m`);
        // From center, move past expected X+ wall, then probe X- to find it from outside
        const mx = (s.featureW / 2) + clearance + s.toolDiameter;
        this.ws.sendCommand(`G91 G0 X${mx.toFixed(3)}`);
        this.ws.sendCommand(`G0 Z-${(s.retract + s.zDepth).toFixed(3)}`);
        setTimeout(() => { this.ws.sendCommand(`G38.2 X-${s.travel} F${s.feed}`); }, 200);
    }

    runFeatureCenter(t) {
        if (!this._requireProbeSafe()) return;
        this.saveSettings();
        const s = this.store.data.probe;
        const isPlate = s.mode === 'plate';
        const clearance = isPlate ? (s.plateClearance || s.clearance) : (s.probeClearance || s.clearance);
        this.activeRoutine = 'FEATURE';
        this.routineStep = 1;
        this.probeData = [];
        this.tempData = { type: t, clearance: clearance };
        this.term.writeln(`\x1b[34m> Starting ${t === 'Circ' ? 'Circular' : 'Rect'} Feature Center...\x1b[0m`);
        // Move past expected X+ wall, then probe X- to find it from outside
        const mx = (s.featureW / 2) + clearance + s.toolDiameter;
        this.ws.sendCommand(`G91 G0 X${mx.toFixed(3)}`);
        this.ws.sendCommand(`G0 Z-${(s.retract + s.zDepth).toFixed(3)}`);
        setTimeout(() => { this.ws.sendCommand(`G38.2 X-${s.travel} F${s.feed}`); }, 200);
    }

    stepPocket(c) { this.commonCenterStep(c, 'POCKET'); }
    stepFeature(c) { this.commonCenterStep(c, 'FEATURE'); }

    commonCenterStep(coords, type) {
        const s = this.store.data.probe;
        const isPlate = s.mode === 'plate';
        const clearance = this.tempData.clearance || (isPlate ? (s.plateClearance || s.clearance) : (s.probeClearance || s.clearance));
        this.probeData.push(coords);
        const len = this.probeData.length;

        if (len === 1 || len === 3) { // Hit a wall, go probe the opposite side
            const axis = (len === 1) ? 'X' : 'Y';
            const dim = (axis === 'X') ? s.featureW : s.featureH;
            const retract = s.retract;
            const backoff = (len === 1) ? `${axis}${retract}` : `${axis}${retract}`;

            if (type === 'FEATURE') {
                // Feature (outer): we hit the right/top wall, go to left/bottom side
                this.ws.sendCommand(`G0 ${backoff}`);
                this.ws.sendCommand(`G0 Z${(retract + s.zDepth).toFixed(3)}`);
                const traverse = dim + clearance * 2 + s.toolDiameter + 2;
                this.ws.sendCommand(`G0 ${axis}-${traverse.toFixed(3)}`);
                this.ws.sendCommand(`G0 Z-${(retract + s.zDepth).toFixed(3)}`);
                setTimeout(() => {
                    this.ws.sendCommand(`G38.2 ${axis}${s.travel} F${s.feed}`);
                }, 200);
            } else {
                // Pocket (inner): we hit the right/top wall from outside, go to opposite side
                this.ws.sendCommand(`G0 ${backoff}`);
                this.ws.sendCommand(`G0 Z${(retract + s.zDepth).toFixed(3)}`);
                const traverse = dim + clearance * 2 + s.toolDiameter + 2;
                this.ws.sendCommand(`G0 ${axis}-${traverse.toFixed(3)}`);
                this.ws.sendCommand(`G0 Z-${(retract + s.zDepth).toFixed(3)}`);
                setTimeout(() => {
                    this.ws.sendCommand(`G38.2 ${axis}${s.travel} F${s.feed}`);
                }, 200);
            }
        } else if (len === 2) { // Center X Found, go probe Y sides
            const cx = (this.probeData[0][0] + this.probeData[1][0]) / 2;
            this.ws.sendCommand(`G0 X-${s.retract}`);
            this.ws.sendCommand(`G0 Z${(s.retract + s.zDepth).toFixed(3)}`);
            this.ws.sendCommand(`G90 G0 X${cx.toFixed(3)}`);
            this.ws.sendCommand(`G91`);
            const my = (s.featureH / 2) + clearance + s.toolDiameter;
            this.ws.sendCommand(`G0 Y${my.toFixed(3)}`);
            this.ws.sendCommand(`G0 Z-${(s.retract + s.zDepth).toFixed(3)}`);
            setTimeout(() => {
                this.ws.sendCommand(`G38.2 Y-${s.travel} F${s.feed}`);
            }, 200);
        } else if (len === 4) { // Center Y Found, set WCS
            const cy = (this.probeData[2][1] + this.probeData[3][1]) / 2;
            this.ws.sendCommand(`G0 Y-${s.retract}`);
            this.ws.sendCommand(`G0 Z${(s.retract + s.zDepth).toFixed(3)}`);
            this.ws.sendCommand(`G90 G0 Y${cy.toFixed(3)}`);
            this.ws.sendCommand(`G10 L20 P0 X0 Y0`);
            this.activeRoutine = null;
            this.term.writeln(`\x1b[32m> Center Found & Set.\x1b[0m`);
        }
    }
    sendBatch(cmds) { cmds.forEach(c => this.ws.sendCommand(c)); }
}
