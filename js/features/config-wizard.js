import { registerModal } from '../ui/modal.js';
import { TOOLHEAD_SLOTS, getToolheadOptions } from '../machine/toolhead-options.js';

const Z2_TRAVEL_OFFSET_MM = 230;
export class ConfigWizard {
    constructor(ws, store) {
        console.log('[ConfigWizard] constructor');
        this.ws = ws;
        this.store = store;
        this.machines = [];
        this.spindles = {};
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
        this._expandedToolheadSlot = '395';
        this._toolheadSettings = {};
        this._toolheadLoadError = '';
        this.ws.on('disconnect', () => {
            this._toolheadSettings = {};
            this._toolheadRequest = null;
            this._toolheadLoadError = '';
            if (this.wizardStep === 1 && this.modal?.isOpen()) this._renderWizardStep();
        });
        this.wizardStep = 0;
        this.wizardData = {
            machine: null,
            toolheads: { '395': null, '511': null, '512': null },
            probeType: 'ooznest',
            plateThickness: 5,
            xyPlateOffset: 10,
            wifiMode: '0',
            wifiSsid: '',
            wifiPsk: '',
            dustShoe: false,
            enclosure: false,
            firmwareFlashed: false,
            skipFirmware: false
        };
        this.modal = registerModal('config-wizard-overlay', { closeOnBackdrop: false, closeOnEscape: true });
        this.loadMachineJson();
    }

