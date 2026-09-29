import { registerModal } from '../ui/modal.js';

const DEAD_ZONE = 0.25;
// GRBL recommends a 25–60 ms joystick block. Small blocks keep direction
// changes responsive, while the scheduler below keeps a short planner runway.
const SEGMENT_MS = 25;
const PLANNER_TARGET_MS = 300;
const INCREMENTS_MM = [0.1, 1, 5, 10];

const BUTTONS = [
    { id: 'x', index: 2, label: 'X' },
    { id: 'y', index: 3, label: 'Y' },
    { id: 'a', index: 0, label: 'A' },
    { id: 'b', index: 1, label: 'B' },
    { id: 'left-button', index: 4, label: 'LB' },
    { id: 'right-button', index: 5, label: 'RB' },
    { id: 'select', index: 8, label: 'Back' },
    { id: 'start', index: 9, label: 'Start' }
];

const ACTIONS = [
    { value: 'none', label: 'No action' },
    { value: 'zero-x', label: 'Set X zero' },
    { value: 'zero-y', label: 'Set Y zero' },
    { value: 'zero-z', label: 'Set Z zero' },
    { value: 'zero-all', label: 'Set X/Y/Z zero' },
    { value: 'home-all', label: 'Home all axes' },
    { value: 'go-xy-zero', label: 'Go to XY zero' },
    { value: 'go-z-zero', label: 'Go to Z zero' },
    { value: 'go-g28', label: 'Go to G28' },
    { value: 'set-g28', label: 'Set G28' },
    { value: 'go-g30', label: 'Go to G30' },
    { value: 'set-g30', label: 'Set G30' },
    { value: 'cycle-start', label: 'Cycle start / resume' },
    { value: 'feed-hold', label: 'Feed hold' }
];

