import { makeLine, getTextWidth, drawTextString } from './gcode-draw.js';

export class SpoilboardGridHandler {
    constructor(ws, term, store) {
        this.ws = ws;
        this.term = term;
        this.store = store;
    }

    autoSpoilboard() {
        if (!window.viewer || !window.viewer.machineLimits) {
            if (this.term) this.term.writeln('\x1b[33m[Spoilboard Grid] Machine limits not available.\x1b[0m');
            return;
        }

        const limits = window.viewer.machineLimits;
        const isPositiveSpace = window.viewer.isPositiveSpace || false;
        const homingDirMask = window.viewer.homingDirMask || 0;

        let xMin, xMax, yMin, yMax;

        if (isPositiveSpace) {
            if (homingDirMask & 1) { xMin = 0; xMax = limits.x; }
            else { xMin = -limits.x; xMax = 0; }
            if (homingDirMask & 2) { yMin = 0; yMax = limits.y; }
            else { yMin = -limits.y; yMax = 0; }
        } else {
            xMin = -limits.x; xMax = 0;
            yMin = -limits.y; yMax = 0;
        }

        const width = Math.round(xMax - xMin);
        const height = Math.round(yMax - yMin);

        if (width <= 0 || height <= 0) {
            if (this.term) this.term.writeln('\x1b[33m[Spoilboard Grid] Invalid machine dimensions.\x1b[0m');
            return;
        }

        document.getElementById('sg-width').value = width;
        document.getElementById('sg-height').value = height;

        if (this.term) this.term.writeln(`\x1b[32m[Spoilboard Grid] Auto-detected machine size: ${width}x${height}mm\x1b[0m`);
    }

    generateGrid() {
        const widthX = parseFloat(document.getElementById('sg-width').value) || 300;
        const heightY = parseFloat(document.getElementById('sg-height').value) || 300;
        const gridSpacing = parseFloat(document.getElementById('sg-spacing').value) || 50;
        const coordSystem = document.getElementById('sg-coords').value;
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

        const worstCaseLabelLeft = (coordSystem === 'Work') ? Math.round(heightY).toString() : Math.round(-heightY).toString();
        const maxLabelWidthLeft = getTextWidth(worstCaseLabelLeft, gridLengthLet, gridSpace);

        const X_offset = gridHightLet + maxLabelWidthLeft + 2.0;
        const Y_offset = gridHightLet + gridHightLet + 2.0;

        let X_grid_min, X_grid_max, Y_grid_min, Y_grid_max;
        if (coordSystem === 'Work') {
            X_grid_min = X_offset;
            X_grid_max = widthX;
            Y_grid_min = Y_offset;
            Y_grid_max = heightY;
        } else {
            X_grid_min = -widthX + X_offset;
            X_grid_max = 0;
            Y_grid_min = -heightY + Y_offset;
            Y_grid_max = 0;
        }

        let gcode = '';
        gcode += `G21 G90 G17 F${feedrate}\n`;
        gcode += `G0 X0 Y0 Z${up}\n`;

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
                    const labelVal = (coordSystem === 'Work') ? i : Math.round(Y);
                    const labelText = labelVal.toString();
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
                    const labelVal = (coordSystem === 'Work') ? i : Math.round(X);
                    const labelText = labelVal.toString();
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
        window.viewer.processGCodeString(gcode);

        // Switch to 3D view tab
        const viewerTab = document.querySelector("button[onclick*='viewer-view']");
        if (viewerTab) viewerTab.click();

        this.term.writeln(`\x1b[34m[Spoilboard Grid] Generated ${widthX}x${heightY}mm grid at ${gridSpacing}mm spacing.\x1b[0m`);
        this.term.writeln(`\x1b[32m[Spoilboard Grid] ${includeRuler ? 'With' : 'Without'} outward-facing rulers.\x1b[0m`);
        this.term.writeln('\x1b[32m[Spoilboard Grid] G-code loaded into viewer.\x1b[0m');
    }
}
