export class TroubleshootingHandler {
    constructor(ws, store) {
        this.ws = ws;
        this.store = store;
        this.lastPins = "";
        this.ina219Data = [];
        this.ina219Chart = null;
        this.maxDataPoints = 1000;
        this.pinDefs = {};        // by hardware ID (e.g. "HC595.1")
        this.pinDefsByPin = {};   // by pin number (e.g. "1" -> { hw, label, func })
        this.pinStateDIN = [];
        this.pinStateDOUT = [];
        this._collectingPinInfo = null;
        this.spindles = [];
        this._collectingSpindles = false;
        this._chainToSpindles = false;
        this.isOoznestBoard = false;
        this._computerInfoPromise = null;

        this.ws.on('connect', () => {
            setTimeout(() => {
                this._chainToSpindles = true;
                this.refreshPinInfo();
            }, 3000);
        });

        this.ws.on('line', (line) => {
            if (line.startsWith('[BOARD:Ooznest-CNC]') || line.startsWith('[BOARD:Ooznest-Motion-Control-Core]')) {
                this.isOoznestBoard = true;
            }
            if (this._collectingPinInfo === 'pins') {
                this._collectPinDef(line);
            } else if (this._collectingPinInfo === 'pinstate') {
                this._collectPinState(line);
            } else if (this._collectingSpindles) {
                this._collectSpindle(line);
            }
        });
    }

    sendLEDCommand(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const cmd = `M150 R${r} U${g} B${b}`;
        this.ws.sendCommand(cmd);
        const m150 = document.getElementById('led-m150-command');
        if (m150) m150.textContent = cmd;
    }

    ledPickerColor(hex) {
        this.sendLEDCommand(hex);
        const picker = document.getElementById('led-color-picker');
        if (picker) {
            const swatch = picker.parentElement;
            swatch.style.background = hex;
            swatch.style.borderStyle = 'solid';
        }
    }

    /**
     * Update the visual state of pin indicators
     * @param {string} pins - The Pn: string from grblHAL status report (e.g. "PXYZ")
     */
    updatePins(pins) {
        this.updateSignalVisibility();
        if (pins === this.lastPins) return;
        this.lastPins = pins;

        // All grblHAL Pn: signals
        // Limit switches: X, Y, Z, A, B, C, U, V, W
        // Probe: P (triggered)
        // Control: D (door), R (reset), H (hold), S (start), E (e-stop), L (block delete), T (optional stop), Q (single step)
        // Motor: M (warning), F (fault)
        const pinChars = ['X', 'Y', 'Z', 'A', 'B', 'C', 'U', 'V', 'W', 'P', 'D', 'R', 'H', 'S', 'E', 'L', 'T', 'Q', 'M', 'F'];

        pinChars.forEach(char => {
            const el = document.getElementById(`pin-indicator-${char}`);
            if (!el) return;

            const isActive = pins.includes(char);
            
            // Troubleshooting tab uses the .signal-badge class
            if (isActive) {
                el.classList.remove('signal-off');
                el.classList.add('signal-on');
                el.textContent = 'ON';
                
                // Color overrides for critical/warning pins
                if (['E', 'F'].includes(char)) {
                    // Critical Error (Red)
                    el.style.cssText = 'background:#fee2e2;color:#dc2626;border-color:#fca5a5;box-shadow:0 0 8px rgba(220,38,38,0.25)';
                } else if (['M'].includes(char)) {
                    // Warning (Yellow)
                    el.style.cssText = 'background:#fef9c3;color:#ca8a04;border-color:#fde047;box-shadow:0 0 8px rgba(202,138,4,0.2)';
                } else if (['X', 'Y', 'Z', 'A', 'B', 'C', 'U', 'V', 'W', 'D'].includes(char)) {
                    // Input/Safety (Soft Red)
                    el.style.cssText = 'background:#fee2e2;color:#dc2626;border-color:#fca5a5;box-shadow:0 0 8px rgba(220,38,38,0.2)';
                } else {
                    // Normal Active (Green)
                    el.style.cssText = '';
                }
            } else {
                el.classList.remove('signal-on');
                el.classList.add('signal-off');
                el.textContent = 'OFF';
                el.style.cssText = '';
            }
        });
    }