export class GamepadController {
    constructor(ws, store) {
        this.ws = ws;
        this.store = store;
        this.modal = registerModal('gamepad-settings-overlay', { closeOnBackdrop: true, closeOnEscape: true });
        this.gamepadIndex = null;
        this.initialising = true;
        this.wasJogging = false;
        this.waitingForOk = false;
        this.plannerUntil = 0;
        this.latestJog = null;
        this.previousButtons = [];
        this.incrementIndex = this._currentIncrementIndex();
        this.raf = null;

        this._onConnected = (event) => this._handleConnected(event.gamepad, !this.initialising);
        this._onDisconnected = (event) => this._handleDisconnected(event.gamepad);
        this._onLine = (line) => this._handleLine(line);
        this._onResize = () => this._positionGuideOverlay();

        window.addEventListener('gamepadconnected', this._onConnected);
        window.addEventListener('gamepaddisconnected', this._onDisconnected);
        window.addEventListener('resize', this._onResize);
        window.addEventListener('blur', () => this.stopJog());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.stopJog();
        });
        this.ws?.on('line', this._onLine);
        this.ws?.on('disconnect', () => this.stopJog());

        this._detectInitialGamepad();
        window.setTimeout(() => { this.initialising = false; }, 1500);
        this._loop();
    }

    _detectInitialGamepad() {
        const pad = this._getGamepads()[0];
        if (pad) this._handleConnected(pad, false);
    }

    _getGamepads() {
        if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return [];
        return Array.from(navigator.getGamepads()).filter(Boolean);
    }

    _getActiveGamepad() {
        const pads = this._getGamepads();
        const pad = pads.find((item) => item.index === this.gamepadIndex) || pads[0] || null;
        if (pad && this.gamepadIndex !== pad.index) this._handleConnected(pad, !this.initialising);
        return pad;
    }

    _handleConnected(gamepad, showDialog) {
        if (!gamepad) return;
        const wasConnected = this.gamepadIndex === gamepad.index;
        this.gamepadIndex = gamepad.index;
        // Never treat a button already held while connecting as an intentional action.
        this.previousButtons = gamepad.buttons.map((button) => button.pressed || button.value > 0.5);
        this._renderStatus();
        if (showDialog && !wasConnected) this.showSettings();
    }

    _handleDisconnected(gamepad) {
        if (!gamepad || gamepad.index !== this.gamepadIndex) return;
        this.stopJog();
        this.gamepadIndex = null;
        this.previousButtons = [];
        this._renderStatus();
    }

    _handleLine(line) {
        const value = String(line || '').trim().toLowerCase();
        if (value === 'ok') {
            this.waitingForOk = false;
            this._queueJogIfNeeded(performance.now());
        } else if (value.startsWith('error:')) {
            this.waitingForOk = false;
            this.stopJog();
        }
    }

    _loop() {
        this.raf = window.requestAnimationFrame(() => this._loop());
        const gamepad = this._getActiveGamepad();
        if (!gamepad) return;

        this._handleButtonActions(gamepad);
        this._handleDpad(gamepad);
        this._handleAnalogJog(gamepad);
    }

    _axis(value) {
        const raw = Number(value) || 0;
        const abs = Math.abs(raw);
        if (abs <= DEAD_ZONE) return 0;
        const scaled = (abs - DEAD_ZONE) / (1 - DEAD_ZONE);
        return Math.sign(raw) * scaled * scaled;
    }

    _handleAnalogJog(gamepad) {
        if (!this.ws?.isConnected) {
            this.stopJog();
            return;
        }

        const x = this._axis(gamepad.axes[0]);
        const y = -this._axis(gamepad.axes[1]);
        const aVisible = this._hasAxis('A');
        const a = aVisible ? this._axis(gamepad.axes[2]) : 0;
        const z = -this._axis(gamepad.axes[3]);
        const vector = { X: x, Y: y, Z: z, A: a };
        const activeAxes = Object.entries(vector).filter(([, value]) => Math.abs(value) > 0);

        if (!activeAxes.length) {
            this.latestJog = null;
            this.stopJog();
            return;
        }

        const magnitude = Math.min(1, Math.hypot(...activeAxes.map(([, value]) => value)));
        const normalised = Object.fromEntries(activeAxes.map(([axis, value]) => [axis, value / magnitude]));
        this.latestJog = { normalised, magnitude };
        this._queueJogIfNeeded(performance.now());
    }

    _queueJogIfNeeded(now) {
        if (!this.ws?.isConnected || !this.latestJog || this.waitingForOk) return;

        const queuedMs = Math.max(0, this.plannerUntil - now);
        if (queuedMs >= PLANNER_TARGET_MS) return;

        const { normalised, magnitude } = this.latestJog;

        // The trigger-selected increment also acts as a precision scale for sticks:
        // 10 mm = full speed, 1 mm = 10%, 5 mm = 50%, and 0.1 mm = 1%.
        const precisionScale = INCREMENTS_MM[this.incrementIndex] / 10;
        const feed = Math.max(10, this._maxFeed(Object.keys(normalised)) * magnitude * precisionScale);
        const seconds = SEGMENT_MS / 1000;
        const distance = (feed / 60) * seconds;
        const words = Object.entries(normalised)
            .map(([axis, value]) => `${axis}${(value * distance).toFixed(4)}`)
            .join(' ');

        this.waitingForOk = true;
        this.plannerUntil = Math.max(this.plannerUntil, now) + SEGMENT_MS;
        this.wasJogging = true;
        this.ws.sendCommand(`$J=G91 G21 ${words} F${feed.toFixed(0)}`).catch(() => {
            this.waitingForOk = false;
        });
    }

    stopJog() {
        if (!this.wasJogging) return;
        this.wasJogging = false;
        this.waitingForOk = false;
        this.plannerUntil = 0;
        this.latestJog = null;
        if (this.ws?.isConnected) this.ws.sendRealtime('\x85');
    }

    _maxFeed(axes) {
        const axisSettings = { X: '110', Y: '111', Z: '112', A: '113' };
        const rates = axes.map((axis) => Number(window.grblSettings?.settings?.[axisSettings[axis]]?.val))
            .filter((rate) => Number.isFinite(rate) && rate > 0);
        return rates.length ? Math.min(...rates) : 1000;
    }

    _hasAxis(axis) {
        if (axis !== 'A') return true;
        const pad = document.getElementById('jog-a-pad');
        return !!pad && getComputedStyle(pad).display !== 'none';
    }

    _pressed(gamepad, index) {
        return !!gamepad.buttons[index] && (gamepad.buttons[index].pressed || gamepad.buttons[index].value > 0.5);
    }

    _justPressed(gamepad, index) {
        const pressed = this._pressed(gamepad, index);
        const wasPressed = !!this.previousButtons[index];
        this.previousButtons[index] = pressed;
        return pressed && !wasPressed;
    }

    _handleButtonActions(gamepad) {
        BUTTONS.forEach((button) => {
            if (this._justPressed(gamepad, button.index)) this._runAction(this._mapping(button.id));
        });
    }

    _handleDpad(gamepad) {
        const dpad = [
            [12, 'Y+'], [13, 'Y-'], [14, 'X-'], [15, 'X+']
        ];
        dpad.forEach(([index, direction]) => {
            if (this._justPressed(gamepad, index)) this._incrementalJog(direction);
        });

        if (this._justPressed(gamepad, 6)) this._changeIncrement(-1);
        if (this._justPressed(gamepad, 7)) this._changeIncrement(1);
    }

    _incrementalJog(direction) {
        if (!this.ws?.isConnected) return;
        const step = INCREMENTS_MM[this.incrementIndex];
        const feed = this._maxFeed(direction.includes('X') ? ['X'] : ['Y']);
        const axis = direction[0];
        const sign = direction.includes('-') ? '-' : '';
        this.ws.sendCommand(`$J=G91 G21 ${axis}${sign}${step.toFixed(3)} F${feed.toFixed(0)}`);
    }

    _currentIncrementIndex() {
        const current = Number(this.store.get('gamepad.increment')) || Number(this.store.get('jog.step')) || 1;
        return Math.max(0, INCREMENTS_MM.indexOf(current));
    }

    _changeIncrement(delta) {
        this.incrementIndex = Math.max(0, Math.min(INCREMENTS_MM.length - 1, this.incrementIndex + delta));
        const step = INCREMENTS_MM[this.incrementIndex];
        this.store.set('gamepad.increment', step);
        this.store.set('jog.step', step);
        const select = document.getElementById('stepSize');
        if (select) {
            if (![...select.options].some((option) => Number(option.value) === step)) {
                const option = new Option(`${step} mm`, String(step));
                select.add(option);
            }
            select.value = String(step);
        }
        this._showIncrementOverlay(step);
    }

    _showIncrementOverlay(step) {
        const overlay = document.getElementById('gamepad-increment-overlay');
        if (!overlay) return;
        overlay.textContent = `Gamepad increment: ${step} mm`;
        overlay.classList.add('is-visible');
        window.clearTimeout(this.incrementTimeout);
        this.incrementTimeout = window.setTimeout(() => overlay.classList.remove('is-visible'), 1800);
    }

    _mapping(button) {
        return this.store.get(`gamepad.mappings.${button}`) || 'none';
    }

    _runAction(action) {
        if (!action || action === 'none' || !this.ws?.isConnected) return;
        const dro = window.dro;
        switch (action) {
            case 'zero-x': dro?.setZero('X'); break;
            case 'zero-y': dro?.setZero('Y'); break;
            case 'zero-z': dro?.setZero('Z'); break;
            case 'zero-all': dro?.setZero('XYZ'); break;
            case 'home-all': dro?.home(); break;
            case 'go-xy-zero': dro?.goXY0(); break;
            case 'go-z-zero': dro?.goZ0(); break;
            case 'go-g28': dro?.goToPredefined(28); break;
            case 'set-g28': dro?.setPredefined(28); break;
            case 'go-g30': dro?.goToPredefined(30); break;
            case 'set-g30': dro?.setPredefined(30); break;
            case 'cycle-start': this.ws.sendRealtime('~'); break;
            case 'feed-hold': this.ws.sendRealtime('!'); break;
            default: break;
        }
    }

    showSettings() {
        this._renderSettings();
        this.modal?.show();
    }

    _renderSettings() {
        const body = document.getElementById('gamepad-settings-body');
        const footer = document.getElementById('gamepad-settings-footer');
        if (!body || !footer) return;
        const gamepad = this._getActiveGamepad();
        const status = gamepad
            ? `<i data-lucide="circle-check"></i><span>Connected: ${this._escape(gamepad.id)}</span>`
            : '<i data-lucide="gamepad-2"></i><span>No controller detected. Connect one and press any button.</span>';
        const mappingRows = BUTTONS.map((button) => {
            const selected = this._mapping(button.id);
            const options = ACTIONS.map((action) => `<option value="${action.value}" ${action.value === selected ? 'selected' : ''}>${action.label}</option>`).join('');
            const primaryRow = ['x', 'y', 'a', 'b'].indexOf(button.id);
            const column = primaryRow === -1 ? 'secondary' : 'primary';
            const row = primaryRow === -1 ? BUTTONS.slice(4).findIndex((item) => item.id === button.id) : primaryRow;
            return `<label class="gamepad-mapping gamepad-mapping--${column}" style="grid-row: ${row + 1}">
                <span class="gamepad-mapping__button gamepad-mapping__button--${button.id}">${button.label}</span>
                <select aria-label="${button.label} button action" data-gamepad-mapping="${button.id}" class="ooznest-field input-field flex-1">${options}</select>
            </label>`;
        }).join('');

        body.innerHTML = `
            <div class="space-y-3">
                <div class="gamepad-status">${status}</div>
                <div class="gamepad-guide" aria-label="Gamepad control guide">
                    <img class="gamepad-guide__image" src="themes/GAMEPAD.svg" alt="Xbox controller showing gamepad control locations">
                    <svg class="gamepad-guide__leaders" aria-hidden="true"></svg>
                    <div class="gamepad-callout gamepad-callout--compact gamepad-callout--lb">
                        <span class="gamepad-callout__icon"><i data-lucide="chevrons-left"></i></span><span>LB</span>
                    </div>
                    <div class="gamepad-callout gamepad-callout--compact gamepad-callout--rb">
                        <span class="gamepad-callout__icon"><i data-lucide="chevrons-right"></i></span><span>RB</span>
                    </div>
                    <div class="gamepad-callout gamepad-callout--compact gamepad-callout--xyab">
                        <span class="gamepad-callout__icon"><i data-lucide="circle-dot"></i></span><span>A / B / X / Y</span>
                    </div>
                    <div class="gamepad-callout gamepad-callout--compact gamepad-callout--key gamepad-callout--select">
                        <span class="gamepad-callout__icon"><i data-lucide="corner-up-left"></i></span><span>Back</span>
                    </div>
                    <div class="gamepad-callout gamepad-callout--compact gamepad-callout--key gamepad-callout--start">
                        <span class="gamepad-callout__icon"><i data-lucide="play"></i></span><span>Start</span>
                    </div>
                    <div class="gamepad-callout gamepad-callout--lt">
                        <span class="gamepad-callout__icon"><i data-lucide="chevron-down"></i></span>
                        <span class="gamepad-callout__text">Left trigger<small>Lower increment / speed</small></span>
                    </div>
                    <div class="gamepad-callout gamepad-callout--rt">
                        <span class="gamepad-callout__icon"><i data-lucide="chevron-up"></i></span>
                        <span class="gamepad-callout__text">Right trigger<small>Raise increment / speed</small></span>
                    </div>
                    <div class="gamepad-callout gamepad-callout--xy">
                        <span class="gamepad-callout__icon"><i data-lucide="move"></i></span>
                        <span class="gamepad-callout__text">Left stick<small>Continuous X / Y</small></span>
                    </div>
                    <div class="gamepad-callout gamepad-callout--dpad">
                        <span class="gamepad-callout__icon"><i data-lucide="crosshair"></i></span>
                        <span class="gamepad-callout__text">D-pad<small>Incremental X / Y</small></span>
                    </div>
                    <div class="gamepad-callout gamepad-callout--z">
                        <span class="gamepad-callout__icon"><i data-lucide="move-vertical"></i></span>
                        <span class="gamepad-callout__text">Right stick<small>Continuous Z / A</small></span>
                    </div>
                </div>
                <div class="gamepad-customisation">
                    <div class="gamepad-customisation__header">
                        <h4>Button customisation</h4>
                    </div>
                    <div class="gamepad-mappings">${mappingRows}</div>
                </div>
            </div>`;
        footer.innerHTML = '<button type="button" class="btn btn-primary" data-modal-close>Apply</button>';
        footer.classList.remove('hidden');
        body.querySelectorAll('[data-gamepad-mapping]').forEach((select) => {
            select.addEventListener('change', () => this.store.set(`gamepad.mappings.${select.dataset.gamepadMapping}`, select.value));
        });
        if (window.lucide) window.lucide.createIcons();
        window.requestAnimationFrame(() => this._positionGuideOverlay());
    }

    _positionGuideOverlay() {
        const guide = document.querySelector('.gamepad-guide');
        const image = guide?.querySelector('.gamepad-guide__image');
        const leaders = guide?.querySelector('.gamepad-guide__leaders');
        if (!guide || !image || !leaders || !this.modal?.isOpen()) return;

        const guideBox = guide.getBoundingClientRect();
        const imageBox = image.getBoundingClientRect();
        if (!guideBox.width || !imageBox.width) return;

        const svgWidth = 132.29166;
        const svgHeight = 87.841664;
        const sourceAspect = 500 / 332;
        const boxAspect = imageBox.width / imageBox.height;
        const drawnWidth = boxAspect > sourceAspect ? imageBox.height * sourceAspect : imageBox.width;
        const drawnHeight = boxAspect > sourceAspect ? imageBox.height : imageBox.width / sourceAspect;
        const drawnLeft = imageBox.left + (imageBox.width - drawnWidth) / 2;
        const drawnTop = imageBox.top + (imageBox.height - drawnHeight) / 2;
        const point = (x, y) => ({
            x: drawnLeft - guideBox.left + (x / svgWidth) * drawnWidth,
            y: drawnTop - guideBox.top + (y / svgHeight) * drawnHeight
        });

        const targets = {
            lt: point(30.5, 2.6),
            rt: point(101.3, 2.6),
            xy: point(26.5, 30.5),
            dpad: point(43.9, 49.5),
            z: point(82.7, 50.9),
            lb: point(22, 8.7),
            rb: point(112, 8.7),
            select: point(50.6, 30.15),
            start: point(79.8, 30.15),
            xyab: point(100.37, 28.46)
        };
        const side = {
            lt: 'right', rt: 'left', xy: 'right', dpad: 'right', z: 'left',
            lb: 'right', rb: 'left', xyab: 'left',
            select: 'bottom', start: 'bottom'
        };
        leaders.setAttribute('viewBox', `0 0 ${guideBox.width} ${guideBox.height}`);
        leaders.innerHTML = Object.entries(targets).map(([key, target]) => {
            const label = guide.querySelector(`.gamepad-callout--${key}`);
            if (!label) return '';
            const labelBox = label.getBoundingClientRect();
            const direction = side[key];
            const start = direction === 'bottom'
                ? { x: labelBox.left - guideBox.left + labelBox.width / 2, y: labelBox.bottom - guideBox.top }
                : { x: (direction === 'right' ? labelBox.right : labelBox.left) - guideBox.left, y: labelBox.top - guideBox.top + labelBox.height / 2 };
            const elbow = direction === 'bottom'
                ? { x: start.x, y: start.y + (target.y - start.y) * 0.45 }
                : { x: start.x + (target.x - start.x) * 0.48, y: start.y };
            return `<polyline points="${start.x},${start.y} ${elbow.x},${elbow.y} ${target.x},${target.y}"></polyline>`;
        }).join('');
    }

    _renderStatus() {
        const status = document.getElementById('gamepad-settings-status');
        if (status) status.textContent = this.gamepadIndex === null ? 'No gamepad' : 'Gamepad connected';
    }

    _escape(value) {
        return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    }
}
