import { makeLine, getTextWidth, drawTextString } from './gcode-draw.js';

export class SpoilboardGridHandler {
    constructor(ws, term, store) {
        this.ws = ws;
        this.term = term;
        this.store = store;

        setTimeout(() => {
            this.syncAutoDimensions({ silent: true });
        }, 0);
    }

    getMaxTravelDimensions() {
        const settings = window.grblSettings?.settings || {};
        const xTravel = parseFloat(settings['130']?.val);
        const yTravel = parseFloat(settings['131']?.val);

        if (!Number.isFinite(xTravel) || !Number.isFinite(yTravel) || xTravel <= 0 || yTravel <= 0) {
            return null;
        }

        return {
            width: Math.round(xTravel),
            height: Math.round(yTravel)
        };
    }

    syncAutoDimensions({ silent = false } = {}) {
        const dims = this.getMaxTravelDimensions();
        if (!dims) {
            if (!silent && this.term) this.term.writeln('\x1b[33m[Spoilboard Grid] Machine max travel settings are not available.\x1b[0m');
            return false;
        }

        const widthInput = document.getElementById('sg-width');
        const heightInput = document.getElementById('sg-height');
        if (!widthInput || !heightInput) return false;

        widthInput.value = dims.width;
        heightInput.value = dims.height;

        if (!silent && this.term) {
            this.term.writeln(`\x1b[32m[Spoilboard Grid] Using machine max travel: ${dims.width}x${dims.height}mm\x1b[0m`);
        }
        return true;
    }

    autoSpoilboard() {
        return this.syncAutoDimensions();
    }

    updateCoordinateInfo() {
        // Kept for older inline handlers; Spoilboard Grid now uses one automatic XY setup mode.
    }