    selectProbeMode(mode) {
        if (!this.ws || !this.ws.isConnected) return;
        switch (mode) {
            case 'probe':
                this.ws.sendCommand('G65P5Q0');
                break;
            case 'tls':
                this.ws.sendCommand('G65P5Q1');
                break;
            case 'probe2':
                this.ws.sendCommand('G65P5Q2');
                break;
        }
    }

    updateINA219(voltage, current) {
        const now = Date.now();
        this.ina219Data.push({ voltage, current, t: now });
        if (this.ina219Data.length > this.maxDataPoints) {
            this.ina219Data.shift();
        }

        const voltageEl = document.getElementById('ina219-voltage');
        const currentEl = document.getElementById('ina219-current');
        if (voltageEl) voltageEl.textContent = voltage.toFixed(2);
        if (currentEl) currentEl.textContent = current.toFixed(2);

        this._updateINA219Chart();
    }

    _initINA219Chart() {
        const canvas = document.getElementById('ina219-chart');
        if (!canvas || this.ina219Chart) return;

        const powerTab = document.getElementById('trouble-tab-power');
        if (powerTab && powerTab.classList.contains('hidden')) return;

        const ctx = canvas.getContext('2d');
        this.ina219Chart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Voltage (V)',
                    data: [],
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37,99,235,0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.3,
                    fill: true,
                    yAxisID: 'y'
                }, {
                    label: 'Current (A)',
                    data: [],
                    borderColor: '#dc2626',
                    backgroundColor: 'rgba(220,38,38,0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.3,
                    fill: true,
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                layout: { padding: 0 },
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        type: 'linear',
                        display: false
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        min: 22,
                        max: 26,
                        ticks: { font: { size: 8 } },
                        title: { display: false },
                        grid: { drawOnChartArea: true }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        min: 0,
                        max: 5,
                        ticks: { font: { size: 8 } },
                        title: { display: false },
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        });
    }

    _updateINA219Chart() {
        if (this.ina219Data.length < 2) return;

        if (!this.ina219Chart) {
            this._initINA219Chart();
            if (!this.ina219Chart) return;
        }

        const maxPoints = Math.min(this.ina219Data.length, 300);
        const slice = this.ina219Data.slice(-maxPoints);
        const baseTime = slice[0].t;

        this.ina219Chart.data.datasets[0].data = slice.map(d => ({
            x: (d.t - baseTime) / 1000,
            y: d.voltage
        }));
        this.ina219Chart.data.datasets[1].data = slice.map(d => ({
            x: (d.t - baseTime) / 1000,
            y: d.current
        }));
        this.ina219Chart.update('none');
    }

    refreshPinInfo() {
        if (!this.ws || !this.ws.isConnected) return;
        this.pinDefs = {};
        this.pinDefsByPin = {};
        this.inputDefsByPin = {};
        this.outputDefsByPin = {};
        this.pinStateDIN = [];
        this.pinStateDOUT = [];
        document.getElementById('pin-info-content').innerHTML = '<div class="text-grey text-center py-4"><i class="bi bi-arrow-clockwise animate-spin"></i> Loading...</div>';
        this._collectingPinInfo = 'pins';
        this.ws.sendCommand('$pins');
    }

    _collectPinDef(line) {
        if (line === 'ok') {
            this._collectingPinInfo = 'pinstate';
            this.ws.sendCommand('$pinstate');
            return;
        }
        // [PIN:HC595.1,Aux out 5,P2 <- Flood enable (M8)]
        const m = line.match(/^\[PIN:([^,]+),([^\]]+)\]$/);
        if (m) {
            const hw = m[1];                    // "HC595.1"
            const desc = m[2];                  // "Aux out 5,P2 <- Flood enable (M8)"
            this.pinDefs[hw] = desc;

            // Extract useful parts: label, pin number, function
            const parts = desc.split(',');
            const label = parts[0] || hw;       // "Aux out 5"
            let pinId = null;
            let func = '';
            for (let i = 1; i < parts.length; i++) {
                const segment = parts[i];
                // Check for leading P-number: "P2 <- Flood enable (M8)"
                const pn = segment.match(/^P(\d+)/);
                if (pn) {
                    pinId = pn[1];               // "2"
                    // Extract function from the rest after P-number: "<- Flood enable (M8)"
                    const rest = segment.slice(pn[0].length).replace(/<-\s*/, '').replace(/\(.*?\)/g, '').trim();
                    if (rest) func = rest;
                } else {
                    // Plain function text, no P-number prefix
                    const f = segment.replace(/\(.*?\)/g, '').trim();
                    if (f) func = f;
                }
            }
            if (pinId) {
                this.pinDefsByPin[pinId] = { hw, label, func };
                const isOutput = hw.startsWith('HC595') || /\bout\b/i.test(label);
                if (isOutput) {
                    this.outputDefsByPin[pinId] = { hw, label, func };
                } else {
                    this.inputDefsByPin[pinId] = { hw, label, func };
                }
            }
        }
    }

    _collectPinState(line) {
        if (line === 'ok') {
            this._collectingPinInfo = null;
            if (this._chainToSpindles) {
                this._chainToSpindles = false;
                this.refreshSpindles();
            } else {
                this._renderPinInfo();
            }
            return;
        }
        // [PINSTATE:<type>|<description>|<id>|<mode>|<capabilities>|<state>]
        // description example: "P2 <- Flood enable (M8)"
        const parts = line.slice(1, -1).split('|');
        if (parts.length < 6) return;
        const desc = parts[1];
        // Extract real P-number from description, not the raw id field
        const pn = desc.match(/P(\d+)/);
        const realPin = pn ? pn[1] : parts[2];
        if (parts[0] === 'PINSTATE:DIN') {
            if (!this.pinStateDIN.some(e => e.pin === realPin)) {
                this.pinStateDIN.push({ name: desc, pin: realPin, id: parts[2], mode: parts[3], caps: parts[4], state: parts[5] });
            }
        } else if (parts[0] === 'PINSTATE:DOUT') {
            if (!this.pinStateDOUT.some(e => e.pin === realPin)) {
                this.pinStateDOUT.push({ name: desc, pin: realPin, id: parts[2], mode: parts[3], caps: parts[4], state: parts[5] });
            }
        }
    }

    toggleOutput(pinNum, on) {
        if (!this.ws || !this.ws.isConnected) return;
        if (on) {
            this.ws.sendCommand(`M64 P${pinNum}`);
        } else {
            this.ws.sendCommand(`M65 P${pinNum}`);
        }
        // Refresh pin state after a short delay to allow the command to process
        setTimeout(() => {
            this.pinStateDIN = [];
            this.pinStateDOUT = [];
            this._collectingPinInfo = 'pinstate';
            this.ws.sendCommand('$pinstate');
        }, 200);
    }

    _renderPinInfo() {
        const container = document.getElementById('pin-info-content');
        if (!container) return;

        let html = '';

        if (this.pinStateDIN.length) {
            html += '<div class="font-bold text-[10px] uppercase tracking-wider text-grey mb-2">Digital Inputs</div>';
            html += '<div class="grid gap-1 mb-4">';
            this.pinStateDIN.forEach(p => {
                const pinDef = this.inputDefsByPin[p.pin] || this.pinDefsByPin[p.pin];
                const label = pinDef ? pinDef.label : p.name;
                const hwInfo = pinDef ? pinDef.hw : '';
                const isOn = p.state === '1';
                html += `<div class="flex items-center gap-2 bg-grey-bg rounded px-2.5 py-1.5 border border-grey-light">
                    <span class="w-5 h-5 rounded-full shrink-0 ${isOn ? 'bg-green-500' : 'bg-grey-light'}"></span>
                    <span class="flex-1">
                        <span class="font-bold text-grey-dark text-xs">${label}</span>
                        ${hwInfo ? `<span class="text-grey text-[10px] ml-1.5">${hwInfo}</span>` : ''}
                    </span>
                    <span class="text-grey text-[10px]">P${p.pin}</span>
                    <span class="font-bold ${isOn ? 'text-green-600' : 'text-grey'}">${isOn ? '1' : '0'}</span>
                </div>`;
            });
            html += '</div>';
        }

        if (this.pinStateDOUT.length) {
            html += '<div class="font-bold text-[10px] uppercase tracking-wider text-grey mb-2">Digital Outputs</div>';
            html += '<div class="grid gap-1">';
            this.pinStateDOUT.forEach(p => {
                const pinDef = this.outputDefsByPin[p.pin] || this.pinDefsByPin[p.pin];
                const label = pinDef ? pinDef.label : p.name;
                const hwInfo = pinDef ? pinDef.hw : '';
                const func = pinDef ? pinDef.func : '';
                const isOn = p.state === '1';
                html += `<div class="flex items-center gap-2 bg-grey-bg rounded px-2.5 py-1.5 border border-grey-light">
                    <span class="w-4 h-4 rounded-full shrink-0 ${isOn ? 'bg-green-500' : 'bg-grey-light'}"></span>
                    <span class="flex-1 min-w-0">
                        <span class="font-bold text-grey-dark text-xs">${label}</span>
                        ${hwInfo ? `<span class="text-grey text-[10px] ml-1">${hwInfo}</span>` : ''}
                        ${func ? `<span class="text-[10px] font-bold text-primary ml-1">${func}</span>` : ''}
                    </span>
                    <span class="text-grey text-[10px] shrink-0 font-mono">P${p.pin}</span>
                    <div class="flex gap-1 shrink-0">
                        <button class="px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${isOn ? 'bg-grey-light text-grey cursor-default' : 'bg-green-500 text-white hover:bg-green-600'}" ${isOn ? 'disabled' : ''} onclick="window.troubleshooting.toggleOutput('${p.pin}', true)">ON</button>
                        <button class="px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${!isOn ? 'bg-grey-light text-grey cursor-default' : 'bg-red-500 text-white hover:bg-red-600'}" ${!isOn ? 'disabled' : ''} onclick="window.troubleshooting.toggleOutput('${p.pin}', false)">OFF</button>
                    </div>
                </div>`;
            });
            html += '</div>';
        }

        if (!this.pinStateDIN.length && !this.pinStateDOUT.length) {
            html = '<div class="text-grey italic text-center py-4">No pin data returned. Ensure the controller is connected and click <strong>Refresh</strong>.</div>';
        }

        container.innerHTML = html;
    }

    refreshSpindles() {
        if (!this.ws || !this.ws.isConnected) {
            if (window.showToast) window.showToast('Not connected', 'plug-zap', 'error');
            return;
        }
        this.spindles = [];
        document.getElementById('spindles-content').innerHTML = '<div class="text-grey text-center py-4"><i class="bi bi-arrow-clockwise animate-spin"></i> Loading...</div>';
        this._collectingSpindles = true;
        this.ws.sendCommand('$spindlesh');
    }

    _collectSpindle(line) {
        if (line === 'ok') {
            this._collectingSpindles = false;
            this._renderSpindles();
            if (window.updateLaserMode) setTimeout(window.updateLaserMode, 100);
            return;
        }
        const m = line.match(/^\[SPINDLE:([^\]]+)\]$/);
        if (m) {
            const parts = m[1].split('|');
            if (parts.length >= 5) {
                const id = parts[0];
                const spindleNum = parts[1];
                const type = parts[2];
                const caps = parts[3];
                const name = parts[4];
                const rpmRange = parts.length >= 6 ? parts[5] : null;
                const isActive = caps.includes('*');
                let typeLabel;
                if (this.isOoznestBoard) {
                    if (type === '2') typeLabel = 'RS485 VFD';
                    else if (name === 'PWM') typeLabel = 'Spindle (Analog, VFD10V)';
                    else if (name === 'PWM2') typeLabel = 'Laser';
                    else typeLabel = type === '0' ? 'PWM' : `Type ${type}`;
                } else {
                    typeLabel = type === '0' ? 'PWM' : type === '1' ? 'PWM' : type === '2' ? 'VFD' : `Type ${type}`;
                }
                this.spindles.push({ id, spindleNum, type, typeLabel, caps, name, rpmRange, isActive });
            }
        }
    }

    selectActiveSpindle(num) {
        if (!this.ws || !this.ws.isConnected) return;
        this.ws.sendCommand(`M104Q${num}`);
        this.spindles.forEach(s => s.isActive = s.spindleNum === String(num));
        this._renderSpindles();
    }

    spindleSpeed(speed) {
        if (!this.ws || !this.ws.isConnected) return;
        this.ws.sendCommand(`S${Math.round(speed)}`);
    }

    spindleOn(speed) {
        if (!this.ws || !this.ws.isConnected) return;
        this.ws.sendCommand(`M3 S${Math.round(speed)}`);
    }

    spindleOff() {
        if (!this.ws || !this.ws.isConnected) return;
        this.ws.sendCommand('M5');
    }

    _capabilityTags(caps) {
        const map = {
            'S': { label: 'At Speed', class: 'bg-grey-bg text-primary-dark' },
            'D': { label: 'Direction', class: 'bg-white text-primary-dark border border-grey-light' },
            'L': { label: 'Laser', class: 'bg-grey-bg text-secondary-dark' },
            'P': { label: 'PID', class: 'bg-white text-secondary-dark border border-grey-light' },
            'I': { label: 'Invert', class: 'bg-grey-bg text-grey-dark' },
            'R': { label: 'RPM Limits', class: 'bg-white text-grey-dark border border-grey-light' },
            'V': { label: 'Variable Speed', class: 'bg-grey-bg text-primary-dark' },
            'E': { label: 'Encoder', class: 'bg-white text-primary-dark border border-grey-light' },
        };
        return Object.entries(map)
            .filter(([ch]) => caps.includes(ch))
            .map(([, v]) => `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${v.class}">${v.label}</span>`)
            .join('');
    }

    _renderSpindles() {
        const container = document.getElementById('spindles-content');
        if (!container) return;

        if (!this.spindles.length) {
            container.innerHTML = '<div class="text-grey italic text-center py-4">No spindle data returned.</div>';
            return;
        }

        let html = '<div class="grid gap-2">';
        this.spindles.forEach(s => {
            const isEnabled = s.spindleNum !== '-';

            let rpmHtml = '';
            if (s.rpmRange) {
                const [minRpm, maxRpm] = s.rpmRange.split(',');
                rpmHtml = `<span class="text-grey text-[10px]"><span class="font-bold">${minRpm}</span> – <span class="font-bold">${maxRpm}</span> RPM</span>`;
            }

            html += `<div class="bg-grey-bg rounded-lg border ${s.isActive ? 'border-primary/40 ring-1 ring-primary/20' : 'border-grey-light'} p-3">
                <div class="flex items-center justify-between mb-1.5">
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-sm">${s.name}</span>
                        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${s.typeLabel === 'VFD' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}">${s.typeLabel}</span>
                        ${s.isActive ? '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700">Active</span>' : ''}
                    </div>
                    <span class="text-[10px] text-grey">#${s.id}</span>
                </div>
                <div class="flex items-center gap-2 mb-2 flex-wrap">
                    ${this._capabilityTags(s.caps.replace('*', ''))}
                    ${s.rpmRange ? `<span class="text-grey text-[10px]">&#8226;</span> ${rpmHtml}` : ''}
                </div>
                <div class="flex items-center gap-3 pt-1 border-t border-grey-light/60">
                    <label class="flex items-center gap-1 cursor-pointer ${!isEnabled ? 'opacity-40 pointer-events-none' : ''}">
                        <input type="radio" name="active-spindle" value="${s.spindleNum}"
                            ${s.isActive ? 'checked' : ''} ${!isEnabled ? 'disabled' : ''}
                            onchange="window.troubleshooting.selectActiveSpindle(${s.spindleNum})"
                            class="accent-primary w-3.5 h-3.5 cursor-pointer">
                        <span class="text-[10px] font-bold text-grey-dark">Set Active</span>
                    </label>
                    ${!isEnabled ? '<span class="text-[10px] text-grey italic">Not enabled in settings</span>' : ''}
                </div>
                ${s.isActive && s.rpmRange ? (() => {
                    const maxRpm = parseFloat(s.rpmRange.split(',')[1]) || 1000;
                    const halfRpm = Math.round(maxRpm / 2);
                    return `
                    <div class="flex items-center gap-2 pt-1.5 border-t border-grey-light/60 mt-1.5">
                        <input type="range" min="0" max="${maxRpm}" value="${halfRpm}" step="1"
                            id="spindle-speed-${s.id}"
                            oninput="document.getElementById('spindle-speed-val-${s.id}').textContent=this.value; window.troubleshooting.spindleSpeed(this.value)"
                            class="flex-1 h-1.5 accent-primary cursor-pointer">
                        <span id="spindle-speed-val-${s.id}" class="text-xs font-bold text-grey-dark w-16 text-right font-mono">${halfRpm}</span>
                        <span class="text-[10px] font-bold text-grey">RPM</span>
                        <button class="px-3 py-1.5 rounded text-xs font-bold bg-green-500 text-white hover:bg-green-600 shadow-sm"
                            onclick="window.troubleshooting.spindleOn(document.getElementById('spindle-speed-${s.id}').value)">ON</button>
                        <button class="px-3 py-1.5 rounded text-xs font-bold bg-red-500 text-white hover:bg-red-600 shadow-sm"
                            onclick="window.troubleshooting.spindleOff()">OFF</button>
                    </div>`;
                })() : ''}
            </div>`;
        });
        html += '</div>';

        container.innerHTML = html;
    }

    onPowerTabShown() {
        if (this.ina219Chart) {
            this.ina219Chart.resize();
        } else if (this.ina219Data.length >= 2) {
            this._initINA219Chart();
            this._updateINA219Chart();
        }
    }

    hasAAxis() {
        const axisCount = window.dro?.mpos?.length || window.dro?.wpos?.length || 0;
        return axisCount > 3;
    }

    updateAxisVisibility() {
        const aRow = document.getElementById('trouble-limit-row-a');
        if (!aRow) return;
        const showA = this.hasAAxis();
        aRow.classList.toggle('hidden', !showA);
        aRow.classList.toggle('flex', showA);
    }

    _setSignalRowVisible(signalKey, visible) {
        const row = document.getElementById(`trouble-signal-row-${signalKey}`);
        if (!row) return;
        row.classList.toggle('hidden', !visible);
        row.classList.toggle('flex', visible);
    }

    _resetSignalVisibility() {
        ['d', 'r', 'h', 's', 'e', 'l', 't', 'q', 'p', 'm', 'f'].forEach(signalKey => {
            this._setSignalRowVisible(signalKey, true);
        });
    }

    _getAvailableControlSignals() {
        const format = window.grblSettings?.settings?.['14']?.format;
        if (!format) return null;

        const parts = format.split(',').map(part => part.trim());
        if (!parts.length) return null;

        // $14 control mask ordering:
        // 0=Reset, 1=Feed hold, 2=Cycle start, 3=Safety door,
        // 4=Block delete, 5=Stop disable, 6=E-Stop, 7=Probe connected
        // Some drivers expose a 9th field for Motor fault in $ES metadata.
        const hasSignal = (index) => !!parts[index] && parts[index] !== 'N/A';

        return {
            r: hasSignal(0),
            h: hasSignal(1),
            s: hasSignal(2),
            d: hasSignal(3),
            l: hasSignal(4),
            t: hasSignal(5),
            e: hasSignal(6),
            p: hasSignal(7),
            f: hasSignal(8)
        };
    }

    updateSignalVisibility() {
        this._resetSignalVisibility();

        const availability = this._getAvailableControlSignals();
        if (!availability) return;

        this._setSignalRowVisible('r', availability.r);
        this._setSignalRowVisible('h', availability.h);
        this._setSignalRowVisible('s', availability.s);
        this._setSignalRowVisible('d', availability.d);
        this._setSignalRowVisible('l', availability.l);
        this._setSignalRowVisible('t', availability.t);
        this._setSignalRowVisible('e', availability.e);
        this._setSignalRowVisible('p', true);
        this._setSignalRowVisible('f', availability.f);

        // Not represented in $14 metadata here, so hide when driver metadata is available.
        this._setSignalRowVisible('q', false);
        this._setSignalRowVisible('m', false);
    }

    updateHoming(mask) {
        const container = document.getElementById('homing-status-content');
        if (!container) return;
        this.updateAxisVisibility();
        const mapping = this.hasAAxis() ? ['X', 'Y', 'Z', 'A'] : ['X', 'Y', 'Z'];
        let html = '<div class="bg-white rounded-xl shadow-soft border border-grey-light overflow-hidden">';
        html += '<div class="px-4 py-2.5 border-b border-grey-light flex items-center gap-2">';
        html += '<h3 class="font-bold text-secondary-dark text-xs uppercase tracking-wider">Homing Status</h3>';
        html += '</div><div class="divide-y divide-grey-light/60">';
        mapping.forEach((axis, i) => {
            const isHomed = (mask >> i) & 1;
            html += `<div class="flex items-center gap-2 px-3 py-2">
                <span class="text-xs font-bold text-grey-dark flex-1">${axis} Axis</span>
                <span class="signal-badge ${isHomed ? 'signal-on' : 'signal-off'}"
                    style="${isHomed ? 'background:#dcfce7;color:#16a34a;border-color:#86efac;' : ''}">${isHomed ? 'HOMED' : '—'}</span>
            </div>`;
        });
        html += '</div></div>';
        container.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    }

    _escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    _runtimeLabel() {
        if (window.electron) return 'Electron Desktop';
        if (window.cordova) return 'Cordova Mobile';
        return 'Web Browser';
    }

    _platformLabel() {
        const uaPlatform = navigator.userAgentData?.platform || navigator.platform || '';
        const ua = navigator.userAgent || '';
        const source = `${uaPlatform} ${ua}`.toLowerCase();

        if (source.includes('windows')) return 'Windows';
        if (source.includes('mac')) return 'macOS';
        if (source.includes('android')) return 'Android';
        if (source.includes('iphone') || source.includes('ipad') || source.includes('ios')) return 'iOS';
        if (source.includes('linux')) return 'Linux';
        return uaPlatform || 'Unknown';
    }

    _browserLabel() {
        const ua = navigator.userAgent || '';
        if (window.electron) return 'Electron';
        if (window.cordova) return 'Cordova WebView';
        if (ua.includes('Edg/')) return 'Microsoft Edge';
        if (ua.includes('Chrome/')) return 'Google Chrome';
        if (ua.includes('Firefox/')) return 'Mozilla Firefox';
        if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
        return 'Browser';
    }

    async _collectComputerInfo() {
        const locationHost = window.location.hostname || 'local';
        const locationOrigin = window.location.origin && window.location.origin !== 'null'
            ? window.location.origin
            : window.location.href;

        let scanRanges = [];
        if (window.ws?._getPreferredScanSubnets) {
            try {
                scanRanges = await window.ws._getPreferredScanSubnets();
            } catch (e) {
                console.error('Failed to load scan ranges for troubleshooting info:', e);
            }
        }

        let adapters = [];
        if (window.electron?.getNetworkInfo) {
            try {
                adapters = await window.electron.getNetworkInfo();
            } catch (e) {
                console.error('Failed to load native network info for troubleshooting info:', e);
            }
        }

        return {
            runtime: this._runtimeLabel(),
            os: this._platformLabel(),
            browser: this._browserLabel(),
            language: navigator.language || 'Unknown',
            online: navigator.onLine ? 'Yes' : 'No',
            screen: window.screen ? `${window.screen.width} x ${window.screen.height}` : 'Unknown',
            cores: navigator.hardwareConcurrency || null,
            memory: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : null,
            host: locationHost,
            origin: locationOrigin,
            userAgent: navigator.userAgent || 'Unknown',
            adapters,
            scanRanges
        };
    }

    async getComputerInfo() {
        if (!this._computerInfoPromise) {
            this._computerInfoPromise = this._collectComputerInfo().finally(() => {
                this._computerInfoPromise = null;
            });
        }
        return this._computerInfoPromise;
    }

    async renderInfoTab() {
        if (window.configWizard?.renderInfoTab) {
            await window.configWizard.renderInfoTab();
        }
    }

    _infoRow(label, value) {
        if (value === null || value === undefined || value === '') return '';
        return `<div class="flex justify-between gap-4">
            <span class="text-xs text-grey">${this._escapeHtml(label)}</span>
            <span class="text-xs font-bold text-secondary-dark text-right break-all">${this._escapeHtml(value)}</span>
        </div>`;
    }

    renderComputerInfoCard(info) {
        let html = '<div class="bg-white rounded-xl shadow-soft border border-grey-light overflow-hidden">';
        html += '<div class="px-4 py-2.5 border-b border-grey-light flex items-center gap-2">';
        html += '<h3 class="font-bold text-secondary-dark text-xs uppercase tracking-wider">Computer</h3>';
        html += '</div><div class="p-4 space-y-2">';

        html += this._infoRow('Runtime', info.runtime);
        html += this._infoRow('OS', info.os);
        html += this._infoRow('Browser', info.browser);
        html += this._infoRow('Language', info.language);
        html += this._infoRow('Online', info.online);
        html += this._infoRow('Screen', info.screen);
        html += this._infoRow('CPU Cores', info.cores);
        html += this._infoRow('Memory', info.memory);
        html += this._infoRow('Host', info.host);

        if (info.adapters?.length) {
            html += '<div class="pt-2 border-t border-grey-light/60">';
            html += '<div class="text-[10px] font-bold text-grey uppercase mb-2">Network Adapters</div>';
            html += '<div class="space-y-2">';
            info.adapters.forEach(adapter => {
                html += `<div class="rounded-lg border border-grey-light bg-grey-bg px-3 py-2">
                    <div class="text-xs font-bold text-secondary-dark">${this._escapeHtml(adapter.name || 'Adapter')}</div>
                    <div class="text-[11px] text-grey-dark font-mono break-all">${this._escapeHtml(adapter.address || '')}</div>
                    <div class="text-[10px] text-grey">Mask ${this._escapeHtml(adapter.netmask || 'Unknown')}${adapter.cidr ? ` • ${this._escapeHtml(adapter.cidr)}` : ''}</div>
                </div>`;
            });
            html += '</div></div>';
        }

        if (info.scanRanges?.length) {
            html += '<div class="pt-2 border-t border-grey-light/60">';
            html += '<div class="text-[10px] font-bold text-grey uppercase mb-2">Scanner Ranges</div>';
            html += '<div class="space-y-1">';
            info.scanRanges.forEach(range => {
                const label = range.label || `${range.subnet}.x`;
                html += `<div class="text-xs font-mono text-secondary-dark">${this._escapeHtml(label)}</div>`;
            });
            html += '</div></div>';
        }

        if (!info.adapters?.length && !info.scanRanges?.length) {
            html += '<div class="text-xs text-grey">Local network adapter details are not available in this runtime.</div>';
        }

        html += '<details class="pt-2 border-t border-grey-light/60">';
        html += '<summary class="text-[10px] font-bold text-grey uppercase cursor-pointer">User Agent</summary>';
        html += `<div class="mt-2 text-[10px] text-grey break-all">${this._escapeHtml(info.userAgent)}</div>`;
        html += '</details>';

        html += '</div></div>';
        return html;
    }

    refresh() {
        // Troubleshooting is passive (updates from status reports), 
        // but we could request a full status here if needed.
        this.updateAxisVisibility();
        this.updateSignalVisibility();
        if (window.requestFullStatus) window.requestFullStatus();
        this.renderInfoTab().catch(err => console.error('Failed to refresh troubleshooting info tab:', err));
    }
}
