export class ConfigWizard {
    constructor(ws, store) {
        console.log('[ConfigWizard] constructor');
        this.ws = ws;
        this.store = store;
        this.machines = [];
        this.spindles = {};
        this.modbusProtocols = {};
        this.verInfo = null;
        this.optInfo = null;
        this.numInfo = null;
        this.axsInfo = null;
        this.plgInfo = null;
        this.enInfo = null;
        this.boardInfo = null;
        this._collectingVer = false;
        this._verLines = [];
        this._expandedMachineCat = null;
        this.wizardStep = 0;
        this.wizardData = {
            machine: null,
            toolheads: {
                spindle: null,
                vfdModbusEnabled: false,
                vfdModbus: null,
                laser: false
            },
            probeType: 'ooznest',
            plateThickness: 10,
            xyPlateOffset: 10,
            dustShoe: false,
            enclosure: false
        };
        this.loadMachineJson();
    }

    async loadMachineJson() {
        try {
            const resp = await fetch('./machine.json');
            if (resp.ok) {
                const data = await resp.json();
                this.machines = data.machines || [];
                this.spindles = data.spindles || {};
                this.modbusProtocols = data.modbusProtocols || {};
            }
        } catch (e) {
            console.warn('[ConfigWizard] Failed to load machine.json:', e);
        }
    }

    startCollecting() {
        console.log('[ConfigWizard] startCollecting');
        this._collectingVer = true;
        this._verLines = [];
        this.verInfo = null;
        this.optInfo = null;
        this.numInfo = null;
        this.axsInfo = null;
        this.plgInfo = null;
        this.enInfo = null;
        this.boardInfo = null;
    }

    handleLine(line) {
        if (line.startsWith('[VER:')) {
            this.startCollecting();
            this._parseVerLine(line);
            window.term.writeln(line);
            return true;
        }
        if (!this._collectingVer) return false;

        window.term.writeln(line);
        if (line.startsWith('[OPT:')) {
            this.optInfo = line;
        } else if (line.startsWith('[NUM:')) {
            this.numInfo = line;
        } else if (line.startsWith('[AXS:')) {
            this.axsInfo = line;
        } else if (line.startsWith('[PLG:')) {
            this.plgInfo = line;
        } else if (line.startsWith('[EN:')) {
            this.enInfo = line;
        } else if (line.startsWith('[BOARD:')) {
            this.boardInfo = line.slice(7, -1);
        } else if (line === 'ok') {
            console.log('[ConfigWizard] $I+ collection complete');
            this._collectingVer = false;
            this._onVerComplete();
        }
        return true;
    }

    _parseVerLine(line) {
        this._verLines.push(line);
        const content = line.slice(1, -1);
        const colonIdx = content.indexOf(':');
        if (colonIdx === -1) return;
        const rest = content.slice(colonIdx + 1);
        const secondColon = rest.indexOf(':');
        let version, configName;
        if (secondColon === -1) {
            version = rest;
            configName = '';
        } else {
            version = rest.slice(0, secondColon);
            configName = rest.slice(secondColon + 1);
        }
        this.verInfo = { version, configName };
    }

    _onVerComplete() {
        console.log('[ConfigWizard] _onVerComplete', this.verInfo);
        if (!this.verInfo) return;
        this.renderInfoTab();
        if (this.verInfo.configName === 'UNCONFIGURED') {
            setTimeout(() => this.showWizard(), 500);
        }
    }

    // --- Info Tab Rendering ---

    renderInfoTab() {
        const container = document.getElementById('trouble-tab-info-content');
        if (!container) return;

        const v = this.verInfo;
        let html = '<div class="space-y-4">';

        // Firmware card
        html += '<div class="bg-white rounded-xl shadow-soft border border-grey-light overflow-hidden">';
        html += '<div class="px-4 py-2.5 border-b border-grey-light bg-grey-bg flex items-center gap-2">';
        html += '<i class="bi bi-cpu text-primary text-xs"></i>';
        html += '<h3 class="font-bold text-secondary-dark text-xs uppercase tracking-wider">Firmware</h3>';
        html += '</div><div class="p-4 space-y-2">';
        if (v) {
            html += `<div class="flex justify-between"><span class="text-xs text-grey">Version</span><span class="text-xs font-bold text-secondary-dark">${v.version || 'Unknown'}</span></div>`;
            html += `<div class="flex justify-between"><span class="text-xs text-grey">Machine Config</span><span class="text-xs font-bold ${v.configName === 'UNCONFIGURED' ? 'text-red-500' : 'text-secondary-dark'}">${v.configName || 'None'}</span></div>`;
        }
        if (this.boardInfo) {
            html += `<div class="flex justify-between"><span class="text-xs text-grey">Board</span><span class="text-xs font-bold text-secondary-dark">${this.boardInfo}</span></div>`;
        }
        html += '</div></div>';

        // Axes card
        if (this.axsInfo) {
            html += '<div class="bg-white rounded-xl shadow-soft border border-grey-light overflow-hidden">';
            html += '<div class="px-4 py-2.5 border-b border-grey-light bg-grey-bg flex items-center gap-2">';
            html += '<i class="bi bi-arrows-move text-primary text-xs"></i>';
            html += '<h3 class="font-bold text-secondary-dark text-xs uppercase tracking-wider">Axes & Travel</h3>';
            html += '</div><div class="p-4">';
            const axsContent = this.axsInfo.slice(1, -1).split(':')[1] || '';
            const parts = axsContent.split(',');
            if (parts.length >= 4) {
                const axes = parts[0];
                html += '<div class="grid grid-cols-2 gap-2">';
                for (let i = 0; i < axes.length && (i + 1) * 3 + 1 <= parts.length; i++) {
                    const axis = axes[i];
                    const travel = parts[i * 3 + 1];
                    if (travel) {
                        html += `<div class="flex justify-between"><span class="text-xs text-grey">${axis} Max Travel</span><span class="text-xs font-bold text-secondary-dark">${parseFloat(travel).toFixed(0)} mm</span></div>`;
                    }
                }
                html += '</div>';
            }
            html += '</div></div>';
        }

        // App version card
        html += '<div class="bg-white rounded-xl shadow-soft border border-grey-light overflow-hidden">';
        html += '<div class="px-4 py-2.5 border-b border-grey-light bg-grey-bg flex items-center gap-2">';
        html += '<i class="bi bi-phone text-primary text-xs"></i>';
        html += '<h3 class="font-bold text-secondary-dark text-xs uppercase tracking-wider">Application</h3>';
        html += '</div><div class="p-4 space-y-2">';
        html += `<div class="flex justify-between"><span class="text-xs text-grey">Version</span><span class="text-xs font-bold text-secondary-dark">${document.title.replace('Ooznest Control ', '') || 'Unknown'}</span></div>`;
        html += `<div class="flex justify-between"><span class="text-xs text-grey">Platform</span><span class="text-xs font-bold text-secondary-dark">${window.electron ? 'Desktop' : window.cordova ? 'Mobile' : 'Web'}</span></div>`;
        html += '</div></div>';

        // Options card
        if (this.optInfo) {
            html += '<div class="bg-white rounded-xl shadow-soft border border-grey-light overflow-hidden">';
            html += '<div class="px-4 py-2.5 border-b border-grey-light bg-grey-bg flex items-center gap-2">';
            html += '<i class="bi bi-gear text-primary text-xs"></i>';
            html += '<h3 class="font-bold text-secondary-dark text-xs uppercase tracking-wider">Options</h3>';
            html += '</div><div class="p-4">';
            html += `<span class="text-xs text-grey">${this.optInfo.slice(1, -1)}</span>`;
            html += '</div></div>';
        }

        if (v && v.configName === 'UNCONFIGURED') {
            html += '<button onclick="window.configWizard.showWizard()" class="w-full py-3 rounded-lg font-bold text-sm bg-primary text-white hover:bg-primary-dark transition-colors shadow-sm">Run Configuration Wizard</button>';
        }

        html += '</div>';
        container.innerHTML = html;
    }