    async loadMachineJson() {
        try {
            const resp = await fetch('./machine.json');
            if (resp.ok) {
                const data = await resp.json();
                this.machines = data.machines || [];
                this.spindles = data.spindles || {};
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

        this._verLines.push(line);
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

    _isUnconfigured(name) {
        return name && name.toUpperCase() === 'UNCONFIGURED';
    }

    _decodeMachineConfig(configName) {
        if (!configName || !/^WB[A-Z]{7}$/.test(configName)) return null;

        const sizeMap = {
            A: '500 x 500',
            B: '750 x 750',
            C: '750 x 1000',
            D: '1000 x 1000',
            E: '1000 x 1500',
            F: '1500 x 1500',
            G: 'Custom'
        };
        const spindleMap = {
            A: 'WorkBee Router Head',
            B: 'Mafell FM 1000 (Digital)',
            C: 'Mafell FM 1000 (Manual)',
            D: 'VFD (0-10V)',
            E: 'VFD (Modbus)',
            F: 'PWM Laser Module',
            G: 'Huanyang V1 (Modbus)',
            H: 'Huanyang P2A (Modbus)',
            I: 'Durapulse GS20 (Modbus)',
            J: 'Yalang YL620A (Modbus)',
            K: 'Generic VFD (Modbus)',
            L: 'H-100 (Modbus)',
            M: 'Nowforever (Modbus)'
        };
        const categoryMap = {
            A: 'Z1+',
            B: 'Z2',
            C: 'Custom'
        };

        const size = sizeMap[configName[2]] || 'Unknown size';
        const dust = configName[3] === 'A' ? 'Dust shoe' : 'No dust shoe';
        const enclosure = configName[4] === 'A' ? 'Enclosure' : 'No Enclosure';
        const spindle = spindleMap[configName[5]] || 'Unknown spindle';
        const laser = configName[6] === 'A' ? 'Laser fitted' : 'No laser';
        const probeMap = {
            A: 'WorkBee XYZ Touch Probe',
            B: 'Custom probe',
            C: 'No probe'
        };
        const probe = probeMap[configName[7]] || 'Unknown probe';
        const category = categoryMap[configName[8]] || 'Unknown machine type';

        return `${category}, ${size}, ${spindle}, ${dust}, ${enclosure}, ${laser}, ${probe}`;
    }

    _onVerComplete() {
        console.log('[ConfigWizard] _onVerComplete', this.verInfo);
        if (!this.verInfo) return;
        if (!this.ws.isGrblHAL) {
            this.renderInfoTab();
            return;
        }
        window.firmwareVersionChecker?.setControllerVersion(this.verInfo.version, this.boardInfo);
        this.renderInfoTab();
        if (this.wizardStep === 1 && this.modal?.isOpen()) this._renderWizardStep();
        const isUnconfigured = this._isUnconfigured(this.verInfo.configName);
        if (isUnconfigured && !this.modal?.isOpen()) {
            setTimeout(() => {
                if (!this.modal?.isOpen()) this.showWizard();
            }, 500);
        } else if (!isUnconfigured) {
            window.firmwareVersionChecker?.promptForConfiguredController?.();
        }
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

    // --- Info Tab Rendering ---

    async renderInfoTab() {
        if (window.troubleshootingInfo?.render) {
            await window.troubleshootingInfo.render();
        }
    }

    // --- Wizard Modal ---

    showWizard() {
        if (this.ws.isConnected && !this.ws.isGrblHAL) return;
        console.log('[ConfigWizard] showWizard');
        this._toolheadSettings = {};
        this._toolheadRequest = null;
        this._toolheadLoadError = '';
        this.wizardStep = 0;
        this._expandedToolheadSlot = '395';
        this.wizardData.machine = null;
        this.wizardData.toolheads = { '395': null, '511': null, '512': null };
        this.wizardData.dustShoe = false;
        this.wizardData.enclosure = false;
        this.wizardData.wifiMode = '0';
        this.wizardData.wifiSsid = '';
        this.wizardData.wifiPsk = '';
        this.wizardData.firmwareFlashed = false;
        this.wizardData.skipFirmware = false;
        this.wizardData.customWidth = 500;
        this.wizardData.customLength = 500;
        this.wizardData.customDrives = { x: 'belt', y: 'belt', z: 'belt' };
        this.wizardData.customBeltPitch = { x: 2, y: 2, z: 2 };
        this.wizardData.customPulleyTeeth = { x: 20, y: 20, z: 20 };
        this.wizardData.customLead = { x: 5, y: 5, z: 5 };
        this.wizardData.customEndstops = { x: 'min', y: 'min', z: 'min' };
        if (this.modal) {
            console.log('[ConfigWizard] Removing hidden class from overlay');
            this.modal.show();
        } else {
            console.warn('[ConfigWizard] overlay element not found');
        }
        this._renderWizardStep();
    }

    hideWizard() {
        console.log('[ConfigWizard] hideWizard');
        this.modal?.hide();
    }

    _renderWizardStep() {
        console.log('[ConfigWizard] _renderWizardStep step=' + this.wizardStep);
        const container = document.getElementById('config-wizard-body');
        const footer = document.getElementById('config-wizard-footer');
        if (!container) { console.warn('[ConfigWizard] config-wizard-body not found'); return; }
        if (!container || !footer) return;

        if (!this.ws?.isConnected && this.wizardStep === 0) {
            container.innerHTML = `
                <div class="flex min-h-52 flex-col items-center justify-center text-center">
                    <div class="text-sm font-bold text-primary">Not Connected</div>
                    <p class="mt-2 text-xs text-grey" style="padding-bottom:4rem">Please connect to configure your machine.</p>
                </div>`;
            footer.innerHTML = '';
            footer.classList.add('hidden');
            return;
        }

        const steps = ['Machine', 'Toolhead', 'Probe Plate', 'Dust Shoe', 'Enclosure', 'WiFi Setup', 'Apply'];
        const totalSteps = steps.length;

        let html = '';
        let footerHtml = '';

        // Step indicator
        html += '<div class="wizard-stepper wizard-stepper--compact wizard-stepper--config mb-6 px-1">';
        [steps.slice(0, 4), steps.slice(4)].forEach((rowSteps, rowIndex) => {
            html += '<div class="wizard-stepper__row">';
            rowSteps.forEach((label, rowStepIndex) => {
                const i = (rowIndex * 4) + rowStepIndex;
                const isActive = i === this.wizardStep;
                const isDone = i < this.wizardStep;
                const isRowEnd = rowStepIndex === rowSteps.length - 1;
                html += `<div class="wizard-stepper__item ${isActive ? 'is-active' : ''} ${isDone ? 'is-complete' : ''} ${isRowEnd ? 'is-row-end' : ''}">`;
                if (isDone) {
                    html += '<span class="wizard-stepper__circle"><i data-lucide="check" style="width:16px;height:16px"></i></span>';
                } else {
                    html += `<span class="wizard-stepper__circle">${i + 1}</span>`;
                }
                html += `<span class="wizard-stepper__label">${label}</span>`;
                html += '</div>';
            });
            html += '</div>';
        });
        html += '</div>';

        // Step content
        html += '<div>';
        switch (this.wizardStep) {
            case 0: html += this._renderMachineStep(); break;
            case 1: html += this._renderRouterStep(); break;
            case 2: html += this._renderProbePlateStep(); break;
            case 3: html += this._renderDustShoeStep(); break;
            case 4: html += this._renderEnclosureStep(); break;
            case 5: html += this._renderWifiSetupStep(); break;
            case 6: html += this._renderApplyStep(); break;
        }
        html += '</div>';

        // Navigation buttons
        footerHtml += '<div class="flex w-full justify-between items-center gap-3">';
        if (this.wizardStep > 0) {
            footerHtml += `<button onclick="window.configWizard._prevStep()" class="btn btn-secondary">Back</button>`;
        } else {
            footerHtml += '<div></div>';
        }
        if (this.wizardStep === 0) {
            const firmware = this._getFirmwareForMachine();
            if (firmware && !this.wizardData.skipFirmware) {
                const disabled = !this._canProceed();
                footerHtml += `<button id="config-wizard-flash-firmware" class="btn btn-primary" ${disabled ? 'disabled' : ''}><i data-lucide="cpu"></i> Flash ${firmware.label} Firmware</button>`;
            } else {
                const disabled = !this._canProceed();
                footerHtml += `<button id="config-wizard-continue" onclick="window.configWizard._nextStep()" class="btn btn-primary" ${disabled ? 'disabled' : ''}>Continue</button>`;
            }
        } else if (this.wizardStep < totalSteps - 1) {
            const disabled = !this._canProceed();
            footerHtml += `<button id="config-wizard-continue" onclick="window.configWizard._nextStep()" class="btn btn-primary" ${disabled ? 'disabled' : ''}>Continue</button>`;
        } else {
            footerHtml += `<button onclick="window.configWizard._applyConfig()" class="btn btn-primary">Apply Configuration</button>`;
        }
        footerHtml += '</div>';

        container.innerHTML = html;
        footer.innerHTML = footerHtml;
        footer.classList.remove('hidden');
        this._wireStepEvents();
        this._updateContinueState();
        if (window.lucide) window.lucide.createIcons();
    }

    _renderMachineStep() {
        if (!this.machines.length) {
            return '<div class="text-center py-8"><i data-lucide="refresh-cw" style="width:14px;height:14px"></i><p class="text-sm text-grey mt-2">Loading machines...</p></div>';
        }

        const cats = {
            'z1+': { label: 'WorkBee Z1+', icon: 'bi-tools', items: [] },
            'z2': { label: 'WorkBee Z2', icon: 'bi-tools', items: [] },
            custom: { label: 'Other', icon: 'bi-gear', items: [] }
        };
        this.machines.forEach(m => {
            if (cats[m.category]) cats[m.category].items.push(m);
        });

        let html = '<p class="text-sm text-grey mb-4">Select your CNC machine model:</p>';

        ['z1+', 'z2', 'custom'].forEach(catKey => {
            const cat = cats[catKey];
            if (!cat.items.length) return;

            const isExpanded = this._expandedMachineCat === catKey;
            html += `<div class="config-filter-group bg-white rounded-xl border border-grey-light overflow-hidden mb-2">`;
            html += `<div class="config-filter-group__header flex items-center justify-between px-4 py-2.5 border-b border-grey-light cursor-pointer select-none transition-colors" onclick="window.configWizard._toggleMachineCategory('${catKey}')">`;
            html += `<span class="config-filter-group__title">${cat.label}</span>`;
            html += `<i class="config-filter-group__chevron bi ${isExpanded ? 'bi-chevron-up' : 'bi-chevron-down'}"></i>`;
            html += `</div>`;

            if (isExpanded) {
                html += `<div>`;
                cat.items.forEach(m => {
                    if (catKey === 'custom') {
                        const sel = this.wizardData.machine && this.wizardData.machine.id === m.id;
                        html += `<div class="config-filter-choice machine-select-item ${sel ? 'is-selected' : ''} flex items-center gap-3 px-3 py-2.5 transition-colors cursor-pointer" data-machine-id="${m.id}">`;
                        html += `<div class="config-filter-choice__control ${sel ? 'is-selected' : ''} w-4 h-4 rounded-full flex items-center justify-center"><div class="w-1.5 h-1.5 rounded-full ${sel ? 'bg-white' : ''}"></div></div>`;
                        html += `<span class="config-filter-choice__label">${m.name}</span>`;
                        html += `</div>`;
                        if (sel) {
                            html += '<div class="pt-2 space-y-2">';
                            ['X', 'Y', 'Z'].forEach(axis => {
                                const lc = axis.toLowerCase();
                                const drive = (this.wizardData.customDrives || {})[lc] || 'belt';
                                const pitch = (this.wizardData.customBeltPitch || {})[lc] || 2;
                                const teeth = (this.wizardData.customPulleyTeeth || {})[lc] || 20;
                                const lead = (this.wizardData.customLead || {})[lc] || 5;
                                const endstop = (this.wizardData.customEndstops || {})[lc] || 'min';
                                html += '<div class="px-3 py-2 border-t border-grey-light">';
                                html += `<div class="font-bold text-xs text-secondary-dark mb-2">${axis} Axis</div>`;
                                html += '<div class="config-wizard-axis-fields grid grid-cols-2">';
                                html += '<div><label class="ooznest-label block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-0.5">Drive</label>';
                                html += `<select onchange="window.configWizard.wizardData.customDrives.${lc}=this.value;window.configWizard._renderWizardStep()" class="ooznest-select oz-select w-full text-xs">`;
                                html += `<option value="belt" ${drive === 'belt' ? 'selected' : ''}>Belt</option>`;
                                html += `<option value="leadscrew" ${drive === 'leadscrew' ? 'selected' : ''}>Leadscrew</option>`;
                                html += '</select></div>';
                                html += '<div><label class="ooznest-label block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-0.5">Travel (mm)</label>';
                                html += `<input type="number" step="1" id="w-custom-travel-${lc}" oninput="window.configWizard.wizardData.machine.travel.${lc} = Number(this.value); window.configWizard._updateContinueState()" value="${(this.wizardData.machine.travel || {})[lc] || 0}" placeholder="e.g. 270" class="ooznest-field input-field w-full">`;
                                html += '</div>';
                                if (drive === 'belt') {
                                    html += '<div><label class="ooznest-label block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-0.5">Belt pitch (mm)</label>';
                                    html += `<input type="number" step="0.1" value="${pitch}" onchange="window.configWizard.wizardData.customBeltPitch.${lc}=parseFloat(this.value)||2" class="ooznest-field input-field w-full">`;
                                    html += '</div>';
                                    html += '<div><label class="ooznest-label block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-0.5">Pulley teeth</label>';
                                    html += `<input type="number" step="1" value="${teeth}" onchange="window.configWizard.wizardData.customPulleyTeeth.${lc}=parseInt(this.value)||20" class="ooznest-field input-field w-full">`;
                                    html += '</div>';
                                } else {
                                    html += '<div><label class="ooznest-label block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-0.5">Lead (mm/rev)</label>';
                                    html += `<input type="number" step="0.1" value="${lead}" onchange="window.configWizard.wizardData.customLead.${lc}=parseFloat(this.value)||5" class="ooznest-field input-field w-full">`;
                                    html += '</div><div></div>';
                                }
                                html += '<div class="col-span-2"><label class="ooznest-label block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-0.5">Endstop</label>';
                                html += `<select onchange="window.configWizard.wizardData.customEndstops.${lc}=this.value" class="ooznest-select oz-select w-full text-xs">`;
                                html += `<option value="min" ${endstop === 'min' ? 'selected' : ''}>${axis} min</option>`;
                                html += `<option value="max" ${endstop === 'max' ? 'selected' : ''}>${axis} max</option>`;
                                html += '</select></div>';
                                html += '</div></div>';
                            });
                            html += '</div>';
                        }
                    } else {
                        const sel = this.wizardData.machine && this.wizardData.machine.id === m.id;
                        html += `<div class="config-filter-choice machine-select-item ${sel ? 'is-selected' : ''} flex items-center gap-3 px-3 py-2.5 transition-colors cursor-pointer" data-machine-id="${m.id}">`;
                        html += `<div class="config-filter-choice__control ${sel ? 'is-selected' : ''} w-4 h-4 rounded-full flex items-center justify-center"><div class="w-1.5 h-1.5 rounded-full ${sel ? 'bg-white' : ''}"></div></div>`;
                        html += `<span class="config-filter-choice__label">${m.name}<span class="block text-xs text-grey">(Working Area: ${m.travel.x}×${m.travel.y}mm)</span></span>`;
                        html += `</div>`;
                    }
                });

                // Z2 custom size option
                if (catKey === 'z2') {
                    const isCustomSize = this.wizardData.machine && this.wizardData.machine.id === 'z2-custom';
                    html += `<div class="config-filter-choice machine-select-item ${isCustomSize ? 'is-selected' : ''} flex items-center gap-3 px-3 py-2.5 transition-colors cursor-pointer" data-machine-id="z2-custom">`;
                    html += `<div class="config-filter-choice__control ${isCustomSize ? 'is-selected' : ''} w-4 h-4 rounded-full flex items-center justify-center"><div class="w-1.5 h-1.5 rounded-full ${isCustomSize ? 'bg-white' : ''}"></div></div>`;
                    html += `<span class="config-filter-choice__label">Custom Size</span>`;
                    html += `</div>`;
                    if (isCustomSize) {
                        html += '<div class="config-wizard-axis-fields grid grid-cols-2 px-4 py-3">';
                        for (const [axis, dimension, key] of [['X', 'width', 'customWidth'], ['Y', 'length', 'customLength']]) {
                            const size = this.wizardData[key];
                            const travel = size === '' ? '' : size - Z2_TRAVEL_OFFSET_MM;
                            html += `<div><label class="ooznest-label block" for="w-custom-${dimension}">Machine ${axis} Size (mm)</label>`;
                            html += `<input type="number" min="${Z2_TRAVEL_OFFSET_MM + 1}" step="1" id="w-custom-${dimension}" value="${size}" class="ooznest-field input-field w-full"></div>`;
                            html += `<div><label class="ooznest-label block" for="w-z2-travel-${dimension}">${axis} Travel (mm)</label>`;
                            html += `<input type="number" min="1" step="1" id="w-z2-travel-${dimension}" value="${travel}" class="ooznest-field input-field w-full"></div>`;
                        }
                        html += '</div>';
                    }
                }

                html += `</div>`;
            }

            html += `</div>`;
        });

        if (this._getFirmwareForMachine()) {
            const checked = this.wizardData.skipFirmware ? ' checked' : '';
            html += '<label class="mt-4 flex items-center gap-3 rounded-xl border border-grey-light bg-white px-4 py-3 text-xs text-grey-dark cursor-pointer">';
            html += `<input id="config-wizard-skip-firmware" type="checkbox"${checked} class="accent-primary rounded shrink-0" style="width:16px;height:16px;min-height:16px;padding:0;border:0;box-shadow:none;background:transparent;flex:0 0 auto;">`;
            html += '<span><span class="font-bold text-secondary-dark">Don\'t flash firmware</span><br><span class="text-[11px] text-grey">Continue with the settings configuration only.</span></span>';
            html += '</label>';
        }

        return html;
    }

    async _loadToolheadOptions() {
        if (this._toolheadRequest || !this.ws.isConnected) return;
        const request = {};
        this._toolheadRequest = request;
        this._toolheadLoadError = '';
        const settings = {};
        const values = {};
        const collect = line => {
            const value = line.match(/^\$(395|511|512)=(\d+)$/);
            if (value) values[value[1]] = Number(value[2]);
            if (!line.startsWith('[SETTING:')) return;
            const parts = line.slice(9, -1).split('|');
            if (TOOLHEAD_SLOTS.some(slot => slot.id === parts[0]) && parts[4] === '3') {
                settings[parts[0]] = (parts[5] || '').split(',').map((name, value) => ({ name: name.trim(), value }));
            }
        };
        this.ws.on('line', collect);
        try {
            // $ES contains the same indexed choices as $$=395/511/512, without guessing offsets.
            const result = await this.ws.sendCommandWithAck('$ES');
            if (result.response !== 'ok') throw new Error('The controller did not return its toolhead options.');
            const current = await this.ws.sendCommandWithAck('$$');
            if (current.response !== 'ok') throw new Error('The controller did not return its current toolhead assignments.');
            if (settings['512'] && values['512'] === undefined) throw new Error('Could not read the existing third toolhead assignment.');
            if (!settings['395']?.some(option => option.name)) throw new Error('No primary toolhead options were reported.');
            if (this._toolheadRequest !== request) return;
            this._toolheadSettings = settings;
            for (const { id } of TOOLHEAD_SLOTS) {
                const options = this._getToolheadOptions(id);
                if (id === '512') {
                    this.wizardData.toolheads[id] = options.find(option => option.value === values[id])?.key ?? null;
                    continue;
                }
                if (!options.some(option => option.key === this.wizardData.toolheads[id])) {
                    this.wizardData.toolheads[id] = options.find(option => option.kind === 'disabled')?.key ?? null;
                }
            }
        } catch (error) {
            if (this._toolheadRequest === request) this._toolheadLoadError = error.message;
        } finally {
            this.ws.off('line', collect);
            if (this._toolheadRequest === request) {
                this._toolheadRequest = null;
                if (this.wizardStep === 1 && this.modal?.isOpen()) this._renderWizardStep();
            }
        }
    }

    _getToolheadOptions(id) {
        return getToolheadOptions(this._toolheadSettings?.[id] || [], this.wizardData.machine?.routers || []);
    }

    _availableToolheadOptions(id) {
        const assigned = new Set(this._selectedToolheads()
            .filter(slot => slot.id !== id && slot.option && slot.option.kind !== 'disabled')
            .map(slot => slot.option.source));
        return this._getToolheadOptions(id).filter(option => option.kind === 'disabled'
            || option.key === this.wizardData.toolheads[id] || !assigned.has(option.source));
    }

    _selectedToolheads() {
        return TOOLHEAD_SLOTS.map(slot => ({
            ...slot,
            option: this._getToolheadOptions(slot.id).find(option => option.key === this.wizardData.toolheads[slot.id])
        }));
    }

    _toolheadValidationError() {
        if (!this.ws.isConnected) return 'Connect to read the available toolheads.';
        if (this._toolheadRequest) return 'Reading available toolheads…';
        if (this._toolheadLoadError) return this._toolheadLoadError;
        const selected = this._selectedToolheads();
        if (!selected[0].option || selected[0].option.kind === 'disabled') return 'Choose a primary toolhead.';
        const used = new Set();
        for (const { id, option } of selected) {
            if (!this._toolheadSettings[id]) continue;
            if (!option) return 'Choose a toolhead or None for each available slot.';
            if (option.kind === 'disabled') continue;
            if (used.has(option.source)) return 'Each output or VFD can only be assigned to one toolhead.';
            used.add(option.source);
        }
        return '';
    }

    _renderRouterStep() {
        if (!this._toolheadSettings['395'] && !this._toolheadRequest && !this._toolheadLoadError && this.ws.isConnected) {
            void this._loadToolheadOptions();
        }
        let html = '<p class="text-sm text-grey mb-4">Choose your primary toolhead, then add any other toolheads fitted to your machine.</p>';
        for (const { id, label } of TOOLHEAD_SLOTS.filter(slot => slot.id !== '512')) {
            const options = this._availableToolheadOptions(id);
            const selected = this.wizardData.toolheads[id];
            const selection = this._getToolheadOptions(id).find(option => option.key === selected);
            const expanded = (this._expandedToolheadSlot ?? '395') === id;
            html += '<div class="config-filter-group bg-white rounded-xl border border-grey-light overflow-hidden mb-2">';
            html += `<button type="button" class="config-filter-group__header flex items-center justify-between w-full text-left px-4 py-2.5 border-b border-grey-light cursor-pointer" aria-expanded="${expanded}" aria-controls="wizard-toolhead-${id}" onclick="window.configWizard._toggleToolheadSlot('${id}')">`;
            html += `<span class="config-filter-group__title">${label}</span>`;
            html += '<span class="ml-auto text-xs text-grey">';
            if (!expanded) html += '<span class="text-secondary-dark underline">(Change)</span>&nbsp; ';
            html += `${this._escapeHtml(selection?.name || (id === '395' ? 'Choose a toolhead' : 'None'))}</span>`;
            html += `<i aria-hidden="true" class="config-filter-group__chevron bi ${expanded ? 'bi-chevron-up' : 'bi-chevron-down'}"></i></button>`;
            if (expanded) {
                html += `<div id="wizard-toolhead-${id}" role="radiogroup" aria-label="${label}">`;
                for (const option of options) {
                    const checked = option.key === selected;
                    html += `<label class="toolhead-option config-filter-choice ${checked ? 'is-selected' : ''} flex items-center gap-3 px-3 py-2.5 cursor-pointer">`;
                    html += `<input type="radio" name="wizard-toolhead-${id}" data-toolhead-slot="${id}" value="${option.key}" class="sr-only" ${checked ? 'checked' : ''}>`;
                    html += `<span aria-hidden="true" class="config-filter-choice__control ${checked ? 'is-selected' : ''} w-4 h-4 rounded-full flex items-center justify-center"><span class="w-1.5 h-1.5 rounded-full ${checked ? 'bg-white' : ''}"></span></span>`;
                    html += `<span class="config-filter-choice__label">${this._escapeHtml(option.name)}</span></label>`;
                }
                if (!options.length) html += `<p class="text-sm text-grey px-3 py-3">${this._toolheadRequest ? 'Reading toolheads…' : 'Not available on this controller'}</p>`;
                html += '</div>';
            }
            html += '</div>';
        }
        const error = this._toolheadValidationError();
        if (error) html += `<p class="text-sm text-grey mt-2" role="status">${this._escapeHtml(error)}</p>`;
        if (this._toolheadLoadError) html += '<button id="wizard-retry-toolheads" class="btn btn-secondary mt-3">Read toolheads again</button>';
        return html;
    }

    _toggleToolheadSlot(id) {
        this._expandedToolheadSlot = this._expandedToolheadSlot === id ? '' : id;
        this._renderWizardStep();
    }

    _toggleMachineCategory(catKey) {
        this._expandedMachineCat = this._expandedMachineCat === catKey ? null : catKey;
        this._renderWizardStep();
    }

    _calcStepsPerMM(axis, machine) {
        if (machine.category !== 'custom') return 400;
        const drive = (machine.customDrives || {})[axis] || 'belt';
        if (drive === 'leadscrew') {
            const lead = (machine.customLead || {})[axis] || 5;
            return Math.round(1600 / lead);
        }
        const pitch = (machine.customBeltPitch || {})[axis] || 2;
        const teeth = (machine.customPulleyTeeth || {})[axis] || 20;
        return Math.round(1600 / (pitch * teeth)) || 40;
    }

    _getMachineConfig(machine) {
        if (!machine || !machine.travel) return '';
        const t = machine.travel;
        const axes = ['x','y','z'];
        const lines = [];
        if (machine.category === 'custom') {
            let homingMask = (Number(window.grblSettings?.settings['23']?.val) || 0) & ~7;
            axes.forEach((axis, i) => {
                // grblHAL homes towards max unless the axis direction bit is set.
                if ((machine.customEndstops?.[axis] || 'min') === 'min') homingMask |= 1 << i;
            });
            lines.push(`$23=${homingMask}`);
        }
        axes.forEach((axis, i) => {
            const s = this._calcStepsPerMM(axis, machine);
            lines.push(`$${100 + i}=${s.toFixed(3)}`);
        });
        axes.forEach((axis, i) => {
            const val = t[axis] || 0;
            lines.push(`$${130 + i}=${val.toFixed(3)}`);
        });
        ['$140=1.400', '$141=1.400', '$142=1.400'].forEach(line => lines.push(line));
        return this._syncGangedYAxisSteps(lines).join('\n');
    }

    _syncGangedYAxisSteps(lines = []) {
        // Only send $103 if the controller actually supports Y2 (ganged Y)
        if (!window.grblSettings?.settings['103']) return lines;

        const y1Line = lines.find(line => line.startsWith('$101='));
        if (!y1Line) return lines;

        const y1Value = y1Line.split('=')[1];
        const y2Index = lines.findIndex(line => line.startsWith('$103='));
        if (y2Index >= 0) {
            lines[y2Index] = `$103=${y1Value}`;
        } else {
            lines.splice(2, 0, `$103=${y1Value}`);
        }

        return lines;
    }

    _computeToolheadAssignments() {
        return Object.fromEntries(this._selectedToolheads()
            .filter(({ id, option }) => id !== '512' && option)
            .map(({ id, option }) => [`$${id}`, { name: option.name, value: option.value }]));
    }

    _toolheadProfile() {
        const selected = this._selectedToolheads();
        return {
            primary: selected[0].option,
            secondary: selected[1].option,
            additional: selected[2].option,
            spindle: selected[0].option?.profile,
            laser: selected.some(({ option }) => option?.kind === 'laser'),
            vfdModbusEnabled: selected.some(({ option }) => option?.kind === 'vfd')
        };
    }

    _renderProbePlateStep() {
        const s = this.store.data.probe;
        const selected = this.wizardData.probeType;
        let html = '<p class="text-sm text-grey mb-4">Do you have a probe plate?</p>';
        html += '<div class="config-filter-group bg-white rounded-xl border border-grey-light overflow-hidden">';
        html += '<div>';
        [
            { value: 'ooznest', label: 'WorkBee XYZ Touch Probe' },
            { value: 'custom', label: 'Custom Probe Plate' },
            { value: 'none', label: 'No Probe Plate' }
        ].forEach(opt => {
            const sel = selected === opt.value;
            html += `<div class="probe-option config-filter-choice ${sel ? 'is-selected' : ''} flex items-center gap-3 px-3 py-2.5 transition-colors cursor-pointer" data-value="${opt.value}">`;
            html += `<div class="config-filter-choice__control ${sel ? 'is-selected' : ''} w-4 h-4 rounded-full flex items-center justify-center"><div class="w-1.5 h-1.5 rounded-full ${sel ? 'bg-white' : ''}"></div></div>`;
            html += `<span class="config-filter-choice__label">${opt.label}</span>`;
            html += '</div>';
            if (sel && opt.value === 'custom') {
                html += '<div class="px-4 pt-3 pb-3 bg-grey-bg/30">';
                html += '<div class="grid grid-cols-2 gap-4">';
                html += '<div>';
                html += '<label class="ooznest-label block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-1">Plate Thickness (mm)</label>';
                html += `<input type="number" step="0.1" id="wizard-plate-thickness" value="${s.plateThickness || 5}" class="ooznest-field input-field w-full">`;
                html += '</div>';
                html += '<div>';
                html += '<label class="ooznest-label block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-1">XY Plate Offset (mm)</label>';
                html += `<input type="number" step="0.1" id="wizard-plate-offset" value="${s.xyPlateOffset || 10}" class="ooznest-field input-field w-full">`;
                html += '</div>';
                html += '</div>';
                html += '</div>';
            }
        });
        html += '</div>';
        html += '</div>';

        return html;
    }

    _renderDustShoeStep() {
        const selected = this.wizardData.dustShoe;
        let html = '<p class="text-sm text-grey mb-4">Do you have a dust shoe?</p>';
        html += '<div class="config-filter-group bg-white rounded-xl border border-grey-light overflow-hidden">';
        html += '<div>';
        [
            { value: true, label: 'Yes, I have one' },
            { value: false, label: 'No Dust Shoe' }
        ].forEach(opt => {
            const sel = selected === opt.value;
            html += `<div class="dust-shoe-option config-filter-choice ${sel ? 'is-selected' : ''} flex items-center gap-3 px-3 py-2.5 transition-colors cursor-pointer" data-value="${opt.value}">`;
            html += `<div class="config-filter-choice__control ${sel ? 'is-selected' : ''} w-4 h-4 rounded-full flex items-center justify-center"><div class="w-1.5 h-1.5 rounded-full ${sel ? 'bg-white' : ''}"></div></div>`;
            html += `<span class="config-filter-choice__label">${opt.label}</span>`;
            html += '</div>';
        });
        html += '</div>';
        html += '</div>';
        return html;
    }

    _renderEnclosureStep() {
        const selected = this.wizardData.enclosure;
        let html = '<p class="text-sm text-grey mb-4">Do you have a WorkBee Enclosure?</p>';
        html += '<div class="config-filter-group bg-white rounded-xl border border-grey-light overflow-hidden">';
        html += '<div>';
        [
            { value: true, label: 'Yes, I have one' },
            { value: false, label: 'No Enclosure' }
        ].forEach(opt => {
            const sel = selected === opt.value;
            html += `<div class="enclosure-option config-filter-choice ${sel ? 'is-selected' : ''} flex items-center gap-3 px-3 py-2.5 transition-colors cursor-pointer" data-value="${opt.value}">`;
            html += `<div class="config-filter-choice__control ${sel ? 'is-selected' : ''} w-4 h-4 rounded-full flex items-center justify-center"><div class="w-1.5 h-1.5 rounded-full ${sel ? 'bg-white' : ''}"></div></div>`;
            html += `<span class="config-filter-choice__label">${opt.label}</span>`;
            html += '</div>';
        });
        html += '</div>';
        html += '</div>';
        return html;
    }

    _renderWifiSetupStep() {
        const isStation = this.wizardData.wifiMode === '1';
        let html = '<p class="text-sm text-grey mb-4">Enable WiFi?</p>';
        html += '<div class="config-filter-group bg-white rounded-xl border border-grey-light overflow-hidden">';
        html += '<div>';
        [
            { value: '1', label: 'Yes, Enable WiFi' },
            { value: '0', label: 'No, leave WiFi Disabled' }
        ].forEach(opt => {
            const sel = this.wizardData.wifiMode === opt.value;
            html += `<div class="wifi-mode-option config-filter-choice ${sel ? 'is-selected' : ''} flex items-center gap-3 px-3 py-2.5 transition-colors cursor-pointer" data-value="${opt.value}">`;
            html += `<div class="config-filter-choice__control ${sel ? 'is-selected' : ''} w-4 h-4 rounded-full flex items-center justify-center"><div class="w-1.5 h-1.5 rounded-full ${sel ? 'bg-white' : ''}"></div></div>`;
            html += `<span class="config-filter-choice__label">${opt.label}</span>`;
            html += '</div>';
        });
        if (isStation) {
            html += '<div class="px-4 py-3 bg-grey-bg/30 space-y-4">';
            html += '<div>';
            html += '<label class="ooznest-label block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-1.5">WiFi Network Name</label>';
            html += `<input type="text" maxlength="64" value="${this._escapeHtml(this.wizardData.wifiSsid || '')}" oninput="window.configWizard.wizardData.wifiSsid=this.value;window.configWizard._updateContinueState()" class="ooznest-field input-field w-full" placeholder="WiFi network name">`;
            html += '</div>';
            html += '<div>';
            html += '<label class="ooznest-label block text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-1.5">WiFi Password</label>';
            html += `<input type="password" minlength="8" maxlength="32" value="${this._escapeHtml(this.wizardData.wifiPsk || '')}" oninput="window.configWizard.wizardData.wifiPsk=this.value;window.configWizard._updateContinueState()" class="ooznest-field input-field w-full" placeholder="8 to 32 characters">`;
            html += '</div>';
            html += '</div>';
        }
        html += '</div>';
        html += '</div>';

        return html;
    }

    _getFirmwareForMachine() {
        const category = this.wizardData.machine?.category;
        if (category === 'z1+') return { key: 'firmwarez1', label: 'WorkBee Z1+' };
        if (category === 'z2') return { key: 'firmwarez2', label: 'WorkBee Z2' };
        return null;
    }

    _renderFirmwareStep() {
        const firmware = this._getFirmwareForMachine();
        if (!firmware) {
            return '<div class="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2"><i data-lucide="info" style="width:14px;height:14px"></i><p class="text-xs text-blue-700">Firmware flashing is not available for custom machines. Continue to review and apply the configuration.</p></div>';
        }

        let html = '<p class="text-sm text-grey mb-4">Click Flash to install the correct firmware for your machine onto your controller.</p>';
        if (this.wizardData.firmwareFlashed) {
            html += '<div class="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2"><i data-lucide="check-circle" style="width:14px;height:14px"></i><p class="text-xs text-green-700">Firmware flashed successfully. Continue to review and apply your configuration.</p></div>';
        } else {
            html += '<button id="config-wizard-flash-firmware" class="btn btn-primary mt-4"><i data-lucide="cpu"></i> Flash ' + firmware.label + ' Firmware</button>';
        }
        return html;
    }

    _renderApplyStep() {
        const machine = this.wizardData.machine;
        const assignments = this._computeToolheadAssignments();
        const wifiLines = this._getWifiConfigLines();

        let html = '<p class="text-sm text-grey mb-4">Review your configuration before applying:</p>';
        html += '<div class="bg-grey-bg rounded-lg p-4 space-y-3 border border-grey-light">';

        if (machine) {
            const machineFamilies = { 'z1+': 'WorkBee Z1+', z2: 'WorkBee Z2', custom: 'Other' };
            const machineLabel = `${machineFamilies[machine.category] || 'Other'} ${machine.name}`;
            html += `<div class="flex justify-between"><span class="text-xs text-grey">Machine</span><span class="text-xs font-bold text-grey-dark">${this._escapeHtml(machineLabel)}</span></div>`;
        }

        // Toolhead assignments
        if (Object.keys(assignments).length) {
            const labels = { '$395': 'Primary Toolhead', '$511': 'Secondary Toolhead' };
            html += '<div class="border-t border-grey-light pt-2"></div>';
            Object.entries(assignments).forEach(([setting, info]) => {
                const label = labels[setting] || setting;
                html += `<div class="flex justify-between"><span class="text-xs text-grey">${label}</span><span class="text-xs font-bold text-grey-dark">${this._escapeHtml(info.name)}</span></div>`;
            });
        }

        html += '<div class="border-t border-grey-light pt-2"></div>';
        const probeLabel = this.wizardData.probeType === 'ooznest'
            ? 'WorkBee XYZ Touch Probe'
            : this.wizardData.probeType === 'custom'
                ? 'Custom Probe Plate'
                : 'No Probe Plate';
        html += `<div class="flex justify-between"><span class="text-xs text-grey">Probe Plate</span><span class="text-xs font-bold text-grey-dark">${probeLabel}</span></div>`;
        html += `<div class="flex justify-between"><span class="text-xs text-grey">Dust Shoe</span><span class="text-xs font-bold text-grey-dark">${this.wizardData.dustShoe ? 'Yes, I have one' : 'No Dust Shoe'}</span></div>`;
        html += `<div class="flex justify-between"><span class="text-xs text-grey">Enclosure</span><span class="text-xs font-bold text-grey-dark">${this.wizardData.enclosure ? 'Yes, I have one' : 'No Enclosure'}</span></div>`;
        html += `<div class="flex justify-between"><span class="text-xs text-grey">WiFi</span><span class="text-xs font-bold text-grey-dark">${this.wizardData.wifiMode === '1' ? 'Yes, Enable WiFi' : 'No, leave WiFi Disabled'}</span></div>`;
        if (this.wizardData.wifiMode === '1') {
            html += `<div class="flex justify-between"><span class="text-xs text-grey">WiFi Network Name</span><span class="text-xs font-bold text-grey-dark">${this._escapeHtml(this.wizardData.wifiSsid || '')}</span></div>`;
        }

        html += '</div>';

        if (machine) {
            const configLines = this._getMachineConfig(machine).split('\n').filter(l => l.trim());
            const defaultLines = ['$1=255', '$4=0', '$9=5', '$10=511', '$22=3', '$32=1', '$40=1', '$300=Workbee', '$650=1', '$709=17', '$753=4'];
            const toolheadLines = Object.entries(assignments).map(([setting, info]) => `${setting}=${info.value}`);
            const totalSettings = configLines.length + wifiLines.length + defaultLines.length + toolheadLines.length;
            html += `<div class="mt-3"><p class="text-[10px] font-bold text-grey-dark uppercase tracking-wider mb-1">Grbl Settings to apply (${totalSettings} settings)</p>`;
            html += `<div class="bg-white border border-grey-light rounded-lg p-2 max-h-32 overflow-y-auto text-[10px] font-mono text-grey-dark leading-relaxed">`;
            html += configLines.concat(wifiLines, toolheadLines, defaultLines).map(l => `<div>${this._escapeHtml(l)}</div>`).join('');
            html += '</div></div>';
        }

        html += '<div class="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">';
        html += '<i data-lucide="triangle-alert" style="width:14px;height:14px"></i>';
        html += '<p class="text-[10px] text-amber-700">This will overwrite your current Grbl settings and perform a soft reset. Make sure you have a backup of your current configuration.</p>';
        html += '</div>';
        html += '<div id="config-wizard-status" class="mt-4"></div>';

        return html;
    }

    _wireStepEvents() {
        if (this.wizardStep === 0 && this.wizardData.machine?.id === 'z2-custom') {
            for (const [dimension, key] of [['width', 'customWidth'], ['length', 'customLength']]) {
                const size = document.getElementById(`w-custom-${dimension}`);
                const travel = document.getElementById(`w-z2-travel-${dimension}`);
                if (!size || !travel) continue;
                size.oninput = () => {
                    this.wizardData[key] = size.value === '' ? '' : size.valueAsNumber;
                    travel.value = size.value === '' ? '' : size.valueAsNumber - Z2_TRAVEL_OFFSET_MM;
                    this._updateContinueState();
                };
                travel.oninput = () => {
                    this.wizardData[key] = travel.value === '' ? '' : travel.valueAsNumber + Z2_TRAVEL_OFFSET_MM;
                    size.value = this.wizardData[key];
                    this._updateContinueState();
                };
            }
        }

        // Machine selection
        document.querySelectorAll('.machine-select-item').forEach(el => {
            el.onclick = () => {
                const id = el.dataset.machineId;
                if (id === 'z2-custom') {
                    const z2Template = this.machines.find(m => m.category === 'z2');
                    this.wizardData.machine = {
                        id: 'z2-custom',
                        name: 'Custom Size',
                        category: 'z2',
                        travel: { x: 0, y: 0, z: 88 },
                        routers: z2Template ? [...z2Template.routers] : []
                    };
                } else {
                    this.wizardData.machine = this.machines.find(m => m.id === id) || null;
                }
                this.wizardData.firmwareFlashed = false;
                this.wizardData.toolheads = { '395': null, '511': null, '512': null };
                this._renderWizardStep();
            };
        });

        const skipFirmwareCheckbox = document.getElementById('config-wizard-skip-firmware');
        if (skipFirmwareCheckbox) {
            skipFirmwareCheckbox.onchange = () => {
                this.wizardData.skipFirmware = skipFirmwareCheckbox.checked;
                this._renderWizardStep();
            };
        }

        document.querySelectorAll('[data-toolhead-slot]').forEach(el => {
            el.onchange = () => {
                this.wizardData.toolheads[el.dataset.toolheadSlot] = el.value;
                this._expandedToolheadSlot = '';
                this._renderWizardStep();
            };
        });
        const retryToolheads = document.getElementById('wizard-retry-toolheads');
        if (retryToolheads) retryToolheads.onclick = () => {
            this._toolheadLoadError = '';
            this._renderWizardStep();
        };

        // Probe selection
        document.querySelectorAll('.probe-option').forEach(el => {
            el.onclick = () => {
                this._onProbeTypeChange(el.dataset.value);
            };
        });


        // Dust shoe selection
        document.querySelectorAll('.dust-shoe-option').forEach(el => {
            el.onclick = () => {
                this.wizardData.dustShoe = el.dataset.value === 'true';
                this._renderWizardStep();
            };
        });

        // Enclosure selection
        document.querySelectorAll('.enclosure-option').forEach(el => {
            el.onclick = () => {
                this.wizardData.enclosure = el.dataset.value === 'true';
                this._renderWizardStep();
            };
        });

        // WiFi mode selection
        document.querySelectorAll('.wifi-mode-option').forEach(el => {
            el.onclick = () => {
                this.wizardData.wifiMode = el.dataset.value;
                this._renderWizardStep();
            };
        });

        const flashButton = document.getElementById('config-wizard-flash-firmware');
        if (flashButton) {
            flashButton.onclick = () => {
                const firmware = this._getFirmwareForMachine();
                if (!firmware || !window.firmwareFlasher) return;
                this._captureMachineStep();
                window.firmwareFlasher.showModal({
                    firmwareKey: firmware.key,
                    lockSelection: true,
                    backupSettingsBeforeFlash: false,
                    onFlashComplete: (firmwareKey) => {
                        if (firmwareKey !== this._getFirmwareForMachine()?.key) return;
                        this.wizardData.firmwareFlashed = true;
                        this._toolheadSettings = {};
                        this._toolheadLoadError = '';
                        this.wizardStep = 1;
                        this._renderWizardStep();
                    }
                });
            };
        }
    }

    _canProceed() {
        switch (this.wizardStep) {
            case 0: {
                const m = this.wizardData.machine;
                if (!m) return false;
                if (m.id === 'z2-custom') {
                    const { customWidth, customLength } = this.wizardData;
                    return [customWidth, customLength].every(size => Number.isInteger(size) && size > Z2_TRAVEL_OFFSET_MM);
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
                return !this._toolheadValidationError();
            }
            case 5: {
                if (this.wizardData.wifiMode !== '1') return true;
                const ssid = (this.wizardData.wifiSsid || '').trim();
                const psk = this.wizardData.wifiPsk || '';
                return ssid.length > 0 && psk.length >= 8 && psk.length <= 32;
            }
            default: return true;
        }
    }

    _updateContinueState() {
        const continueButton = document.getElementById('config-wizard-continue')
            || document.getElementById('config-wizard-flash-firmware');
        if (continueButton) continueButton.disabled = !this._canProceed();
    }

    _onProbeTypeChange(value) {
        this.wizardData.probeType = value;
        if (value === 'ooznest') {
            this.wizardData.plateThickness = 5;
            this.wizardData.xyPlateOffset = 10;
        }
        this._renderWizardStep();
    }

    _nextStep() {
        if (!this._canProceed()) return;
        // Capture form values before moving
        if (this.wizardStep === 0) {
            this._captureMachineStep();
        }
        if (this.wizardStep === 2) {
            if (this.wizardData.probeType === 'custom') {
                const thick = document.getElementById('wizard-plate-thickness');
                const offset = document.getElementById('wizard-plate-offset');
                if (thick) this.wizardData.plateThickness = parseFloat(thick.value) || 5;
                if (offset) this.wizardData.xyPlateOffset = parseFloat(offset.value) || 10;
            } else if (this.wizardData.probeType === 'ooznest') {
                this.wizardData.plateThickness = 5;
                this.wizardData.xyPlateOffset = 10;
            }
        }
        this.wizardStep++;
        this._renderWizardStep();
    }

    _captureMachineStep() {
        const m = this.wizardData.machine;
        if (m && m.id === 'z2-custom') {
            const { customWidth: width, customLength: length } = this.wizardData;
            m.travel = { x: width - Z2_TRAVEL_OFFSET_MM, y: length - Z2_TRAVEL_OFFSET_MM, z: 88 };
            m.name = `${width}×${length}mm`;
        } else if (m && m.category === 'custom') {
            const x = parseFloat(document.getElementById('w-custom-travel-x')?.value) || 0;
            const y = parseFloat(document.getElementById('w-custom-travel-y')?.value) || 0;
            const z = parseFloat(document.getElementById('w-custom-travel-z')?.value) || 0;
            m.travel = { x, y, z };
            m.customDrives = { ...this.wizardData.customDrives };
            m.customBeltPitch = { ...this.wizardData.customBeltPitch };
            m.customPulleyTeeth = { ...this.wizardData.customPulleyTeeth };
            m.customLead = { ...this.wizardData.customLead };
            m.customEndstops = { ...this.wizardData.customEndstops };
        }
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
        if (this._getFirmwareForMachine() && !this.wizardData.firmwareFlashed && !this.wizardData.skipFirmware) {
            this._showWizardStatus('Flash firmware successfully before applying configuration.', 'error');
            return;
        }

        const toolheadError = this._toolheadValidationError();
        if (toolheadError) {
            this._showWizardStatus(toolheadError, 'error');
            return;
        }

        // Save probe plate settings
        this.store.set('probe.plateThickness', this.wizardData.plateThickness);
        this.store.set('probe.xyPlateOffset', this.wizardData.xyPlateOffset);
        this.store.set('probe.type', this.wizardData.probeType || 'ooznest');
        this.store.set('configWizardRan', true);
        if (window.probeHandler) window.probeHandler.renderSettings();

        // Save dust shoe and enclosure for future use
        this.store.set('machine.dustShoe', this.wizardData.dustShoe);
        this.store.set('machine.enclosure', this.wizardData.enclosure);
        this.store.set('machine.wifi', JSON.stringify({
            mode: this.wizardData.wifiMode,
            ssid: this.wizardData.wifiSsid
        }));

        // Apply grbl settings
        const configLines = this._getMachineConfig(machine).split('\n').filter(l => l.trim());
        const wifiLines = this._getWifiConfigLines();
        const allConfigLines = configLines.concat(wifiLines);
        this._showWizardStatus(`Applying ${allConfigLines.length} settings...`, 'info');

        try {
            const sendSetting = async command => {
                const result = await this.ws.sendCommandWithAck(command);
                if (result.response !== 'ok') throw new Error(`${command} was rejected: ${result.response}`);
            };
            for (let i = 0; i < allConfigLines.length; i++) {
                const line = allConfigLines[i].trim();
                if (!line) continue;
                if (i % 10 === 0) {
                    this._showWizardStatus(`Setting ${i + 1} of ${allConfigLines.length}...`, 'info');
                    await this._sleep(10);
                }
                await sendSetting(line);
                await this._sleep(15);
            }

            // Apply primary and secondary toolheads; leave $512 unchanged.
            const assignments = this._computeToolheadAssignments();
            for (const [setting, info] of Object.entries(assignments)) {
                await sendSetting(`${setting}=${info.value}`);
            }

            // Enable probe ($6=1)
            await sendSetting('$6=1');
            await this._sleep(15);

            // Apply Ooznest controller defaults
            await sendSetting('$1=255');
            await this._sleep(15);
            await sendSetting('$4=0');
            await this._sleep(15);
            await sendSetting('$9=5');
            await this._sleep(15);
            await sendSetting('$10=511');
            await this._sleep(15);
            await sendSetting('$22=3');
            await this._sleep(15);
            await sendSetting('$32=1');
            await this._sleep(15);
            await sendSetting('$40=1');
            await this._sleep(15);
            await sendSetting('$300=Workbee');
            await this._sleep(15);
            await sendSetting('$650=1');
            await this._sleep(15);
            await sendSetting('$709=17');
            await this._sleep(15);
            await sendSetting('$753=4');
            await this._sleep(15);


            // Save machine config name to store
            this.store.set('machine.id', machine.id);
            this.store.set('machine.name', machine.name);
            this.store.set('machine.toolheads', JSON.stringify(this._toolheadProfile()));

            // Mark configured — send short WB code before soft reset so GRBL saves it to flash
            // WB code format: WB{size}{dust}{encl}{spindle}{laser}{probe}{cat}
            //   Pos 1-2: "WB" prefix
            //   Pos 3 (size):  A=500x500, B=750x750, C=750x1000, D=1000x1000, E=1000x1500, F=1500x1500, G=Custom
            //   Pos 4 (dust):  A=with dust shoe, B=without
            //   Pos 5 (encl):  A=with enclosure, B=without
            //   Pos 6 (spindle): A=WorkBee Router Head, B=Mafell FM 1000 (Digital), C=Mafell FM 1000 (Manual),
            //                    D=VFD (0-10v), E=legacy/unknown Modbus VFD, F=PWM Laser Module,
            //                    G-M=specific Modbus VFD models (see vfdCodes below)
            //   Pos 7 (laser): A=yes, B=no
            //   Pos 8 (probe): A=WorkBee XYZ Touch Probe, B=Custom Probe, C=None
            //   Pos 9 (cat):   A=Z1+, B=Z2, C=Custom
            const th = this._toolheadProfile();
            const sizeCodes = { '500x500':'A', '750x750':'B', '750x1000':'C', '1000x1000':'D', '1000x1500':'E', '1500x1500':'F' };
            const catCodes = { 'z1+':'A', 'z2':'B', 'custom':'C' };
            const spindleCodes = { 'workbee-router-head':'A', 'mafell-digital':'B', 'mafell-manual':'C', 'vfd-0-10v':'D', 'vfd-modbus':'E', 'laser-pwm':'F' };
            const sizePart = machine.id.split('-').slice(1).join('-') || 'custom';
            const szCode = sizeCodes[sizePart] || 'G';
            const catCode = catCodes[machine.category] || 'C';
            const vfdCodes = {
                'huanyang v1': 'G', 'huanyang p2a': 'H', 'durapulse gs20': 'I',
                'yalang ys620': 'J', 'yalang yl620a': 'J', 'modvfd': 'K',
                'h-100': 'L', 'nowforever': 'M'
            };
            const spCode = th.primary?.kind === 'vfd'
                ? vfdCodes[th.primary.source] || 'E'
                : spindleCodes[th.spindle] || 'A';
            const dustCode = this.wizardData.dustShoe ? 'A' : 'B';
            const encCode = this.wizardData.enclosure ? 'A' : 'B';
            const lasCode = th.laser ? 'A' : 'B';
            const probeCodes = { ooznest: 'A', custom: 'B', none: 'C' };
            const prbCode = probeCodes[this.wizardData.probeType] || 'A';
            const wbCode = `WB${szCode}${dustCode}${encCode}${spCode}${lasCode}${prbCode}${catCode}`;
            await sendSetting(`$I=${wbCode}`);

            this._showWizardStatus('All settings applied! Performing soft reset...', 'success');

            // Soft reset
            await this._sleep(500);
            this.ws.sendRealtime('\x18');

            // The reset applies the configuration in the controller. Refresh the
            // settings model and extended identity afterwards so Settings and
            // Troubleshooting do not retain the pre-configuration $I+ response.
            setTimeout(() => window.grblSettings?.fetchSettings?.(), 2000);
            setTimeout(() => this.ws?.sendCommand('$I+'), 3000);

            // Update viewer with new machine limits
            if (window.viewer) {
                window.viewer.setMachineLimits(machine.travel.x, machine.travel.y, machine.travel.z);
            }

            this.hideWizard();

        } catch (e) {
            this._showWizardStatus(`Error applying config: ${e.message}`, 'error');
        }
    }

    _showWizardStatus(msg, type) {
        const el = document.getElementById('config-wizard-status');
        if (!el) return;
        if (type === 'error') {
            el.innerHTML = `<div class="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2"><i data-lucide="x-circle" style="width:14px;height:14px"></i> ${msg}</div>`;
        } else if (type === 'success') {
            el.innerHTML = `<div class="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 flex items-center gap-2"><i data-lucide="check-circle" style="width:14px;height:14px"></i> ${msg}</div>`;
        } else {
            el.innerHTML = `<div class="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 flex items-center gap-2"><i data-lucide="info" style="width:14px;height:14px"></i> ${msg}</div>`;
        }
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _getWifiConfigLines() {
        const wifiEnabled = (this.wizardData.wifiMode || '0') === '1';
        const lines = [`$73=${this.wizardData.wifiMode || '0'}`, `$301=${wifiEnabled ? 1 : 0}`];
        if (wifiEnabled) {
            lines.push(`$74=${(this.wizardData.wifiSsid || '').trim()}`);
            lines.push(`$75=${this.wizardData.wifiPsk || ''}`);
        } else {
            lines.push('$322=192.168.5.1');
            lines.push('$323=192.168.5.1');
            lines.push('$324=255.255.255.0');
        }
        return lines;
    }

    _escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}
