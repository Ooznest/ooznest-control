import { registerModal } from './modal.js';

// Default Grbl 1.1 + GrblHAL Extended Errors
// Sources: gnea/grbl Wiki & grblHAL/core errors.h
const STANDARD_ERRORS = {
    '1': 'Expected command letter: G-code words consist of a letter and a value. Letter was not found.',
    '2': 'Bad number format: Missing the expected G-code word value or numeric value format is not valid.',
    '3': 'Invalid statement: Command was not recognized or supported in the current parser context.',
    '4': 'Value < 0: Negative value received for an expected positive value.',
    '5': 'Setting disabled: Homing cycle failure. Homing is not enabled via settings.',
    '6': 'Value < 3 usec: Minimum step pulse time must be greater than 3usec.',
    '7': 'EEPROM read fail: An EEPROM read failed. Auto-restoring affected EEPROM to default values.',
    '8': 'Not idle: Grbl \'$\' command cannot be used unless Grbl is IDLE. Ensures smooth operation during a job.',
    '9': 'G-code lock: G-code commands are locked out during alarm or jog state.',
    '10': 'Homing not enabled: Soft limits cannot be enabled without homing also enabled.',
    '11': 'Line overflow: Max characters per line exceeded. Received command line was not executed.',
    '12': 'Step rate > 30kHz: Grbl \'$\' setting value cause the step rate to exceed the maximum supported.',
    '13': 'Check Door: Safety door detected as opened and door state initiated.',
    '14': 'Line length exceeded: Build info or startup line exceeded EEPROM line length limit. Line not stored.',
    '15': 'Travel exceeded: Jog target exceeds machine travel. Jog command has been ignored.',
    '16': 'Invalid jog command: Jog command has no \'=\' or contains prohibited g-code.',
    '17': 'Laser mode requires PWM output.',
    '18': 'Reset asserted: A reset was issued.',
    '19': 'Non positive value: A negative or zero value was found where a positive value is required.',
    '20': 'Unsupported command: Unsupported or invalid g-code command found in block.',
    '21': 'Modal group violation: More than one g-code command from same modal group found in block.',
    '22': 'Undefined feed rate: Feed rate has not yet been set or is undefined.',
    '23': 'Command requires integer: G-code command in block requires an integer value.',
    '24': 'Axis command conflict: More than one g-code command that requires axis words found in block.',
    '25': 'Word repeated: Repeated g-code word found in block.',
    '26': 'No axis words: No axis words found in block for g-code command or current modal state which requires them.',
    '27': 'Invalid line number: Line number value is invalid.',
    '28': 'Value missing: G-code command is missing a required value word.',
    '29': 'G59.x WCS not supported: Grbl supports G54-G59 work coordinate systems. G59.1, G59.2, and G59.3 are not supported.',
    '30': 'G53 invalid: G53 only allowed with G0 and G1 motion modes.',
    '31': 'Axis words found in G80: Axis words found in block when no command or current modal state uses them.',
    '32': 'G2/G3 arcs require at least one in-plane axis word.',
    '33': 'Motion target invalid: Motion command target is invalid.',
    '34': 'Arc radius value is invalid.',
    '35': 'G2 and G3 arcs require at least one in-plane offset word.',
    '36': 'Unused value words found in block.',
    '37': 'G43.1 dynamic tool length offset is not assigned to configured tool length axis.',
    '38': 'Tool number greater than max supported value.',
    '39': 'P parameter value is too large.',

    // GrblHAL Specific Errors
    '40': 'Tool change pending: G-code command not allowed when tool change is pending.',
    '41': 'Spindle not running: Spindle not running when motion commanded in CSS or spindle sync mode.',
    '42': 'Plane must be ZX for threading.',
    '43': 'Max feed rate exceeded.',
    '44': 'RPM out of range.',
    '45': 'Limits engaged: Only homing is allowed when a limit switch is engaged.',
    '46': 'Homing required: Home machine to continue.',
    '47': 'ATC error: Current tool is not set. Set current tool with M61.',
    '48': 'Value word conflict.',
    '49': 'Power on self test failed.',
    '50': 'Emergency stop active.',
    '51': 'Motor fault.',
    '52': 'Setting value out of range.',
    '53': 'Setting not available.',
    '54': 'Retract < drill depth.',
    '55': 'Auto squared axis conflict.',
    '56': 'Coordinate system locked.',
    '57': 'Unexpected file demarcation.',
    '58': 'Port not available.',
    '60': 'SD Card mount failed.',
    '61': 'File delete failed.',
    '62': 'Directory listing failed.',
    '63': 'Directory not found.',
    '64': 'File empty or SD Card not mounted.',
    '65': 'File system not mounted.',
    '66': 'File system is read only.',
    '70': 'Bluetooth failed to start.',
    '71': 'Unknown operation found in expression.',
    '72': 'Divide by zero in expression attempted.',
    '73': 'Too large or too small argument provided.',
    '74': 'Argument is not valid for the operation.',
    '75': 'Expression is not valid.',
    '76': 'Either NAN (not a number) or infinity was returned from expression.',
    '77': 'Authentication required.',
    '78': 'Access denied.',
    '79': 'Not allowed while critical event is active.',
    '80': 'Flow statement only allowed in macro.',
    '81': 'Unknown flow statement.',
    '82': 'Stack overflow.',
    '83': 'Out of memory.',
    '84': 'Could not open file.',
    '85': 'File system format failed.',
    '86': 'Port is not usable.',
    '253': 'User defined error.'
};