    // --- Wizard Modal ---

    showWizard() {
        console.log('[ConfigWizard] showWizard');
        this.wizardStep = 0;
        this.wizardData.machine = null;
        this.wizardData.toolheads = { spindle: null, vfdModbusEnabled: false, vfdModbus: null, laser: false };
        this.wizardData.customWidth = 500;
        this.wizardData.customLength = 500;
        this.wizardData.customDrives = { x: 'belt', y: 'belt', z: 'belt' };
        this.wizardData.customBeltPitch = { x: 2, y: 2, z: 2 };
        this.wizardData.customPulleyTeeth = { x: 20, y: 20, z: 20 };
        this.wizardData.customLead = { x: 5, y: 5, z: 5 };
        this.wizardData.customEndstops = { x: 'min', y: 'min', z: 'min' };
        const overlay = document.getElementById('config-wizard-overlay');
        if (overlay) {
            console.log('[ConfigWizard] Removing hidden class from overlay');
            overlay.classList.remove('hidden');
        } else {
            console.warn('[ConfigWizard] overlay element not found');
        }
        this._renderWizardStep();
    }

    hideWizard() {
        console.log('[ConfigWizard] hideWizard');
        const overlay = document.getElementById('config-wizard-overlay');
        if (overlay) overlay.classList.add('hidden');
    }

    _renderWizardStep() {
        console.log('[ConfigWizard] _renderWizardStep step=' + this.wizardStep);
        const container = document.getElementById('config-wizard-body');
        if (!container) { console.warn('[ConfigWizard] config-wizard-body not found'); return; }
        if (!container) return;

        const steps = ['Machine', 'Toolhead', 'Probe Plate', 'Dust Shoe', 'Enclosure', 'Apply'];
        const totalSteps = steps.length;

        let html = '';

        // Step indicator
        html += '<div class="flex items-center gap-1 mb-6 px-1">';
        steps.forEach((label, i) => {
            const isActive = i === this.wizardStep;
            const isDone = i < this.wizardStep;
            html += `<div class="flex items-center ${i > 0 ? 'flex-1' : ''}">`;
            if (i > 0) {
                html += `<div class="h-0.5 flex-1 ${isDone ? 'bg-primary' : 'bg-grey-light'}"></div>`;
            }
            html += `<div class="flex items-center gap-1.5 px-2 py-1 rounded-lg ${isActive ? 'bg-primary text-white' : isDone ? 'text-primary' : 'text-grey'} transition-colors whitespace-nowrap">`;
            if (isDone) {
                html += '<i class="bi bi-check-circle-fill text-xs"></i>';
            } else {
                html += `<span class="w-5 h-5 rounded-full ${isActive ? 'bg-white/20' : 'bg-grey-light'} flex items-center justify-center text-[10px] font-bold ${isActive ? 'text-white' : 'text-grey'}">${i + 1}</span>`;
            }
            html += `<span class="text-[10px] font-bold ${isActive ? '' : 'hidden md:inline'}">${label}</span>`;
            html += '</div>';
            html += '</div>';
        });
        html += '</div>';

        // Step content
        html += '<div class="min-h-[200px]">';
        switch (this.wizardStep) {
            case 0: html += this._renderMachineStep(); break;
            case 1: html += this._renderRouterStep(); break;
            case 2: html += this._renderProbePlateStep(); break;
            case 3: html += this._renderDustShoeStep(); break;
            case 4: html += this._renderEnclosureStep(); break;
            case 5: html += this._renderApplyStep(); break;
        }
        html += '</div>';

        // Navigation buttons
        html += '<div class="flex justify-between mt-6 pt-4 border-t border-grey-light">';
        if (this.wizardStep > 0) {
            html += `<button onclick="window.configWizard._prevStep()" class="px-4 py-2 rounded-lg text-xs font-bold text-grey-dark border border-grey-light hover:bg-grey-bg transition-colors">Back</button>`;
        } else {
            html += '<div></div>';
        }
        if (this.wizardStep < totalSteps - 1) {
            const disabled = !this._canProceed();
            html += `<button onclick="window.configWizard._nextStep()" class="px-6 py-2 rounded-lg text-xs font-bold ${disabled ? 'bg-grey-light text-grey cursor-not-allowed' : 'bg-primary text-white hover:bg-primary-dark'} transition-colors shadow-sm" ${disabled ? 'disabled' : ''}>Continue</button>`;
        } else {
            html += `<button onclick="window.configWizard._applyConfig()" class="px-6 py-2 rounded-lg text-xs font-bold bg-green-500 text-white hover:bg-green-600 transition-colors shadow-sm">Apply Configuration</button>`;
        }
        html += '</div>';

        container.innerHTML = html;
        this._wireStepEvents();
    }

