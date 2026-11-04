export class BowlCutter {
    constructor() {
        this.defaults = {
            width: 100,
            length: 100,
            depth: 20,
            cornerRadius: 5,
            toolDia: 6,
            stepover: 35,
            stepdown: 1,
            safeZ: 5,
            feed: 500,
            plunge: 100,
            rpm: 12000,
            cutoutOffset: 5,
            stockDepth: 25
        };
    }

    get machineLimits() {
        return window.viewer?.machineLimits || { x: 200, y: 200, z: 100 };
    }

    generate() {
        const s = this._getSettings();
        const limits = this.machineLimits;

        const positive = ['width', 'length', 'depth', 'toolDia', 'stepover', 'stepdown', 'safeZ', 'feed', 'plunge'];
        if (positive.some(key => !Number.isFinite(s[key]) || s[key] <= 0) ||
            !Number.isFinite(s.cornerRadius) || s.cornerRadius < 0 ||
            !Number.isFinite(s.rpm) || s.rpm < 0 || s.stepover > 100) {
            window.reporter.showAlert('Invalid Settings', 'Enter positive dimensions, feeds and cutting increments, a stepover up to 100%, and a non-negative radius and RPM.');
            return;
        }
        if (s.cutout && (!Number.isFinite(s.cutoutOffset) || s.cutoutOffset <= 0 ||
            !Number.isFinite(s.stockDepth) || s.stockDepth <= s.depth)) {
            window.reporter.showAlert('Invalid Cutout', 'Cutout offset must be greater than 0 and stock depth must exceed bowl depth.');
            return;
        }
        if (s.cutout && (s.width + 2 * s.cutoutOffset + s.toolDia > limits.x ||
            s.length + 2 * s.cutoutOffset + s.toolDia > limits.y || s.stockDepth > limits.z)) {
            window.reporter.showAlert('Cutout Too Large', 'Cutout toolpath or stock depth exceeds machine travel.');
            return;
        }

        if (s.width > limits.x || s.length > limits.y) {
            window.reporter.showAlert('Too Large',
                `Bowl (${s.width}x${s.length}mm) exceeds machine bed (${limits.x}x${limits.y}mm).`);
            return;
        }
        if (s.depth > limits.z) {
            window.reporter.showAlert('Too Deep',
                `Bowl depth (${s.depth}mm) exceeds machine Z travel (${limits.z}mm).`);
            return;
        }
        if (s.safeZ <= 0) {
            window.reporter.showAlert('Invalid Safe Z', 'Safe Z must be greater than 0.');
            return;
        }

        const toolR = s.toolDia / 2;
        const stepover = s.toolDia * (s.stepover / 100);
        const stepdown = s.stepdown;
        const maxDepth = s.depth;
        const numZPasses = Math.ceil(maxDepth / stepdown);
        const CR = s.cornerRadius;

        let gcode = this._header(s);
        gcode += `G0 Z${s.safeZ.toFixed(3)}\nG0 X0 Y0\n`;

        for (let zPass = 1; zPass <= numZPasses; zPass++) {
            const zDepth = Math.min(zPass * stepdown, maxDepth);
            const reduc = this._filletReduction(zDepth, CR, maxDepth);
            const shapeW = s.width - 2 * reduc;
            const shapeL = s.length - 2 * reduc;

            // Tool-center path dimensions (offset inward by tool radius)
            let pw = shapeW - 2 * toolR;
            let pl = shapeL - 2 * toolR;
            let pcr = Math.max(0, CR - toolR);

            if (pw <= 0 || pl <= 0) {
                gcode += `G0 Z${s.safeZ.toFixed(3)}\n`;
                continue;
            }
            // Clamp corner radius so it doesn't exceed half the smaller side
            const halfMin = Math.min(pw, pl) / 2;
            if (pcr > halfMin) pcr = Math.max(0, halfMin);

            // Plunge at the starting corner
            const sx = pw / 2 - pcr;
            const sy = pl / 2;
            gcode += `G0 X${sx.toFixed(3)} Y${sy.toFixed(3)}\n`;
            gcode += `G1 Z${(-zDepth).toFixed(3)} F${s.plunge}\n`;

            // Concentric passes inward at this depth
            let cw = pw, cl = pl, ccr = pcr;
            while (cw > stepover && cl > stepover) {
                gcode += this._roundedRect(cw, cl, ccr, s.feed);
                cw -= 2 * stepover;
                cl -= 2 * stepover;
                ccr = Math.max(0, ccr - stepover);
                const hmin = Math.min(cw, cl) / 2;
                if (ccr > hmin) ccr = Math.max(0, hmin);
            }

            // Final cleanup: smallest rounded rect or center cleanout
            if (cw > 0.5 && cl > 0.5) {
                gcode += this._roundedRect(cw, cl, ccr, s.feed);
            }

            gcode += `G0 Z${s.safeZ.toFixed(3)}\n`;
        }

        if (s.cutout) {
            const offset = s.cutoutOffset + toolR;
            const w = s.width + 2 * offset;
            const l = s.length + 2 * offset;
            const cr = Math.min(CR, s.width / 2, s.length / 2) + offset;
            gcode += '; Cutout\n';
            gcode += `G0 Z${s.safeZ.toFixed(3)}\nG0 X${(-w / 2 + cr).toFixed(3)} Y${(l / 2).toFixed(3)}\n`;
            for (let pass = 1; pass <= Math.ceil(s.stockDepth / stepdown); pass++) {
                const depth = Math.min(pass * stepdown, s.stockDepth);
                gcode += `G1 Z${(-depth).toFixed(3)} F${s.plunge}\n`;
                gcode += this._roundedRect(w, l, cr, s.feed);
            }
        }

        gcode += this._footer(s);
        this._loadToViewer(gcode);
    }

    _roundedRect(w, l, cr, feed) {
        const hw = w / 2, hl = l / 2;
        const trCx = hw - cr, trCy = hl - cr;
        const brCx = hw - cr, brCy = -hl + cr;
        const blCx = -hw + cr, blCy = -hl + cr;
        const tlCx = -hw + cr, tlCy = hl - cr;
        let gc = '';
        gc += `G1 X${(-hw + cr).toFixed(3)} Y${hl.toFixed(3)} F${feed}\n`;
        gc += `G1 X${(hw - cr).toFixed(3)} Y${hl.toFixed(3)} F${feed}\n`;
        if (cr > 0.01) {
            gc += `G2 X${hw.toFixed(3)} Y${(hl - cr).toFixed(3)} I${(trCx - (hw - cr)).toFixed(3)} J${(trCy - hl).toFixed(3)} F${feed}\n`;
        }
        gc += `G1 X${hw.toFixed(3)} Y${(-hl + cr).toFixed(3)} F${feed}\n`;
        if (cr > 0.01) {
            gc += `G2 X${(hw - cr).toFixed(3)} Y${(-hl).toFixed(3)} I${(brCx - hw).toFixed(3)} J${(brCy - (-hl + cr)).toFixed(3)} F${feed}\n`;
        }
        gc += `G1 X${(-hw + cr).toFixed(3)} Y${(-hl).toFixed(3)} F${feed}\n`;
        if (cr > 0.01) {
            gc += `G2 X${(-hw).toFixed(3)} Y${(-hl + cr).toFixed(3)} I${(blCx - (-hw + cr)).toFixed(3)} J${(blCy - (-hl)).toFixed(3)} F${feed}\n`;
        }
        gc += `G1 X${(-hw).toFixed(3)} Y${(hl - cr).toFixed(3)} F${feed}\n`;
        if (cr > 0.01) {
            gc += `G2 X${(-hw + cr).toFixed(3)} Y${hl.toFixed(3)} I${(tlCx - (-hw)).toFixed(3)} J${(tlCy - (hl - cr)).toFixed(3)} F${feed}\n`;
        }
        return gc;
    }

    _filletReduction(depth, CR, totalDepth) {
        if (CR <= 0 || depth <= totalDepth - CR) return 0;
        const dz = depth - (totalDepth - CR);
        return CR - Math.sqrt(Math.max(0, CR * CR - dz * dz));
    }

    _getSettings() {
        const g = (id, fallback) => {
            const el = document.getElementById(id);
            return el ? parseFloat(el.value) : fallback;
        };
        return {
            width: g('bc-width', this.defaults.width),
            length: g('bc-length', this.defaults.length),
            depth: g('bc-depth', this.defaults.depth),
            cornerRadius: g('bc-corner-radius', this.defaults.cornerRadius),
            toolDia: g('bc-tool-dia', this.defaults.toolDia),
            stepover: g('bc-stepover', this.defaults.stepover),
            stepdown: g('bc-stepdown', this.defaults.stepdown),
            safeZ: g('bc-safe-z', this.defaults.safeZ),
            feed: g('bc-feed', this.defaults.feed),
            plunge: g('bc-plunge', this.defaults.plunge),
            rpm: g('bc-rpm', this.defaults.rpm),
            cutout: document.getElementById('bc-cutout')?.checked || false,
            cutoutOffset: g('bc-cutout-offset', this.defaults.cutoutOffset),
            stockDepth: g('bc-stock-depth', this.defaults.stockDepth)
        };
    }

    _header(s) {
        return `; Bowl Cut - Generated by Ooznest Control\nG17 G21 G90\n${s.rpm > 0 ? `M3 S${s.rpm}\n` : ''}`;
    }

    _footer(s) {
        return `G0 Z${s.safeZ.toFixed(3)}\nG90\nM5\n`;
    }

    _loadToViewer(gcode) {
        if (window.viewer) {
            window.viewer.processGCodeString(gcode, 'Bowl cutter job parsed');
        }
        window.currentGCodeContent = gcode;
        window.currentSDFile = null;
        window.uiManager.updateRunButtonsState();
        window.switchTab('viewer-view');
    }
}
