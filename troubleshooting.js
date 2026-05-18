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

        this.ws.on('connect', () => {
            setTimeout(() => {
                this._chainToSpindles = true;
                this.refreshPinInfo();
            }, 3000);
        });

        this.ws.on('line', (line) => {
            if (line.startsWith('[BOARD:Ooznest-CNC]')) {
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
                const pn = parts[i].match(/^P(\d+)/);
                if (pn) {
                    pinId = pn[1];               // "2"
                } else {
                    // Extract function name (before arrow, strip parentheses)
                    func = parts[i].replace(/<-\s*/, '').replace(/\(.*?\)/g, '').trim();
                }
            }
            if (pinId) {
                this.pinDefsByPin[pinId] = { hw, label, func };
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
        const parts = line.slice(1, -1).split('|');
        if (parts[0] === 'PINSTATE:DIN' && parts.length >= 6) {
            this.pinStateDIN.push({ name: parts[1], pin: parts[2], func: parts[3], mode: parts[4], state: parts[5] });
        } else if (parts[0] === 'PINSTATE:DOUT' && parts.length >= 6) {
            this.pinStateDOUT.push({ name: parts[1], pin: parts[2], func: parts[3], mode: parts[4], state: parts[5] });
        }
    }

    toggleOutput(pinNum, on) {
        if (!this.ws || !this.ws.isConnected) return;
        if (on) {
            this.ws.sendCommand(`M65 P${pinNum}`);
        } else {
            this.ws.sendCommand(`M64 P${pinNum}`);
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
                const pinDef = this.pinDefsByPin[p.pin];
                const label = pinDef ? pinDef.label : p.name;
                const hwInfo = pinDef ? pinDef.hw : '';
                const isOn = p.state === '1';
                html += `<div class="flex items-center gap-2 bg-grey-bg rounded px-2.5 py-1.5 border border-grey-light">
                    <span class="w-5 h-5 rounded-full shrink-0 ${isOn ? 'bg-green-500' : 'bg-grey-light'}"></span>
                    <span class="flex-1">
                        <span class="font-bold text-secondary-dark">${label}</span>
                        ${hwInfo ? `<span class="text-grey text-[10px] ml-1.5">${hwInfo}</span>` : ''}
                    </span>
                    <span class="text-grey text-[10px]">Pin ${p.pin}</span>
                    <span class="font-bold ${isOn ? 'text-green-600' : 'text-grey'}">${isOn ? '1' : '0'}</span>
                </div>`;
            });
            html += '</div>';
        }

        if (this.pinStateDOUT.length) {
            html += '<div class="font-bold text-[10px] uppercase tracking-wider text-grey mb-2">Digital Outputs</div>';
            html += '<div class="grid gap-1">';
            this.pinStateDOUT.forEach(p => {
                const pinDef = this.pinDefsByPin[p.pin];
                const label = pinDef ? pinDef.label : p.name;
                const hwInfo = pinDef ? pinDef.hw : '';
                const func = pinDef ? pinDef.func : '';
                const isPx = /^\d+$/.test(p.pin);
                const isOn = p.state === '1';
                html += `<div class="flex items-center gap-2 bg-grey-bg rounded px-2.5 py-1.5 border border-grey-light">
                    <span class="w-5 h-5 rounded-full shrink-0 ${isOn ? 'bg-green-500' : 'bg-grey-light'}"></span>
                    <span class="flex-1 min-w-0">
                        <span class="font-bold text-secondary-dark text-[11px]">${label}</span>
                        ${hwInfo ? `<span class="text-grey text-[10px] ml-1">${hwInfo}</span>` : ''}
                        ${func ? `<span class="text-[10px] font-bold text-primary ml-1">${func}</span>` : ''}
                    </span>
                    <span class="text-grey text-[10px] shrink-0">P${p.pin}</span>
                    ${isPx ? `<div class="flex gap-1 shrink-0">
                        <button class="px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${isOn ? 'bg-grey-light text-grey cursor-default' : 'bg-green-500 text-white hover:bg-green-600'}" ${isOn ? 'disabled' : ''} onclick="window.troubleshooting.toggleOutput('${p.pin}', true)">ON</button>
                        <button class="px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${!isOn ? 'bg-grey-light text-grey cursor-default' : 'bg-red-500 text-white hover:bg-red-600'}" ${!isOn ? 'disabled' : ''} onclick="window.troubleshooting.toggleOutput('${p.pin}', false)">OFF</button>
                    </div>` : `<span class="font-bold text-xs ${isOn ? 'text-green-600' : 'text-grey'}">${isOn ? '1' : '0'}</span>`}
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
        if (!this.ws || !this.ws.isConnected) return;
        this.spindles = [];
        document.getElementById('spindles-content').innerHTML = '<div class="text-grey text-center py-4"><i class="bi bi-arrow-clockwise animate-spin"></i> Loading...</div>';
        this._collectingSpindles = true;
        this.ws.sendCommand('$spindlesh');
    }

    _collectSpindle(line) {
        if (line === 'ok') {
            this._collectingSpindles = false;
            this._renderSpindles();
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

    refresh() {
        // Troubleshooting is passive (updates from status reports), 
        // but we could request a full status here if needed.
        if (window.requestFullStatus) window.requestFullStatus();
    }
}