    _renderMachineStep() {
        if (!this.machines.length) {
            return '<div class="text-center py-8"><i class="bi bi-arrow-clockwise animate-spin text-2xl text-grey"></i><p class="text-sm text-grey mt-2">Loading machines...</p></div>';
        }

        const cats = {
            'z1+': { label: 'WorkBee Z1+', icon: 'bi-tools', items: [] },
            'z2+': { label: 'WorkBee Z2+', icon: 'bi-tools', items: [] },
            custom: { label: 'Other', icon: 'bi-gear', items: [] }
        };
        this.machines.forEach(m => {
            if (cats[m.category]) cats[m.category].items.push(m);
        });

        let html = '<p class="text-sm text-grey mb-4">Select your CNC machine model:</p>';

        ['z1+', 'z2+', 'custom'].forEach(catKey => {
            const cat = cats[catKey];
            if (!cat.items.length) return;

            const isExpanded = this._expandedMachineCat === catKey;
            const hasSelection = this.wizardData.machine && this.wizardData.machine.category === catKey;

            html += `<div class="border border-grey-light rounded-lg mb-2 overflow-hidden">`;
            html += `<div class="flex items-center justify-between px-3 py-2.5 bg-grey-bg cursor-pointer select-none hover:bg-white transition-colors" onclick="window.configWizard._toggleMachineCategory('${catKey}')">`;
            html += `<div class="flex items-center gap-2"><i class="${cat.icon} text-xs text-primary"></i><span class="font-bold text-xs text-secondary-dark">${cat.label}</span></div>`;
            html += `<div class="flex items-center gap-2">`;
            if (hasSelection) {
                html += `<span class="text-[10px] text-green-600 font-bold"><i class="bi bi-check-circle-fill"></i> Selected</span>`;
            }
            html += `<i class="bi ${isExpanded ? 'bi-chevron-up' : 'bi-chevron-down'} text-xs text-grey"></i>`;
            html += `</div></div>`;

            if (isExpanded) {
                html += `<div class="divide-y divide-grey-light/60">`;
                cat.items.forEach(m => {
                    if (catKey === 'custom') {
                        const sel = this.wizardData.machine && this.wizardData.machine.id === m.id;
                        html += `<div class="machine-select-item flex items-center gap-3 px-3 py-2.5 hover:bg-grey-bg/50 transition-colors cursor-pointer" data-machine-id="${m.id}">`;
                        html += `<div class="w-4 h-4 rounded-full border-2 ${sel ? 'border-primary bg-primary' : 'border-grey-light'} flex items-center justify-center"><div class="w-1.5 h-1.5 rounded-full ${sel ? 'bg-white' : ''}"></div></div>`;
                        html += `<span class="font-bold text-xs text-secondary-dark">${m.name}</span>`;
                        html += `</div>`;
                        if (sel) {
                            html += '<div class="px-4 pb-3 space-y-2">';
                            ['X', 'Y', 'Z'].forEach(axis => {
                                const lc = axis.toLowerCase();
                                const drive = (this.wizardData.customDrives || {})[lc] || 'belt';
                                const pitch = (this.wizardData.customBeltPitch || {})[lc] || 2;
                                const teeth = (this.wizardData.customPulleyTeeth || {})[lc] || 20;
                                const lead = (this.wizardData.customLead || {})[lc] || 5;
                                const endstop = (this.wizardData.customEndstops || {})[lc] || 'min';
                                html += '<div class="border border-grey-light rounded-lg p-3">';
                                html += `<div class="font-bold text-xs text-secondary-dark mb-2">${axis} Axis</div>`;
                                html += '<div class="grid grid-cols-2 gap-x-3 gap-y-2">';
                                html += '<div><label class="block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-0.5">Drive</label>';
                                html += `<select onchange="window.configWizard.wizardData.customDrives.${lc}=this.value;window.configWizard._renderWizardStep()" class="w-full px-2 py-1.5 rounded-lg border border-grey-light text-xs font-bold text-secondary-dark bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none">`;
                                html += `<option value="belt" ${drive === 'belt' ? 'selected' : ''}>Belt</option>`;
                                html += `<option value="leadscrew" ${drive === 'leadscrew' ? 'selected' : ''}>Leadscrew</option>`;
                                html += '</select></div>';
                                html += '<div><label class="block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-0.5">Travel (mm)</label>';
                                html += `<input type="number" step="1" id="w-custom-travel-${lc}" value="${(this.wizardData.machine.travel || {})[lc] || 0}" placeholder="e.g. 270" class="w-full px-2 py-1.5 rounded-lg border border-grey-light text-xs font-bold text-secondary-dark bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none">`;
                                html += '</div>';
                                if (drive === 'belt') {
                                    html += '<div><label class="block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-0.5">Belt pitch (mm)</label>';
                                    html += `<input type="number" step="0.1" value="${pitch}" onchange="window.configWizard.wizardData.customBeltPitch.${lc}=parseFloat(this.value)||2" class="w-full px-2 py-1.5 rounded-lg border border-grey-light text-xs font-bold text-secondary-dark bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none">`;
                                    html += '</div>';
                                    html += '<div><label class="block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-0.5">Pulley teeth</label>';
                                    html += `<input type="number" step="1" value="${teeth}" onchange="window.configWizard.wizardData.customPulleyTeeth.${lc}=parseInt(this.value)||20" class="w-full px-2 py-1.5 rounded-lg border border-grey-light text-xs font-bold text-secondary-dark bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none">`;
                                    html += '</div>';
                                } else {
                                    html += '<div><label class="block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-0.5">Lead (mm/rev)</label>';
                                    html += `<input type="number" step="0.1" value="${lead}" onchange="window.configWizard.wizardData.customLead.${lc}=parseFloat(this.value)||5" class="w-full px-2 py-1.5 rounded-lg border border-grey-light text-xs font-bold text-secondary-dark bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none">`;
                                    html += '</div><div></div>';
                                }
                                html += '<div class="col-span-2"><label class="block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-0.5">Endstop</label>';
                                html += `<select onchange="window.configWizard.wizardData.customEndstops.${lc}=this.value" class="w-full px-2 py-1.5 rounded-lg border border-grey-light text-xs font-bold text-secondary-dark bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none">`;
                                html += `<option value="min" ${endstop === 'min' ? 'selected' : ''}>${axis} min</option>`;
                                html += `<option value="max" ${endstop === 'max' ? 'selected' : ''}>${axis} max</option>`;
                                html += '</select></div>';
                                html += '</div></div>';
                            });
                            html += '</div>';
                        }
                    } else {
                        const sel = this.wizardData.machine && this.wizardData.machine.id === m.id;
                        html += `<div class="machine-select-item flex items-center gap-3 px-3 py-2.5 hover:bg-grey-bg/50 transition-colors cursor-pointer" data-machine-id="${m.id}">`;
                        html += `<div class="w-4 h-4 rounded-full border-2 ${sel ? 'border-primary bg-primary' : 'border-grey-light'} flex items-center justify-center"><div class="w-1.5 h-1.5 rounded-full ${sel ? 'bg-white' : ''}"></div></div>`;
                        html += `<span class="font-bold text-xs text-secondary-dark">${m.name}</span>`;
                        html += `</div>`;
                    }
                });

                // Z2+ custom size option
                if (catKey === 'z2+') {
                    const isCustomSize = this.wizardData.machine && this.wizardData.machine.id === 'z2-custom';
                    html += `<div class="machine-select-item flex items-center gap-3 px-3 py-2.5 hover:bg-grey-bg/50 transition-colors cursor-pointer" data-machine-id="z2-custom">`;
                    html += `<div class="w-4 h-4 rounded-full border-2 ${isCustomSize ? 'border-primary bg-primary' : 'border-grey-light'} flex items-center justify-center"><div class="w-1.5 h-1.5 rounded-full ${isCustomSize ? 'bg-white' : ''}"></div></div>`;
                    html += `<span class="font-bold text-xs text-secondary-dark">Custom Size</span>`;
                    html += `</div>`;
                    if (isCustomSize) {
                        html += '<div class="px-4 pb-3 space-y-2">';
                        html += '<label class="block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-0.5">Width (mm)</label>';
                        html += `<input type="number" step="1" id="w-custom-width" value="${this.wizardData.customWidth || 500}" placeholder="e.g. 500" oninput="document.getElementById('w-custom-area').textContent=this.value&&document.getElementById('w-custom-length').value?'('+(Math.max(0,parseInt(this.value)-230))+'×'+(Math.max(0,parseInt(document.getElementById('w-custom-length').value)-230))+'×88mm)':''" class="w-full px-3 py-2 rounded-lg border border-grey-light text-xs font-bold text-secondary-dark bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none">`;
                        html += '<label class="block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-0.5 mt-2">Length (mm)</label>';
                        html += `<input type="number" step="1" id="w-custom-length" value="${this.wizardData.customLength || 500}" placeholder="e.g. 500" oninput="document.getElementById('w-custom-area').textContent=document.getElementById('w-custom-width').value&&this.value?'('+(Math.max(0,parseInt(document.getElementById('w-custom-width').value)-230))+'×'+(Math.max(0,parseInt(this.value)-230))+'×88mm)':''" class="w-full px-3 py-2 rounded-lg border border-grey-light text-xs font-bold text-secondary-dark bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none">`;
                        html += `<p id="w-custom-area" class="text-[10px] text-grey italic">${this.wizardData.customWidth && this.wizardData.customLength ? `(${Math.max(0, this.wizardData.customWidth - 230)}×${Math.max(0, this.wizardData.customLength - 230)}×88mm)` : ''}</p>`;
                        html += '</div>';
                    }
                }

                html += `</div>`;
            }

            html += `</div>`;
        });

        return html;
    }