const STANDARD_ALARMS = {
    '1': 'Hard limit: Machine position is likely lost due to sudden halt. Re-homing is highly recommended.',
    '2': 'Soft limit: G-code motion target exceeds machine travel. Machine position retained. Alarm may be safely unlocked.',
    '3': 'Abort during cycle: Machine position is likely lost due to sudden halt. Re-homing is highly recommended.',
    '4': 'Probe fail: Probe is not in the expected initial state before starting probe cycle.',
    '5': 'Probe fail: Probe did not contact the workpiece within the programmed travel.',
    '6': 'Homing fail: Reset during active homing cycle.',
    '7': 'Homing fail: Safety door was opened during active homing cycle.',
    '8': 'Homing fail: Cycle failed to clear limit switch when pulling off.',
    '9': 'Homing fail: Could not find limit switch within search distance.',

    // GrblHAL Specific Alarms
    '10': 'EStop asserted: Clear and reset.',
    '11': 'Homing required: Execute homing command ($H) to continue.',
    '12': 'Limit switch engaged: Clear before continuing.',
    '13': 'Probe protection triggered: Clear before continuing.',
    '14': 'Spindle at speed timeout: Clear before continuing.',
    '15': 'Auto square fail: Could not find second limit switch for auto squared axis.',
    '16': 'POS failed: Power on self test failed.',
    '17': 'Motor fault.',
    '18': 'Homing bad config.',
    '19': 'Modbus exception: Timeout or message error.',
    '20': 'I/O expander fail: Communication failed.'
};

export class AlarmsAndErrors {
    /**
     * @param {Object} ws - The WebSerial instance for sending Unlock/Reset commands
     */
    constructor(ws) {
        this.ws = ws;
        this.errors = { ...STANDARD_ERRORS };
        this.alarms = { ...STANDARD_ALARMS };

        // Track current active alarm
        this.currentAlarm = null;
        this.currentAlarmCode = null;
        this.sessionHistory = [];

        // Initialize the DOM elements for the modal
        this.initModal();

        // Listen for active alarm events from status reports (e.g. from initial connect)
        window.addEventListener('active-alarm', (e) => {
            if (e.detail && e.detail.code) {
                const newCode = e.detail.code;
                if (this.currentAlarmCode !== newCode) {
                    this.currentAlarmCode = newCode;
                    this.currentAlarm = this.alarms[newCode] || 'Unknown Alarm';
                    this._recordSessionEvent('Alarm', newCode, this.currentAlarm);
                    // Automatically trigger the Unlock Modal on startup or async status change
                    this.showModal('ALARM', newCode, this.currentAlarm);
                }
            }
        });
    }

    _recordSessionEvent(type, code, description) {
        const now = Date.now();
        const previous = this.sessionHistory[0];
        if (previous && previous.type === type && previous.code === code && now - previous.timestamp < 30000) return;

        this.sessionHistory.unshift({ type, code, description, timestamp: now });
        this.sessionHistory.splice(100);
    }