    generateGrid() {
        this.syncAutoDimensions({ silent: true });
        this.updateCoordinateInfo();

        const widthX = parseFloat(document.getElementById('sg-width').value) || 300;
        const heightY = parseFloat(document.getElementById('sg-height').value) || 300;
        const gridSpacing = parseFloat(document.getElementById('sg-spacing').value) || 50;
        const includeRuler = document.getElementById('sg-ruler').checked;

        const depth = parseFloat(document.getElementById('sg-depth').value) || -0.3;
        const up = parseFloat(document.getElementById('sg-up').value) || 1;
        const feedrate = parseFloat(document.getElementById('sg-feed').value) || 500;
        const plungeRate = parseFloat(document.getElementById('sg-plunge').value) || 100;

        const down = depth;
        const rapide = 'G0';
        const lent = 'G01';

        // Font sizing (hardcoded defaults — good for spoilboard engraving)
        const lengthLet = 3;
        const hightLet = 4;
        const space = 1.5;
        const gridScaleFactor = 0.7;
        const gridLengthLet = lengthLet * gridScaleFactor;
        const gridHightLet = hightLet * gridScaleFactor;
        const gridSpace = space * gridScaleFactor;

        const worstCaseLabelLeft = Math.round(heightY).toString();
        const maxLabelWidthLeft = getTextWidth(worstCaseLabelLeft, gridLengthLet, gridSpace);

        const X_offset = gridHightLet + maxLabelWidthLeft + 2.0;
        const Y_offset = gridHightLet + gridHightLet + 2.0;

        const X_grid_min = X_offset;
        const X_grid_max = widthX;
        const Y_grid_min = Y_offset;
        const Y_grid_max = heightY;

        let gcode = '';
        gcode += `; Spoilboard Grid\n`;
        gcode += `; Home the machine before running. X/Y zero should be set to machine front-left. Z zero must be set by the user.\n`;
        gcode += `G21 G90 G17 F${feedrate}\n`;
        gcode += `G0 Z${up.toFixed(3)}\n`;

        // 1. Outer boundary frame
        gcode += makeLine(rapide, 'X', X_grid_min, Y_grid_min, { z: up });
        gcode += makeLine(lent, 'X', X_grid_min, Y_grid_min, { z: down, f: plungeRate });
        gcode += makeLine(lent, 'X', X_grid_max, Y_grid_min, { z: down, f: plungeRate });
        gcode += makeLine(lent, 'X', X_grid_max, Y_grid_max, { z: down, f: plungeRate });
        gcode += makeLine(lent, 'X', X_grid_min, Y_grid_max, { z: down, f: plungeRate });
        gcode += makeLine(lent, 'X', X_grid_min, Y_grid_min, { z: down, f: plungeRate });
        gcode += makeLine(rapide, 'X', X_grid_min, Y_grid_min, { z: up });

        // 2. Internal vertical grid lines
        for (let X = X_grid_min + gridSpacing; X <= X_grid_max - 1.0; X += gridSpacing) {
            gcode += makeLine(rapide, 'X', X, Y_grid_min, { z: up });
            gcode += makeLine(lent, 'X', X, Y_grid_min, { z: down, f: plungeRate });
            gcode += makeLine(lent, 'X', X, Y_grid_max, { z: down, f: plungeRate });
            gcode += makeLine(rapide, 'X', X, Y_grid_max, { z: up });
        }

        // 3. Internal horizontal grid lines
        for (let Y = Y_grid_min + gridSpacing; Y <= Y_grid_max - 1.0; Y += gridSpacing) {
            gcode += makeLine(rapide, 'X', X_grid_min, Y, { z: up });
            gcode += makeLine(lent, 'X', X_grid_min, Y, { z: down, f: plungeRate });
            gcode += makeLine(lent, 'X', X_grid_max, Y, { z: down, f: plungeRate });
            gcode += makeLine(rapide, 'X', X_grid_max, Y, { z: up });
        }

        // 4. Outward-facing rulers
        if (includeRuler) {
            // Left edge ruler (along Y axis, ticks point left)
            const totalTicksY = Math.round(Y_grid_max - Y_grid_min);
            for (let i = 0; i <= totalTicksY; i++) {
                const Y = Y_grid_min + i;
                let tickHeight = gridHightLet * 0.4;
                let isMajor = false;
                if (i % 10 === 0) {
                    tickHeight = gridHightLet;
                    isMajor = true;
                } else if (i % 5 === 0) {
                    tickHeight = gridHightLet * 0.65;
                }

                gcode += makeLine(rapide, 'X', X_grid_min, Y, { z: up });
                gcode += makeLine(lent, 'X', X_grid_min, Y, { z: down, f: plungeRate });
                gcode += makeLine(lent, 'X', X_grid_min - tickHeight, Y, { z: down, f: plungeRate });
                gcode += makeLine(rapide, 'X', X_grid_min - tickHeight, Y, { z: up });

                if (isMajor) {
                    const labelText = i.toString();
                    const labelWidth = getTextWidth(labelText, gridLengthLet, gridSpace);
                    const yBaseline = Y - (gridHightLet / 2);
                    const xBaseline = X_grid_min - tickHeight - labelWidth - 1.5;
                    gcode += drawTextString(labelText, xBaseline, yBaseline, gridLengthLet, gridHightLet, gridSpace, depth, up, 'X', false);
                }
            }

            // Front edge ruler (along X axis, ticks point down)
            const totalTicksX = Math.round(X_grid_max - X_grid_min);
            for (let i = 0; i <= totalTicksX; i++) {
                const X = X_grid_min + i;
                let tickHeight = gridHightLet * 0.4;
                let isMajor = false;
                if (i % 10 === 0) {
                    tickHeight = gridHightLet;
                    isMajor = true;
                } else if (i % 5 === 0) {
                    tickHeight = gridHightLet * 0.65;
                }

                gcode += makeLine(rapide, 'X', X, Y_grid_min, { z: up });
                gcode += makeLine(lent, 'X', X, Y_grid_min, { z: down, f: plungeRate });
                gcode += makeLine(lent, 'X', X, Y_grid_min - tickHeight, { z: down, f: plungeRate });
                gcode += makeLine(rapide, 'X', X, Y_grid_min - tickHeight, { z: up });

                if (isMajor) {
                    const labelText = i.toString();
                    const labelWidth = getTextWidth(labelText, gridLengthLet, gridSpace);
                    const xStart = X - (labelWidth / 2);
                    const yBaseline = Y_grid_min - tickHeight - gridHightLet - 1.5;
                    gcode += drawTextString(labelText, xStart, yBaseline, gridLengthLet, gridHightLet, gridSpace, depth, up, 'X', false);
                }
            }
        }

        // Return safe home
        gcode += makeLine(rapide, 'X', 0, 0, { z: up });

        // Load into editor (via event)
        const event = new CustomEvent('gcode-loaded', { detail: { content: gcode, filename: 'Spoilboard_Grid.gcode' } });
        window.dispatchEvent(event);

        // Load into 3D viewer
        window.viewer.processGCodeString(gcode, 'Spoilboard_Grid.gcode parsed');

        // Switch to 3D view tab
        const viewerTab = document.querySelector("button[onclick*='viewer-view']");
        if (viewerTab) viewerTab.click();

        this.term.writeln(`\x1b[34m[Spoilboard Grid] Generated ${widthX}x${heightY}mm grid at ${gridSpacing}mm spacing.\x1b[0m`);
        this.term.writeln(`\x1b[32m[Spoilboard Grid] ${includeRuler ? 'With' : 'Without'} outward-facing rulers.\x1b[0m`);
        this.term.writeln('\x1b[32m[Spoilboard Grid] G-code loaded into viewer.\x1b[0m');
        this.promptAutoZeroXY(widthX, heightY);
    }

    promptAutoZeroXY(width, height) {
        if (!window.ws || !window.ws.isConnected) return;

        const x = -Math.abs(Number(width) || 0);
        const y = -Math.abs(Number(height) || 0);
        if (!x || !y) return;

        const activeP = this.getActiveWcsP();
        const command = `G21 G10 L2 P${activeP} X${x.toFixed(3)} Y${y.toFixed(3)}`;
        const title = 'Set Spoilboard X/Y Zero?';
        const message = 'We can automatically set X/Y zero for this spoilboard job now. This does not move the machine. Make sure the machine has been homed, then set Z zero before running the job.';

        const run = () => {
            window.sendCmd(command);
            if (window.showToast) window.showToast('X/Y zero set. Set Z zero before running.', 'crosshair', 'success');
            if (this.term) this.term.writeln(`\x1b[32m[Spoilboard Grid] Sent ${command}. Set Z zero before running.\x1b[0m`);
        };

        if (window.reporter?.showConfirm) {
            window.reporter.showConfirm(title, message, run, null, 'Set X/Y Zero', 'Later');
        } else if (confirm(message)) {
            run();
        }
    }

    getActiveWcsP() {
        if (window.lastStatus) {
            const match = window.lastStatus.match(/WCS:G(\d+)/);
            if (match) {
                const val = parseInt(match[1], 10);
                if (val >= 54 && val <= 59) return val - 53;
            }
        }
        return 1;
    }
}