    _renderRouterStep() {
        const machine = this.wizardData.machine;
        if (!machine || !machine.routers || !machine.routers.length) {
            return '<p class="text-sm text-grey">No toolhead options for this machine.</p>';
        }

        const th = this.wizardData.toolheads;
        const spindleDefs = {};
        machine.routers.forEach(r => { spindleDefs[r.id] = this.spindles[r.id] || {}; });

        const cats = {
            spindle: { label: 'Spindle / Router', icon: 'bi-tools', items: [] },
            'vfd-modbus': { label: 'VFD Modbus', icon: 'bi-speedometer2', items: [] },
            laser: { label: 'Laser', icon: 'bi-brightness-high', items: [] }
        };

        machine.routers.forEach(r => {
            const def = spindleDefs[r.id] || {};
            const cat = def.category || 'spindle';
            if (cats[cat]) cats[cat].items.push(r);
        });

        let html = '<p class="text-sm text-grey mb-4">Select your toolheads:</p>';

        ['spindle', 'vfd-modbus', 'laser'].forEach(catKey => {
            const cat = cats[catKey];
            if (!cat.items.length) return;

            const isExpanded = this._expandedCat === catKey;
            let hasSelection;
            if (catKey === 'laser') hasSelection = th.laser;
            else if (catKey === 'vfd-modbus') hasSelection = th.vfdModbusEnabled;
            else hasSelection = th.spindle !== null;

            html += `<div class="border border-grey-light rounded-lg mb-2 overflow-hidden">`;
            html += `<div class="flex items-center justify-between px-3 py-2.5 bg-grey-bg cursor-pointer select-none hover:bg-white transition-colors" onclick="window.configWizard._toggleCategory('${catKey}')">`;
            html += `<div class="flex items-center gap-2"><i class="${cat.icon} text-xs text-primary"></i><span class="font-bold text-xs text-secondary-dark">${cat.label}</span></div>`;
            html += `<div class="flex items-center gap-2">`;
            if (hasSelection) {
                html += `<span class="text-[10px] text-green-600 font-bold"><i class="bi bi-check-circle-fill"></i> Selected</span>`;
            }
            html += `<i class="bi ${isExpanded ? 'bi-chevron-up' : 'bi-chevron-down'} text-xs text-grey"></i>`;
            html += `</div></div>`;

            if (isExpanded) {
                html += `<div class="divide-y divide-grey-light/60">`;
                cat.items.forEach(r => {
                    const def = spindleDefs[r.id] || {};
                    if (catKey === 'laser') {
                        const checked = th.laser;
                        html += `<label class="flex items-center gap-3 px-3 py-2.5 hover:bg-grey-bg/50 transition-colors cursor-pointer">`;
                        html += `<input type="checkbox" ${checked ? 'checked' : ''} onchange="window.configWizard.wizardData.toolheads.laser = this.checked; window.configWizard._renderWizardStep()" class="w-4 h-4 accent-primary rounded">`;
                        html += `<span class="font-bold text-xs text-secondary-dark">${r.name}</span>`;
                        html += `</label>`;
                    } else if (catKey === 'vfd-modbus') {
                        const checked = th.vfdModbusEnabled;
                        html += `<label class="flex items-center gap-3 px-3 py-2.5 hover:bg-grey-bg/50 transition-colors cursor-pointer">`;
                        html += `<input type="checkbox" ${checked ? 'checked' : ''} onchange="window.configWizard.wizardData.toolheads.vfdModbusEnabled = this.checked; if(!this.checked)window.configWizard.wizardData.toolheads.vfdModbus=null; window.configWizard._renderWizardStep()" class="w-4 h-4 accent-primary rounded">`;
                        html += `<span class="font-bold text-xs text-secondary-dark">${r.name}</span>`;
                        html += `</label>`;
                        // Modbus protocol sub-select
                        if (checked) {
                            html += '<div class="px-4 pb-2 bg-grey-bg/30">';
                            html += '<label class="block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-1.5 mt-1">Modbus Protocol</label>';
                            html += '<div class="grid gap-1">';
                            Object.entries(this.modbusProtocols).forEach(([key, proto]) => {
                                const sel = th.vfdModbus === key;
                                html += `<div class="modbus-select-item flex items-center gap-2 px-2.5 py-1.5 rounded border ${sel ? 'border-primary bg-primary-light/20' : 'border-grey-light hover:bg-grey-bg'} cursor-pointer transition-all" data-modbus-key="${key}">`;
                                html += `<div class="w-3 h-3 rounded-full border-2 ${sel ? 'border-primary bg-primary' : 'border-grey-light'} flex items-center justify-center"><div class="w-1 h-1 rounded-full ${sel ? 'bg-white' : ''}"></div></div>`;
                                html += `<span class="text-[10px] font-bold text-secondary-dark">${proto.name}</span>`;
                                html += `<span class="text-[10px] text-grey ml-auto">$$396=${proto['$396']}</span>`;
                                html += `</div>`;
                            });
                            html += '</div></div>';
                        }
                    } else {
                        const selected = th.spindle === r.id;
                        html += `<div class="flex items-center gap-3 px-3 py-2.5 hover:bg-grey-bg/50 transition-colors cursor-pointer toolhead-option" data-id="${r.id}">`;
                        html += `<div class="w-4 h-4 rounded-full border-2 ${selected ? 'border-primary bg-primary' : 'border-grey-light'} flex items-center justify-center"><div class="w-1.5 h-1.5 rounded-full ${selected ? 'bg-white' : ''}"></div></div>`;
                        html += `<span class="font-bold text-xs text-secondary-dark">${r.name}</span>`;
                        html += `</div>`;
                    }
                });
                html += `</div>`;
            }

            html += `</div>`;
        });

        return html;
    }