    getSessionHistory() {
        return [...this.sessionHistory];
    }

    initModal() {
        if (document.getElementById('cnc-modal-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'cnc-modal-overlay';
        overlay.className = 'oz-modal hidden z-[1200] modal-radial-overlay';

        overlay.innerHTML = `
            <div class="oz-modal__dialog w-full max-w-md" data-modal-panel>
                <div id="cnc-modal-header" class="oz-modal__header">
                    <div class="flex items-center gap-3 min-w-0">
                        <i id="cnc-modal-icon" class="bi text-xl hidden"></i>
                        <h3 id="cnc-modal-title">Title</h3>
                    </div>
                    <button type="button" data-modal-close><i data-lucide="x" ></i></button>
                </div>

                <div class="oz-modal__body">
                    <p id="cnc-modal-body" class="m-0 text-sm font-bold text-grey-dark leading-relaxed"></p>
                </div>

                <div id="cnc-modal-footer" class="oz-modal__footer oz-modal__footer--actions">
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        this.overlay = overlay;
        this.domTitle = overlay.querySelector('#cnc-modal-title');
        this.domBody = overlay.querySelector('#cnc-modal-body');
        this.domFooter = overlay.querySelector('#cnc-modal-footer');
        this.domIcon = overlay.querySelector('#cnc-modal-icon');
        this.domHeader = overlay.querySelector('#cnc-modal-header');
        this.modalController = registerModal(overlay);
    }

    configureHeader(title, iconClass = '') {
        this.domHeader.className = 'oz-modal__header';
        this.domTitle.textContent = title;
        this.domTitle.className = '';
        this.domIcon.className = iconClass || 'bi hidden';
    }

    showModal(type, code, message) {
        var self = this;
        // Close any existing modal first (only show the most recent alarm/error)
        if (this.modalController?.isOpen()) {
            this.closeModal();
        }

        // Check if alarm is critical (based on grblHAL source: alarms.h)
        const isCritical = this.isAlarmCritical(code);

        // Configure styles based on type
        if (type === 'ERROR') {
            this.overlay.dataset.tone = 'error';
            this.configureHeader(`Error ${code}`);
        } else {
            // Use darker red for critical alarms
            if (isCritical) {
                this.overlay.dataset.tone = 'critical';
                this.configureHeader(`Critical Alarm ${code}`);
            } else {
                this.overlay.dataset.tone = 'alarm';
                this.configureHeader(`Alarm ${code}`);
            }
        }

        // Add E-Stop warning for Alarm 10
        let displayMessage = message;
        if (type === 'ALARM' && code === '10') {
            displayMessage = 'Release the E-Stop switch first.\n\n' + message;
        }

        this.domBody.textContent = displayMessage;
        this.domBody.style.whiteSpace = 'pre-wrap'; // Preserve line breaks
        this.domFooter.innerHTML = ''; // Clear buttons

        // Create Buttons
        if (type === 'ERROR') {
            // Special handling for Error 9 (commands locked during alarm/jog)
            if (code === '9' && this.currentAlarmCode) {
                const alarmDesc = this.alarms[this.currentAlarmCode] || 'Unknown Alarm';
                const isCurrentCritical = this.isAlarmCritical(this.currentAlarmCode);

                // Show underlying alarm info
                let errorMsg = `${message}\n\nLast Alarm ${this.currentAlarmCode}: ${alarmDesc}\n\nClear the alarm to unlock G-code commands.`;
                if (this.currentAlarmCode === '10') {
                    errorMsg = 'Release the E-Stop switch first.\n\n' + errorMsg;
                }
                this.domBody.textContent = errorMsg;

                // Add appropriate buttons
                const btnCancel = this.createBtn('Cancel', 'btn btn-secondary', () => this.closeModal());

                if (isCurrentCritical) {
                    const btnReset = this.createBtn('Reset & Unlock', 'btn btn-danger', () => {
                        this.performCriticalReset();
                        this.closeModal();
                    });
                    this.domFooter.appendChild(btnReset);
                    this.domFooter.appendChild(btnCancel);
                } else {
                    const btnClear = this.createBtn('Clear Alarm', 'btn btn-primary', () => {
                        this.performUnlock();
                        this.closeModal();
                    });
                    this.domFooter.appendChild(btnClear);
                    this.domFooter.appendChild(btnCancel);
                }
            }
            // Special handling for Error 79 (critical event active)
            else if (code === '79' && this.currentAlarmCode) {
                const alarmDesc = this.alarms[this.currentAlarmCode] || 'Unknown Alarm';
                const isCurrentCritical = this.isAlarmCritical(this.currentAlarmCode);

                // Show underlying alarm info
                let errorMsg = `${message}\n\nActive Alarm ${this.currentAlarmCode}: ${alarmDesc}`;
                if (this.currentAlarmCode === '10') {
                    errorMsg = 'Release the E-Stop switch first.\n\n' + errorMsg;
                }
                this.domBody.textContent = errorMsg;

                // Add appropriate buttons
                const btnCancel = this.createBtn('Cancel', 'btn btn-secondary', () => this.closeModal());

                if (isCurrentCritical) {
                    const btnReset = this.createBtn('Reset & Unlock', 'btn btn-danger', () => {
                        this.performCriticalReset();
                        this.closeModal();
                    });
                    this.domFooter.appendChild(btnReset);
                    this.domFooter.appendChild(btnCancel);
                } else {
                    const btnClear = this.createBtn('Clear Alarm', 'btn btn-primary', () => {
                        this.performUnlock();
                        this.closeModal();
                    });
                    this.domFooter.appendChild(btnClear);
                    this.domFooter.appendChild(btnCancel);
                }
            } else if (code === '46') {
                // Error 46: Homing required — machine won't unlock until homed
                const override = this.getModalOverride(type, code);
                if (override?.message) this.domBody.textContent = override.message;
                this.renderFooterButtons(override?.buttons || []);
            } else {
                // Regular error - just OK button
                const btnOk = this.createBtn('OK', 'btn btn-primary', () => this.closeModal());
                this.domFooter.appendChild(btnOk);
            }
        } else {
            // ── Alarm Button Overrides ──────────────────────────────
            // For specific alarm codes where default Clear Alarm/Cancel isn't appropriate.
            // Add entries here: code → { message, buttons: [{text, class, onClick}, ...] }
            var override = this.getModalOverride(type, code);
            if (override) {
                if (override.message) this.domBody.textContent = override.message;
                this.renderFooterButtons(override.buttons || []);
            } else {
                // Default Alarm Buttons
                var btnCancel = this.createBtn('Cancel', 'btn btn-secondary', function() { self.closeModal(); });

                if (isCritical) {
                    var btnReset = this.createBtn('Reset & Unlock', 'btn btn-danger', function() {
                        self.performCriticalReset();
                        self.closeModal();
                    });
                    this.domFooter.appendChild(btnReset);
                    this.domFooter.appendChild(btnCancel);
                } else {
                    var btnClear = this.createBtn('Clear Alarm', 'btn btn-primary', function() {
                        self.performUnlock();
                        self.closeModal();
                    });
                    this.domFooter.appendChild(btnClear);
                    this.domFooter.appendChild(btnCancel);
                }
            }
        }

        this.modalController?.show();
    }

    closeModal() {
        this.modalController?.hide();
    }

    /**
     * Show a confirmation dialog (replaces window.confirm)
     * @param {string} title - Dialog title
     * @param {string} message - Dialog message
     * @param {Function} onConfirm - Callback when user confirms
     * @param {Function} onCancel - Optional callback when user cancels
     */
    showConfirm(title, message, onConfirm, onCancel, confirmText = 'OK', cancelText = 'Cancel') {
        // Yellow/primary theme for confirmations
        this.overlay.dataset.tone = 'confirm';
        this.configureHeader(title, 'bi bi-question-circle-fill text-primary-dark text-xl');

        this.domBody.textContent = message;
        this.domFooter.innerHTML = '';

        this.renderFooterButtons([
            {
                text: confirmText,
                className: 'btn btn-primary',
                onClick: async () => {
                    if (onConfirm) await onConfirm();
                    this.closeModal();
                }
            },
            {
                text: cancelText,
                className: 'btn btn-secondary',
                onClick: async () => {
                    if (onCancel) await onCancel();
                    this.closeModal();
                }
            }
        ]);

        this.modalController?.show();
    }

    /**
     * Show an alert/info dialog (replaces window.alert)
     * @param {string} title - Dialog title
     * @param {string} message - Dialog message
     * @param {Function} onOk - Optional callback when user clicks OK
     */
    showAlert(title, message, onOk) {
        // Neutral theme for alerts
        this.overlay.dataset.tone = 'info';
        this.configureHeader(title, 'bi bi-info-circle-fill text-secondary text-xl');

        this.domBody.innerHTML = message;
        this.domFooter.innerHTML = '';

        this.renderFooterButtons([
            {
                text: 'OK',
                className: 'btn btn-primary',
                onClick: async () => {
                    if (onOk) await onOk();
                    this.closeModal();
                }
            }
        ]);

        this.modalController?.show();
    }

    /**
     * Show a prompt dialog with input field (replaces window.prompt)
     * @param {string} title - Dialog title
     * @param {string} message - Dialog message
     * @param {string} defaultValue - Default input value
     * @param {Function} onSubmit - Callback with input value when user submits
     * @param {Function} onCancel - Optional callback when user cancels
     */
    showPrompt(title, message, defaultValue, onSubmit, onCancel) {
        // Primary theme for prompts
        this.overlay.dataset.tone = 'prompt';
        this.configureHeader(title, 'bi bi-pencil-square text-primary-dark text-xl');

        // Create input field in body
        this.domBody.innerHTML = `
            <p class="text-sm font-bold text-grey-dark mb-3">${message}</p>
            <input type="text" id="cnc-modal-input" 
                   class="ooznest-field w-full text-sm"
                   value="${defaultValue || ''}" />
        `;

        this.domFooter.innerHTML = '';

        const inputEl = this.domBody.querySelector('#cnc-modal-input');

        let btnSubmit;
        let btnCancel;
        this.renderFooterButtons([
            {
                text: 'OK',
                className: 'btn btn-primary',
                onClick: async () => {
                    const value = inputEl.value.trim();
                    if (onSubmit) await onSubmit(value);
                    this.closeModal();
                },
                assign: (btn) => { btnSubmit = btn; }
            },
            {
                text: 'Cancel',
                className: 'btn btn-secondary',
                onClick: async () => {
                    if (onCancel) await onCancel();
                    this.closeModal();
                },
                assign: (btn) => { btnCancel = btn; }
            }
        ]);

        this.modalController?.show();

        // Focus and select input
        setTimeout(() => {
            inputEl.focus();
            inputEl.select();
        }, 100);

        // Handle Enter key
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                btnSubmit.click();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                btnCancel.click();
            }
        });
    }

    createBtn(text, classes, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = classes;
        btn.textContent = text;
        btn.onclick = onClick;
        return btn;
    }

    renderFooterButtons(actions) {
        this.domFooter.innerHTML = '';
        actions.forEach((action) => {
            const btn = this.createBtn(action.text, action.className || action.class, action.onClick);
            this.domFooter.appendChild(btn);
            if (typeof action.assign === 'function') action.assign(btn);
        });
    }

    getModalOverride(type, code) {
        const homingButtons = [
            {
                text: 'Home Machine',
                className: 'btn btn-primary',
                onClick: () => {
                    setTimeout(() => { if (window.ws) window.ws.sendCommand('$H'); }, 500);
                    this.closeModal();
                }
            },
            { text: 'Home Later', className: 'btn btn-secondary', onClick: () => this.closeModal() }
        ];

        const overrides = {
            ERROR: {
                '46': {
                    message: 'Homing is required before the machine can be used.\n\nRun the homing cycle to clear this state.',
                    buttons: homingButtons
                }
            },
            ALARM: {
                '11': {
                    message: 'Homing required. Execute homing command ($H) to continue.',
                    buttons: homingButtons
                }
            }
        };

        return overrides[type]?.[String(code)] || null;
    }

    // Check if alarm code is critical (based on grblHAL alarms.h)
    isAlarmCritical(code) {
        const criticalAlarms = [1, 2, 10, 17, 20];
        // 1: Hard Limit
        // 2: Soft Limit
        // 10: E-Stop
        // 17: Motor Fault
        // 20: Expander Exception
        return criticalAlarms.includes(parseInt(code));
    }

    // Perform critical alarm reset sequence
    // Critical alarms require: Reset (Ctrl-X) -> Wait for reboot -> Unlock ($X)
    performCriticalReset() {
        if (this.ws) {
            if (window.uiManager?.setUnlockPending) window.uiManager.setUnlockPending();
            // Step 1: Send Ctrl-X (0x18) to reset
            this.ws.sendRealtime('\x18');

            // Step 2: Wait for controller to reboot (typically 2-3 seconds)
            setTimeout(() => {
                // Step 3: Send unlock command
                this.ws.sendCommand('$X');
            }, 3000); // 3 second delay for reboot
        }
    }

    // Perform regular unlock (for non-critical alarms)
    performUnlock() {
        // Send Soft Reset then Unlock
        if (this.ws) {
            if (window.uiManager?.setUnlockPending) window.uiManager.setUnlockPending();
            setTimeout(() => {
                this.ws.sendCommand('$X'); // Unlock
            }, 100);
        }
    }

    /**
     * Processes a line to see if it is an Error Definition, Alarm Definition,
     * Active Error report, or Active Alarm report.
     *
     * @param {string} line - The raw line from serial
     * @returns {string|boolean} - Returns a formatted string to print to console,
     *                             true if handled silently,
     *                             or false if not handled.
     */
    handleLine(line) {
        if (!line) return false;

        // 1. GrblHAL Error Definition ([ERRORCODE:1||Desc])
        if (line.startsWith('[ERRORCODE:')) {
            const inner = line.substring(11, line.length - 1);
            const parts = inner.split('||');
            if (parts.length >= 2) {
                this.errors[parts[0]] = parts[1];
            }
            return line;
        }

        // 2. GrblHAL Alarm Definition ([ALARMCODE:1||Desc])
        if (line.startsWith('[ALARMCODE:')) {
            const inner = line.substring(11, line.length - 1);
            const parts = inner.split('||');
            if (parts.length >= 2) {
                this.alarms[parts[0]] = parts[1];
            }
            return line;
        }

        // 3. Standard Grbl Error Definition ([ERR:1:Desc])
        if (line.startsWith('[ERR:')) {
            const inner = line.substring(5, line.length - 1);
            const splitIdx = inner.indexOf(':');
            if (splitIdx !== -1) {
                this.errors[inner.substring(0, splitIdx).trim()] = inner.substring(splitIdx + 1).trim();
            }
            return line;
        }

        // 4. Standard Grbl Alarm Definition ([ALM:1:Desc])
        if (line.startsWith('[ALM:')) {
            const inner = line.substring(5, line.length - 1);
            const splitIdx = inner.indexOf(':');
            if (splitIdx !== -1) {
                this.alarms[inner.substring(0, splitIdx).trim()] = inner.substring(splitIdx + 1).trim();
            }
            return line;
        }

        // 5. Active Error Report (error:X)
        if (line.toLowerCase().startsWith('error:')) {
            const parts = line.split(':');
            const code = parts[1] ? parts[1].trim() : 'Unknown';
            const desc = this.errors[code] || "Unknown Error";
            const msg = desc;

            this._recordSessionEvent('Error', code, desc);

            if (code !== '253') {
                this.showModal('ERROR', code, msg);
            }
            
            return `\x1b[31mError ${code}: ${desc}\x1b[0m`;
        }

        // 6. Active Alarm Report (alarm:X)
        if (line.toLowerCase().startsWith('alarm:')) {
            const parts = line.split(':');
            const code = parts[1] ? parts[1].trim() : 'Unknown';
            const desc = this.alarms[code] || "Unknown Alarm";
            const msg = desc;

            // Track current alarm state
            this.currentAlarm = desc;
            this.currentAlarmCode = code;
            this._recordSessionEvent('Alarm', code, desc);

            this.showModal('ALARM', code, msg);
            return `\x1b[33mAlarm ${code}: ${desc}\x1b[0m`;
        }

        // 7. Check for alarm cleared (Idle state or similar)
        // When machine returns to Idle, clear the alarm tracking
        if (line.startsWith('<Idle') || line.startsWith('<Run') || line.startsWith('<Jog')) {
            this.currentAlarm = null;
            this.currentAlarmCode = null;
        }

        return false; // Not an error or alarm line
    }
}
