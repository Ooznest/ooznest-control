import { registerModal } from './modal.js';

export class MacroHandler {
    constructor(ws, term) {
        this.ws = ws;
        this.term = term;
        this.macros = [];
        this.editingId = null; // null = new, number = editing index

        // Predefined list of useful Lucide icons for CNC
        this.icons = [
            'play', 'square', 'pause', 'house',
            'fan', 'droplets', 'zap', 'wrench',
            'crosshair', 'move', 'rotate-cw', 'rotate-ccw',
            'lightbulb', 'package', 'ruler', 'settings',
            'wind', 'thermometer', 'gauge', 'trash-2'
        ];

        // Color options (Tailwind classes)
        this.colors = [
            { name: 'Yellow', bg: 'bg-primary', text: 'text-black', border: 'border-primary-dark' },
            { name: 'Green', bg: 'bg-green-500', text: 'text-white', border: 'border-green-600' },
            { name: 'Red', bg: 'bg-red-500', text: 'text-white', border: 'border-red-600' },
            { name: 'Blue', bg: 'bg-blue-500', text: 'text-white', border: 'border-blue-600' },
            { name: 'Grey', bg: 'bg-secondary', text: 'text-white', border: 'border-secondary-dark' },
            { name: 'White', bg: 'bg-white', text: 'text-grey-dark', border: 'border-grey-light' }
        ];

        this.load();
        this.initModal();
    }

    load() {
        const stored = localStorage.getItem('cnc_macros');
        if (stored) {
            try {
                this.macros = JSON.parse(stored);
            } catch (e) {
                console.error("Failed to load macros", e);
                this.macros = [];
            }
        }
    }

    save() {
        localStorage.setItem('cnc_macros', JSON.stringify(this.macros));
        this.render();
    }

    run(index) {
        const macro = this.macros[index];
        if (!macro || !macro.gcode) return;

        this.term.writeln(`\x1b[33m[Macro] Running: ${macro.name}\x1b[0m`);

        // Split by new line and send
        const lines = macro.gcode.split('\n');
        lines.forEach(line => {
            const cmd = line.trim();
            if (cmd && !cmd.startsWith(';')) { // Skip comments and empty lines
                this.ws.sendCommand(cmd);
            }
        });
    }

    delete(index) {
        const reporter = window.reporter || (window.AlarmsAndErrors ? new window.AlarmsAndErrors(this.ws) : null);
        if (!reporter) {
            console.error('Reporter not available for modal');
            return;
        }
        reporter.showConfirm('Delete Macro', 'Are you sure you want to delete this macro?', () => {
            this.macros.splice(index, 1);
            this.save();
        });
    }

    // --- UI Rendering ---