    _toggleCategory(catKey) {
        this._expandedCat = this._expandedCat === catKey ? null : catKey;
        this._renderWizardStep();
    }

    _toggleMachineCategory(catKey) {
        this._expandedMachineCat = this._expandedMachineCat === catKey ? null : catKey;
        this._renderWizardStep();
    }

    _getMachineConfig(machine) {
        if (!machine) return '';
        if (machine.grblConfig) return machine.grblConfig;

        // Z2+ fixed size: find matching Z1+ machine and patch Z travel
        if (machine.id && machine.id.startsWith('z2-') && machine.id !== 'z2-custom') {
            const z1Id = 'z1-' + machine.id.slice(3);
            const z1 = this.machines.find(m => m.id === z1Id);
            if (z1 && z1.grblConfig) {
                return z1.grblConfig
                    .replace(/\$132=[\d.]+/g, `$132=${machine.travel.z.toFixed(3)}`)
                    .replace(/\$135=[\d.]+/g, `$135=${machine.travel.z.toFixed(3)}`)
                    .replace(/\$138=[\d.]+/g, `$138=${machine.travel.z.toFixed(3)}`);
            }
        }

        // Custom or Z2+ custom size: use any Z1+ config as template, replace all travel
        const template = this.machines.find(m => m.grblConfig);
        if (template) {
            let cfg = template.grblConfig;
            cfg = cfg.replace(/\$130=[\d.]+/g, `$130=${(machine.travel.x || 0).toFixed(3)}`);
            cfg = cfg.replace(/\$131=[\d.]+/g, `$131=${(machine.travel.y || 0).toFixed(3)}`);
            cfg = cfg.replace(/\$132=[\d.]+/g, `$132=${(machine.travel.z || 0).toFixed(3)}`);
            cfg = cfg.replace(/\$133=[\d.]+/g, `$133=${(machine.travel.x || 0).toFixed(3)}`);
            cfg = cfg.replace(/\$134=[\d.]+/g, `$134=${(machine.travel.y || 0).toFixed(3)}`);
            cfg = cfg.replace(/\$135=[\d.]+/g, `$135=${(machine.travel.z || 0).toFixed(3)}`);
            cfg = cfg.replace(/\$136=[\d.]+/g, `$136=${(machine.travel.x || 0).toFixed(3)}`);
            cfg = cfg.replace(/\$137=[\d.]+/g, `$137=${(machine.travel.y || 0).toFixed(3)}`);
            cfg = cfg.replace(/\$138=[\d.]+/g, `$138=${(machine.travel.z || 0).toFixed(3)}`);
            return cfg;
        }
        return '';
    }

    _computeToolheadAssignments() {
        const th = this.wizardData.toolheads;
        const result = {};
        const hasSpindle = th.spindle !== null;
        const hasLaser = th.laser;
        const hasModbus = th.vfdModbusEnabled;

        if (!hasSpindle && !hasLaser && !hasModbus) return result;

        const spindleDef = hasSpindle ? this.spindles[th.spindle] : null;
        const laserDef = this.spindles['laser-pwm'];
        const modbusDef = this.spindles['vfd-modbus'];

        if (hasSpindle && spindleDef) {
            result['$395'] = { name: spindleDef.name, value: spindleDef.value };
        }
        if (hasLaser && laserDef) {
            result['$511'] = { name: laserDef.name, value: laserDef.value };
        }
        if (hasModbus && modbusDef) {
            result['$512'] = { name: modbusDef.name, value: modbusDef.value };
        }

        return result;
    }

    _renderProbePlateStep() {
        const s = this.store.data.probe;
        const selected = this.wizardData.probeType;
        let html = '<p class="text-sm text-grey mb-4">Select your probe plate:</p>';

        // Dropdown
        html += '<div class="mb-4">';
        html += '<label class="block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-1.5">Probe Type</label>';
        html += `<select id="wizard-probe-type" onchange="window.configWizard._onProbeTypeChange(this.value)" class="w-full px-3 py-2 rounded-lg border border-grey-light text-xs font-bold text-secondary-dark bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none">`;
        html += `<option value="ooznest" ${selected === 'ooznest' ? 'selected' : ''}>Ooznest XYZ Probe</option>`;
        html += `<option value="custom" ${selected === 'custom' ? 'selected' : ''}>Custom</option>`;
        html += '</select>';
        html += '</div>';

        // Custom dimensions (shown only when Custom is selected)
        const showCustom = selected === 'custom' ? '' : 'hidden';
        html += `<div id="wizard-custom-probe-dims" class="${showCustom} grid grid-cols-2 gap-4">`;
        html += '<div>';
        html += '<label class="block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-1">Plate Thickness (mm)</label>';
        html += `<input type="number" step="0.1" id="wizard-plate-thickness" value="${s.plateThickness || 10}" class="w-full px-3 py-2 rounded-lg border border-grey-light text-xs font-bold text-secondary-dark bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none">`;
        html += '</div>';
        html += '<div>';
        html += '<label class="block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-1">XY Plate Offset (mm)</label>';
        html += `<input type="number" step="0.1" id="wizard-plate-offset" value="${s.xyPlateOffset || 10}" class="w-full px-3 py-2 rounded-lg border border-grey-light text-xs font-bold text-secondary-dark bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none">`;
        html += '</div>';
        html += '</div>';

        // Description
        if (selected === 'ooznest') {
            html += '<p class="text-[10px] text-grey mt-3"><i class="bi bi-info-circle"></i> Ooznest XYZ Probe: thickness 10mm, XY offset 10mm. These will be set automatically in your probe settings.</p>';
        } else {
            html += '<p class="text-[10px] text-grey mt-3"><i class="bi bi-info-circle"></i> Enter your custom probe plate dimensions above.</p>';
        }

        return html;
    }

    _renderDustShoeStep() {
        const selected = this.wizardData.dustShoe;
        let html = '<p class="text-sm text-grey mb-4">Do you have a dust shoe?</p>';
        html += '<div class="grid gap-2">';
        [
            { value: true, label: 'Yes, I have one', icon: 'bi-fan' },
            { value: false, label: 'No dust shoe', icon: 'bi-x-lg' }
        ].forEach(opt => {
            const sel = selected === opt.value;
            html += `<div class="dust-shoe-option border ${sel ? 'border-primary bg-primary-light/20 ring-1 ring-primary/30' : 'border-grey-light hover:border-primary/40 hover:bg-grey-bg'} rounded-lg p-3 cursor-pointer transition-all" data-value="${opt.value}">`;
            html += `<div class="flex items-center gap-3">`;
            html += `<div class="w-5 h-5 rounded-full border-2 ${sel ? 'border-primary bg-primary' : 'border-grey-light'} flex items-center justify-center"><div class="w-2 h-2 rounded-full ${sel ? 'bg-white' : ''}"></div></div>`;
            html += `<span class="font-bold text-xs text-secondary-dark">${opt.label}</span>`;
            html += '</div></div>';
        });
        html += '</div>';
        return html;
    }

    _renderEnclosureStep() {
        const selected = this.wizardData.enclosure;
        let html = '<p class="text-sm text-grey mb-4">Do you have a <a href="https://ooznest.co.uk/product/original-workbee-enclosure/" target="_blank" class="text-primary hover:underline">WorkBee Enclosure</a>? </p>';
        html += '<div class="grid gap-2">';
        [
            { value: true, label: 'Yes, WorkBee Enclosure', icon: 'bi-box-seam' },
            { value: false, label: 'Open frame', icon: 'bi-unlock' }
        ].forEach(opt => {
            const sel = selected === opt.value;
            html += `<div class="enclosure-option border ${sel ? 'border-primary bg-primary-light/20 ring-1 ring-primary/30' : 'border-grey-light hover:border-primary/40 hover:bg-grey-bg'} rounded-lg p-3 cursor-pointer transition-all" data-value="${opt.value}">`;
            html += `<div class="flex items-center gap-3">`;
            html += `<div class="w-5 h-5 rounded-full border-2 ${sel ? 'border-primary bg-primary' : 'border-grey-light'} flex items-center justify-center"><div class="w-2 h-2 rounded-full ${sel ? 'bg-white' : ''}"></div></div>`;
            html += `<span class="font-bold text-xs text-secondary-dark">${opt.label}</span>`;
            html += '</div></div>';
        });
        html += '</div>';
        return html;
    }