    render() {
        const container = document.getElementById('macro-grid');
        if (!container) return;

        container.innerHTML = '';

        this.macros.forEach((macro, index) => {
            const btn = document.createElement('div');
            // Find color definition
            const colorDef = this.colors.find(c => c.name === macro.color) || this.colors[0];

            btn.className = `relative group cursor-pointer rounded-xl shadow-sm border-b-4 active:border-b-0 active:translate-y-1 transition-all flex flex-col items-center justify-center p-4 h-32 ${colorDef.bg} ${colorDef.text} ${colorDef.border}`;

            // MODIFIED: Changed opacity classes to be visible by default (mobile), hidden on md+ unless hovered
            btn.innerHTML = `
                <i data-lucide="${this.normalizeIcon(macro.icon)}" class="text-3xl mb-2"></i>
                <span class="font-bold text-sm text-center leading-tight select-none">${macro.name}</span>

                <!-- Edit Controls (Always visible on mobile, Hover only on Desktop) -->
                <div class="absolute top-1 right-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex gap-1">
                    <button class="edit-btn p-1 bg-black/20 hover:bg-black/40 rounded text-white text-xs" title="Edit">
                        <i data-lucide="pencil" style="width:14px;height:14px"></i>
                    </button>
                    <button class="del-btn p-1 bg-black/20 hover:bg-red-600 rounded text-white text-xs" title="Delete">
                        <i data-lucide="trash-2" style="width:14px;height:14px"></i>
                    </button>
                </div>
            `;

            // Click to run
            btn.addEventListener('click', (e) => {
                // Prevent running if clicking edit/delete buttons
                if (e.target.closest('.edit-btn') || e.target.closest('.del-btn')) return;
                this.run(index);
            });

            // Edit Action
            btn.querySelector('.edit-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.openModal(index);
            });

            // Delete Action
            btn.querySelector('.del-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.delete(index);
            });

            container.appendChild(btn);
        });

        // Add "New Macro" Button
        const addBtn = document.createElement('div');
        addBtn.className = "cursor-pointer rounded-xl border-2 border-dashed border-grey-light hover:border-primary hover:bg-white transition-colors flex flex-col items-center justify-center p-4 h-32 text-grey hover:text-primary";
        addBtn.innerHTML = `
            <i data-lucide="plus" style="width:14px;height:14px"></i>
            <span class="font-bold text-xs uppercase tracking-wider">Add Macro</span>
        `;
        addBtn.addEventListener('click', () => this.openModal(null));
        container.appendChild(addBtn);
        if (window.lucide) window.lucide.createIcons();
    }

    // --- Modal Logic ---

    initModal() {
        // Find modal elements
        this.modal = document.getElementById('macro-modal');
        this.modalController = registerModal(this.modal, { closeOnBackdrop: true, closeOnEscape: true });
        this.iconGrid = document.getElementById('macro-icon-grid');
        this.colorSelect = document.getElementById('macro-color-select');

        // Populate Icon Grid
        this.icons.forEach(iconClass => {
            const iBtn = document.createElement('button');
            iBtn.className = "w-10 h-10 flex items-center justify-center rounded border border-grey-light hover:bg-primary hover:text-black hover:border-primary transition-colors text-xl text-grey-dark icon-option";
            iBtn.innerHTML = `<i data-lucide="${iconClass}" class="w-5 h-5"></i>`;
            iBtn.dataset.icon = iconClass;
            iBtn.type = "button"; // Prevent form submit
            iBtn.addEventListener('click', () => {
                // Highlight selected
                document.querySelectorAll('.icon-option').forEach(el => el.classList.remove('bg-primary', 'text-black', 'border-primary'));
                iBtn.classList.add('bg-primary', 'text-black', 'border-primary');
                document.getElementById('macro-icon-input').value = iconClass;
                if (window.lucide) window.lucide.createIcons();
            });
            this.iconGrid.appendChild(iBtn);
        });
        if (window.lucide) window.lucide.createIcons();

        // Populate Color Select
        this.colors.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.name;
            opt.textContent = c.name;
            this.colorSelect.appendChild(opt);
        });

        // Save Button
        document.getElementById('btn-save-macro').addEventListener('click', () => this.saveFromModal());

        // Close Button
        document.getElementById('btn-close-macro').addEventListener('click', () => {
            this.modalController?.hide();
        });
    }

    openModal(index) {
        this.editingId = index;
        const nameInput = document.getElementById('macro-name-input');
        const gcodeInput = document.getElementById('macro-gcode-input');
        const iconInput = document.getElementById('macro-icon-input');
        const modalTitle = document.getElementById('macro-modal-title');

        // Reset UI classes
        document.querySelectorAll('.icon-option').forEach(el => el.classList.remove('bg-primary', 'text-black', 'border-primary'));

        if (index === null) {
            // New
            modalTitle.textContent = "Create New Macro";
            nameInput.value = "";
            gcodeInput.value = "";
            iconInput.value = this.icons[0];
            this.colorSelect.value = "Yellow";
            // Select first icon visually
            this.iconGrid.firstElementChild.classList.add('bg-primary', 'text-black', 'border-primary');
        } else {
            // Edit
            const m = this.macros[index];
            const normalizedIcon = this.normalizeIcon(m.icon);
            modalTitle.textContent = "Edit Macro";
            nameInput.value = m.name;
            gcodeInput.value = m.gcode;
            iconInput.value = normalizedIcon;
            this.colorSelect.value = m.color;

            // Highlight Icon
            const iconBtn = this.iconGrid.querySelector(`[data-icon="${normalizedIcon}"]`);
            if (iconBtn) iconBtn.classList.add('bg-primary', 'text-black', 'border-primary');
        }

        this.modalController?.show();
        if (window.lucide) window.lucide.createIcons();
    }

    normalizeIcon(icon) {
        const map = {
            'bi-play-fill': 'play',
            'bi-stop-fill': 'square',
            'bi-pause-fill': 'pause',
            'bi-house-door-fill': 'house',
            'bi-fan': 'fan',
            'bi-droplet-fill': 'droplets',
            'bi-lightning-fill': 'zap',
            'bi-tools': 'wrench',
            'bi-bullseye': 'crosshair',
            'bi-arrows-move': 'move',
            'bi-arrow-clockwise': 'rotate-cw',
            'bi-arrow-counterclockwise': 'rotate-ccw',
            'bi-lightbulb-fill': 'lightbulb',
            'bi-box-seam': 'package',
            'bi-rulers': 'ruler',
            'bi-gear-fill': 'settings',
            'bi-wind': 'wind',
            'bi-thermometer-half': 'thermometer',
            'bi-speedometer2': 'gauge',
            'bi-trash': 'trash-2'
        };
        return map[icon] || icon || 'play';
    }

    saveFromModal() {
        const name = document.getElementById('macro-name-input').value.trim();
        const gcode = document.getElementById('macro-gcode-input').value;
        const icon = document.getElementById('macro-icon-input').value;
        const color = this.colorSelect.value;

        if (!name) {
            const reporter = window.reporter || (window.AlarmsAndErrors ? new window.AlarmsAndErrors(this.ws) : null);
            if (reporter) {
                reporter.showAlert('Name Required', 'Macro name is required');
            }
            return;
        }

        const macroObj = { name, gcode, icon, color };

        if (this.editingId === null) {
            this.macros.push(macroObj);
        } else {
            this.macros[this.editingId] = macroObj;
        }

        this.save(); // Saves to localstorage and re-renders
        this.modalController?.hide();
    }
}