    _renderApplyStep() {
        const machine = this.wizardData.machine;
        const th = this.wizardData.toolheads;
        const assignments = this._computeToolheadAssignments();
        const modbusKey = th.vfdModbus;
        const modbusProto = modbusKey ? this.modbusProtocols[modbusKey] : null;

        let html = '<p class="text-sm text-grey mb-4">Review your configuration before applying:</p>';
        html += '<div class="bg-grey-bg rounded-lg p-4 space-y-3 border border-grey-light">';

        if (machine) {
            html += `<div class="flex justify-between"><span class="text-xs text-grey">Machine</span><span class="text-xs font-bold text-secondary-dark">${machine.name}</span></div>`;
        }

        // Toolhead assignments
        if (Object.keys(assignments).length) {
            const labels = { '$395': 'Primary', '$511': 'Secondary', '$512': 'Tertiary' };
            html += '<div class="border-t border-grey-light pt-2"></div>';
            Object.entries(assignments).forEach(([setting, info]) => {
                const label = labels[setting] || setting;
                html += `<div class="flex justify-between"><span class="text-xs text-grey">${label}</span><span class="text-xs font-bold text-secondary-dark">${info.name}</span></div>`;
            });
        }
        if (modbusProto) {
            html += `<div class="flex justify-between"><span class="text-xs text-grey">Modbus Protocol</span><span class="text-xs font-bold text-secondary-dark">${modbusProto.name} ($396=${modbusProto['$396']})</span></div>`;
        }

        html += '<div class="border-t border-grey-light pt-2"></div>';
        html += `<div class="flex justify-between"><span class="text-xs text-grey">Probe</span><span class="text-xs font-bold text-secondary-dark">${this.wizardData.probeType === 'ooznest' ? 'Ooznest XYZ Probe' : `Custom (${this.wizardData.plateThickness}mm / ${this.wizardData.xyPlateOffset}mm offset)`}</span></div>`;
        html += `<div class="flex justify-between"><span class="text-xs text-grey">Dust Shoe</span><span class="text-xs font-bold ${this.wizardData.dustShoe ? 'text-green-600' : 'text-grey'}">${this.wizardData.dustShoe ? 'Yes' : 'No'}</span></div>`;
        html += `<div class="flex justify-between"><span class="text-xs text-grey">Enclosure</span><span class="text-xs font-bold ${this.wizardData.enclosure ? 'text-green-600' : 'text-grey'}">${this.wizardData.enclosure ? 'WorkBee Enclosure' : 'Open frame'}</span></div>`;

        html += '</div>';

        if (machine) {
            const configLines = this._getMachineConfig(machine).split('\n').filter(l => l.trim());
            html += `<div class="mt-3"><p class="text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-1">Grbl Settings to apply (${configLines.length} settings)</p>`;
            html += `<div class="bg-white border border-grey-light rounded-lg p-2 max-h-32 overflow-y-auto text-[10px] font-mono text-grey-dark leading-relaxed">`;
            html += configLines.slice(0, 20).map(l => `<div>${l}</div>`).join('');
            if (configLines.length > 20) html += `<div class="text-grey italic">... and ${configLines.length - 20} more</div>`;
            html += '</div></div>';
        }

        html += '<div class="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">';
        html += '<i class="bi bi-exclamation-triangle text-amber-500 text-sm mt-0.5"></i>';
        html += '<p class="text-[10px] text-amber-700">This will overwrite your current Grbl settings and perform a soft reset. Make sure you have a backup of your current configuration.</p>';
        html += '</div>';

        return html;
    }

    _wireStepEvents() {
        // Machine selection
        document.querySelectorAll('.machine-select-item').forEach(el => {
            el.onclick = () => {
                const id = el.dataset.machineId;
                if (id === 'z2-custom') {
                    this.wizardData.customWidth = this.wizardData.customWidth || 500;
                    this.wizardData.customLength = this.wizardData.customLength || 500;
                    const z2Template = this.machines.find(m => m.category === 'z2+');
                    this.wizardData.machine = {
                        id: 'z2-custom',
                        name: 'Custom Size',
                        category: 'z2+',
                        travel: { x: 0, y: 0, z: 88 },
                        routers: z2Template ? [...z2Template.routers] : []
                    };
                } else {
                    this.wizardData.machine = this.machines.find(m => m.id === id) || null;
                }
        this.wizardData.toolheads = { spindle: null, vfdModbusEnabled: false, vfdModbus: null, laser: false };
                this._renderWizardStep();
            };
        });

        // Toolhead selection (radio-style for spindle options)
        document.querySelectorAll('.toolhead-option').forEach(el => {
            el.onclick = () => {
                const id = el.dataset.id;
                this.wizardData.toolheads.spindle = this.wizardData.toolheads.spindle === id ? null : id;
                this._renderWizardStep();
            };
        });

        // Modbus protocol selection
        document.querySelectorAll('.modbus-select-item').forEach(el => {
            el.onclick = () => {
                this.wizardData.toolheads.vfdModbus = el.dataset.modbusKey;
                this._renderWizardStep();
            };
        });

        // Dust shoe selection
        document.querySelectorAll('.dust-shoe-option').forEach(el => {
            el.onclick = () => {
                document.querySelectorAll('.dust-shoe-option').forEach(e => {
                    e.classList.remove('border-primary', 'bg-primary-light/20', 'ring-1', 'ring-primary/30');
                    e.classList.add('border-grey-light');
                });
                el.classList.remove('border-grey-light');
                el.classList.add('border-primary', 'bg-primary-light/20', 'ring-1', 'ring-primary/30');
                this.wizardData.dustShoe = el.dataset.value === 'true';
            };
        });

        // Enclosure selection
        document.querySelectorAll('.enclosure-option').forEach(el => {
            el.onclick = () => {
                document.querySelectorAll('.enclosure-option').forEach(e => {
                    e.classList.remove('border-primary', 'bg-primary-light/20', 'ring-1', 'ring-primary/30');
                    e.classList.add('border-grey-light');
                });
                el.classList.remove('border-grey-light');
                el.classList.add('border-primary', 'bg-primary-light/20', 'ring-1', 'ring-primary/30');
                this.wizardData.enclosure = el.dataset.value === 'true';
            };
        });
    }

    _canProceed() {
        switch (this.wizardStep) {
            case 0: {
                const m = this.wizardData.machine;
                if (!m) return false;
                if (m.id === 'z2-custom') {
                    const w = parseFloat(document.getElementById('w-custom-width')?.value) || 0;
                    const l = parseFloat(document.getElementById('w-custom-length')?.value) || 0;
                    return w >= 100 && l >= 100;
                }
                if (m.category === 'custom') {
                    const x = parseFloat(document.getElementById('w-custom-travel-x')?.value) || 0;
                    const y = parseFloat(document.getElementById('w-custom-travel-y')?.value) || 0;
                    const z = parseFloat(document.getElementById('w-custom-travel-z')?.value) || 0;
                    return x > 0 && y > 0 && z > 0;
                }
                return true;
            }
            case 1: {
                const th = this.wizardData.toolheads;
                const hasAny = th.spindle !== null || th.vfdModbusEnabled || th.laser;
                if (!hasAny) return false;
                if (th.vfdModbusEnabled && !th.vfdModbus) return false;
                return true;
            }
            default: return true;
        }
    }

    _onProbeTypeChange(value) {
        this.wizardData.probeType = value;
        if (value === 'ooznest') {
            this.wizardData.plateThickness = 10;
            this.wizardData.xyPlateOffset = 10;
        }
        this._renderWizardStep();
    }

    _nextStep() {
        // Capture form values before moving
        if (this.wizardStep === 0) {
            const m = this.wizardData.machine;
            if (m && m.id === 'z2-custom') {
                const width = parseFloat(document.getElementById('w-custom-width')?.value) || 500;
                const length = parseFloat(document.getElementById('w-custom-length')?.value) || 500;
                this.wizardData.customWidth = width;
                this.wizardData.customLength = length;
                const x = Math.max(0, width - 230);
                const y = Math.max(0, length - 230);
                m.travel = { x, y, z: 88 };
                m.name = `${width}×${length}mm`;
            } else if (m && m.category === 'custom') {
                const x = parseFloat(document.getElementById('w-custom-travel-x')?.value) || 0;
                const y = parseFloat(document.getElementById('w-custom-travel-y')?.value) || 0;
                const z = parseFloat(document.getElementById('w-custom-travel-z')?.value) || 0;
                m.travel = { x, y, z };
                // Store custom drive config for later use
                m.customDrives = { ...this.wizardData.customDrives };
                m.customBeltPitch = { ...this.wizardData.customBeltPitch };
                m.customPulleyTeeth = { ...this.wizardData.customPulleyTeeth };
                m.customLead = { ...this.wizardData.customLead };
                m.customEndstops = { ...this.wizardData.customEndstops };
            }
        }
        if (this.wizardStep === 2) {
            if (this.wizardData.probeType === 'custom') {
                const thick = document.getElementById('wizard-plate-thickness');
                const offset = document.getElementById('wizard-plate-offset');
                if (thick) this.wizardData.plateThickness = parseFloat(thick.value) || 10;
                if (offset) this.wizardData.xyPlateOffset = parseFloat(offset.value) || 10;
            } else {
                this.wizardData.plateThickness = 10;
                this.wizardData.xyPlateOffset = 10;
            }
        }
        this.wizardStep++;
        this._renderWizardStep();
    }

    _prevStep() {
        if (this.wizardStep > 0) {
            this.wizardStep--;
            this._renderWizardStep();
        }
    }

    async _applyConfig() {
        const machine = this.wizardData.machine;
        if (!machine || !this.ws || !this.ws.isConnected) {
            this._showWizardStatus('Cannot apply config: not connected.', 'error');
            return;
        }

        // Save probe plate settings
        this.store.set('probe.plateThickness', this.wizardData.plateThickness);
        this.store.set('probe.xyPlateOffset', this.wizardData.xyPlateOffset);
        if (window.probeHandler) window.probeHandler.renderSettings();

        // Save dust shoe and enclosure for future use
        this.store.set('machine.dustShoe', this.wizardData.dustShoe);
        this.store.set('machine.enclosure', this.wizardData.enclosure);

        // Apply grbl settings
        const configLines = this._getMachineConfig(machine).split('\n').filter(l => l.trim());
        this._showWizardStatus(`Applying ${configLines.length} settings...`, 'info');

        try {
            for (let i = 0; i < configLines.length; i++) {
                const line = configLines[i].trim();
                if (!line) continue;
                if (i % 10 === 0) {
                    this._showWizardStatus(`Setting ${i + 1} of ${configLines.length}...`, 'info');
                    await this._sleep(10);
                }
                await this.ws.sendCommand(line);
                await this._sleep(15);
            }

            // Apply toolhead assignments ($395 primary, $511 secondary, $512 tertiary)
            const assignments = this._computeToolheadAssignments();
            for (const [setting, info] of Object.entries(assignments)) {
                await this.ws.sendCommand(`${setting}=${info.value}`);
                await this._sleep(15);
            }

            // Apply modbus protocol $396 setting
            const modbusKey = this.wizardData.toolheads.vfdModbus;
            if (modbusKey) {
                const modbusProto = this.modbusProtocols[modbusKey];
                if (modbusProto && modbusProto['$396'] !== undefined) {
                    await this.ws.sendCommand(`$396=${modbusProto['$396']}`);
                    await this._sleep(15);
                }
            }

            // Save machine config name to store
            this.store.set('machine.id', machine.id);
            this.store.set('machine.name', machine.name);
            this.store.set('machine.toolheads', JSON.stringify(this.wizardData.toolheads));

            this._showWizardStatus('All settings applied! Performing soft reset...', 'success');

            // Soft reset
            await this._sleep(500);
            this.ws.sendRealtime('\x18');

            // Update viewer with new machine limits
            if (window.viewer) {
                window.viewer.setMachineLimits(machine.travel.x, machine.travel.y, machine.travel.z);
            }

            // Mark configured — send $I=json so $I+ no longer returns UNCONFIGURED
            const th = this.wizardData.toolheads;
            const configSummary = {
                machine: machine.id,
                router: th.router,
                vfd: th.vfd,
                vfdModbus: th.vfdModbus,
                laser: th.laser,
                probe: this.wizardData.probeType,
                dustShoe: this.wizardData.dustShoe,
                enclosure: this.wizardData.enclosure
            };
            await this.ws.sendCommand(`$I=${JSON.stringify(configSummary)}`);
            await this._sleep(15);

            await this._sleep(2000);

            // Re-fetch settings to refresh the UI
            setTimeout(() => {
                if (window.grblSettings) window.grblSettings.fetchSettings();
            }, 2000);

            this._showWizardStatus('Configuration complete!', 'success');

            // Close wizard after delay
            setTimeout(() => this.hideWizard(), 2500);

        } catch (e) {
            this._showWizardStatus(`Error applying config: ${e.message}`, 'error');
        }
    }

    _showWizardStatus(msg, type) {
        const el = document.getElementById('config-wizard-status');
        if (!el) return;
        if (type === 'error') {
            el.innerHTML = `<div class="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2"><i class="bi bi-x-circle-fill"></i> ${msg}</div>`;
        } else if (type === 'success') {
            el.innerHTML = `<div class="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 flex items-center gap-2"><i class="bi bi-check-circle-fill"></i> ${msg}</div>`;
        } else {
            el.innerHTML = `<div class="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 flex items-center gap-2"><i class="bi bi-info-circle-fill"></i> ${msg}</div>`;
        }
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
