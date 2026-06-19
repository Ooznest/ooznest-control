export class FingerJointBox {
    constructor() {
        this.defaults = {
            boxW: 150, boxD: 150, boxH: 100,
            stockThick: 12, toolDia: 6, fingerWidth: 15,
            feed: 500, plunge: 100
        };
    }

    get machineLimits() {
        return window.viewer?.machineLimits || { x: 200, y: 200, z: 100 };
    }

    generate() {
        const s = this._getSettings();
        const limits = this.machineLimits;

        const panels = [
            { name: 'Bottom', w: s.boxW, h: s.boxD, type: 'outer', topSolid: false },
            { name: 'Front',  w: s.boxW, h: s.boxH, type: 'inner', topSolid: true, edgeGap: { left: true, right: true } },
            { name: 'Back',   w: s.boxW, h: s.boxH, type: 'inner', topSolid: true, edgeGap: { left: false, right: false } },
            { name: 'Left',   w: s.boxD, h: s.boxH, type: 'inner', topSolid: true, edgeGap: { left: true, right: false } },
            { name: 'Right',  w: s.boxD, h: s.boxH, type: 'inner', topSolid: true, edgeGap: { left: false, right: true } }
        ];

        this._sheets = this._splitSheets(panels, s, limits);
        this._renderSheets();
    }

    _splitSheets(panels, s, limits) {
        const t = s.stockThick;
        const gap = 10;
        let sheets = [];
        let i = 0;

        while (i < panels.length) {
            let sheetPanels = [];
            let cx = gap;
            let maxH = 0;
            while (i < panels.length) {
                const pw = panels[i].w + t * 2;
                if (cx + pw <= limits.x + gap) {
                    sheetPanels.push(panels[i]);
                    cx += pw + gap;
                    maxH = Math.max(maxH, panels[i].h + t * 2);
                    i++;
                } else {
                    break;
                }
            }
            if (sheetPanels.length === 0) {
                window.reporter.showAlert('Too Large',
                    'Panel "' + panels[i].name + '" (' + (panels[i].w + t * 2) + 'mm) exceeds bed width (' + limits.x + 'mm).');
                return [];
            }
            if (maxH > limits.y) {
                window.reporter.showAlert('Too Large',
                    'Layout height ' + maxH.toFixed(0) + 'mm exceeds bed height ' + limits.y + 'mm.');
                return [];
            }
            let gcode = this._header(s);
            let cx2 = 0;
            let panelBounds = [];
            let panelContours = [];
            for (const panel of sheetPanels) {
                gcode += '; --- ' + panel.name + ' Panel ---\n';
                const contour = this._panelContour(panel, s);
                this._offsetContour(contour, cx2, 0);
                gcode += this._cutContour(contour, s);
                panelBounds.push({ x: cx2, y: 0, w: panel.w + t * 2, h: panel.h + t * 2, name: panel.name });
                panelContours.push(contour);
                cx2 += panel.w + t * 2 + gap;
            }
            gcode += this._footer();
            sheets.push({ gcode, names: sheetPanels.map(p => p.name), bounds: panelBounds, contours: panelContours });
        }
        return sheets;
    }

    _renderSheets() {
        const container = document.getElementById('fj-sheets-list');
        if (!container) return;

        if (!this._sheets || this._sheets.length === 0) {
            container.innerHTML = '<div class="flex flex-col items-center justify-center text-grey py-8"><i class="bi bi-box-seam text-4xl text-grey-light block mb-2"></i><p class="text-xs text-center leading-relaxed">Adjust dimensions and tool settings,<br>then click Generate G-Code.</p></div>';
            return;
        }

        container.innerHTML = '';
        const limits = this.machineLimits;

        for (let i = 0; i < this._sheets.length; i++) {
            const sheet = this._sheets[i];
            const card = document.createElement('div');
            card.className = 'border border-grey-light rounded-lg p-3 bg-grey-bg/50';

            const canvasId = 'fj-preview-' + i;
            card.innerHTML =
                '<div class="flex items-start gap-3">' +
                    '<canvas id="' + canvasId + '" width="130" height="130" class="border border-grey-light rounded bg-white flex-shrink-0"></canvas>' +
                    '<div class="flex-1 min-w-0">' +
                        '<div class="text-xs font-bold text-secondary-dark mb-1">Sheet ' + (i + 1) + '</div>' +
                        '<div class="text-[10px] text-grey leading-relaxed">' + sheet.names.join('<br>') + '</div>' +
                        '<button class="mt-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors bg-secondary text-white hover:bg-secondary-dark flex items-center gap-1.5" onclick="window.fingerJointBox._loadSheet(' + i + ')">' +
                            '<i class="bi bi-eye text-[10px]"></i> Send to 3D View' +
                        '</button>' +
                    '</div>' +
                '</div>';
            container.appendChild(card);

            const canvas = document.getElementById(canvasId);
            if (canvas) this._drawSheetPreview(canvas, sheet.bounds, sheet.contours, limits);
        }
    }

    _drawSheetPreview(canvas, bounds, contours, limits) {
        const ctx = canvas.getContext('2d');
        const pad = 8;
        const cw = canvas.width - pad * 2;
        const ch = canvas.height - pad * 2;
        const sc = Math.min(cw / limits.x, ch / limits.y);
        const ox = pad + (cw - limits.x * sc) / 2;
        const oy = pad + (ch - limits.y * sc) / 2;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(ox, oy, limits.x * sc, limits.y * sc);
        ctx.setLineDash([]);

        const colors = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];
        for (let pi = 0; pi < bounds.length; pi++) {
            const ctr = contours[pi];
            if (!ctr || ctr.length < 2) continue;
            ctx.strokeStyle = colors[pi % colors.length];
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(ox + ctr[0][0] * sc, oy + ctr[0][1] * sc);
            for (let j = 1; j < ctr.length; j++) {
                ctx.lineTo(ox + ctr[j][0] * sc, oy + ctr[j][1] * sc);
            }
            ctx.closePath();
            ctx.stroke();
        }
    }

    _loadSheet(idx) {
        const sheet = this._sheets[idx];
        if (!sheet) return;
        this._currentSheet = idx;
        this._loadToViewer(sheet.gcode);
    }

    _panelContour(panel, s) {
        const t = s.stockThick;
        const fw = s.fingerWidth;
        const toolR = s.toolDia / 2;
        let result;
        if (panel.type === 'outer') {
            result = this._outerContour(panel.w, panel.h, t, fw, 0);
        } else {
            const edgeGap = panel.edgeGap || { left: true, right: true };
            result = this._innerContour(panel.w, panel.h, t, fw, panel.topSolid, 0, edgeGap);
        }
        let pts = result.pts;
        const dogbonePositions = result.dogbonePositions;
        // Expand outward by toolR via Clipper (so tool center cuts at the part boundary)
        this._expandContour(pts, toolR);
        // Match original dogbone corner positions to expanded path and insert dogbones
        if (s.dogbones && toolR > 0 && dogbonePositions.length > 0) {
            this._addDogbonesAtPositions(pts, dogbonePositions, toolR);
        }
        return pts;
    }

    _outerContour(w, h, t, fw, toolR) {
        const pts = [];
        const dogbones = [];
        this._buildEdge(pts, dogbones, [0, 0], [1, 0], [0, 1], w, t, fw, true, false);
        this._buildEdge(pts, dogbones, [w, 0], [0, 1], [-1, 0], h, t, fw, true, false);
        this._buildEdge(pts, dogbones, [w, h], [-1, 0], [0, -1], w, t, fw, true, false);
        this._buildEdge(pts, dogbones, [0, h], [0, -1], [1, 0], h, t, fw, true, false);
        const dogbonePositions = dogbones.map(d => [pts[d.idx][0], pts[d.idx][1]]);
        this._addDogbones(pts, dogbones, toolR);
        return { pts, dogbonePositions };
    }

    _innerContour(w, h, t, fw, topSolid, toolR, edgeGap) {
        const pts = [];
        const dogbones = [];
        this._buildEdge(pts, dogbones, [t, t], [1, 0], [0, -1], w - 2*t, t, fw, false, true);
        this._buildEdge(pts, dogbones, [w-t, t], [0, 1], [1, 0], h - 2*t, t, fw, false, edgeGap.right);
        if (topSolid) {
            this._edgeSolid(pts, [w-t, h-t], [-1, 0], w - 2*t);
        } else {
            this._buildEdge(pts, dogbones, [w-t, h-t], [-1, 0], [0, 1], w - 2*t, t, fw, false, edgeGap.top ?? false);
        }
        this._buildEdge(pts, dogbones, [t, h-t], [0, -1], [-1, 0], h - 2*t, t, fw, false, edgeGap.left);
        const dogbonePositions = dogbones.map(d => [pts[d.idx][0], pts[d.idx][1]]);
        this._addDogbones(pts, dogbones, toolR);
        return { pts, dogbonePositions };
    }

    _addDogbones(pts, dogboneList, toolR) {
        if (!dogboneList || dogboneList.length === 0 || toolR <= 0) return;
        const offset = toolR / Math.sin(Math.PI / 4);
        const orig = pts.map(p => [p[0], p[1]]);
        const sorted = [...dogboneList].sort((a, b) => b.idx - a.idx);
        for (const item of sorted) {
            const idx = item.idx;
            if (idx <= 0 || idx >= orig.length - 1) continue;
            const p = orig[idx];
            const vx = p[0] - orig[idx - 1][0];
            const vy = p[1] - orig[idx - 1][1];
            const vl = Math.sqrt(vx * vx + vy * vy);
            if (vl < 0.001) continue;
            const wx = orig[idx + 1][0] - p[0];
            const wy = orig[idx + 1][1] - p[1];
            const wl = Math.sqrt(wx * wx + wy * wy);
            if (wl < 0.001) continue;
            const dx = vx / vl - wx / wl;
            const dy = vy / vl - wy / wl;
            const dl = Math.sqrt(dx * dx + dy * dy);
            if (dl < 0.001) continue;
            const dogbone = [
                p[0] + dx / dl * offset,
                p[1] + dy / dl * offset
            ];
            pts.splice(idx + 1, 0, dogbone, [p[0], p[1]]);
        }
    }

    _addDogbonesAtPositions(pts, origPositions, toolR) {
        if (toolR <= 0 || pts.length < 4 || origPositions.length === 0) return;
        const offset = toolR / Math.sin(Math.PI / 4);
        const matchTol = toolR * 4;
        // Find all 90° corner indices in the expanded path
        const expanded = pts.map(p => [p[0], p[1]]);
        const cornerIdxs = [];
        for (let i = 1; i < expanded.length - 1; i++) {
            const vx = expanded[i][0] - expanded[i - 1][0];
            const vy = expanded[i][1] - expanded[i - 1][1];
            const vl = Math.sqrt(vx * vx + vy * vy);
            if (vl < 0.001) continue;
            const wx = expanded[i + 1][0] - expanded[i][0];
            const wy = expanded[i + 1][1] - expanded[i][1];
            const wl = Math.sqrt(wx * wx + wy * wy);
            if (wl < 0.001) continue;
            const dot = (vx / vl) * (wx / wl) + (vy / vl) * (wy / wl);
            if (Math.abs(dot) < 0.01) cornerIdxs.push(i);
        }
        if (cornerIdxs.length === 0) return;
        // For each original dogbone position, find the nearest 90° corner in expanded path
        const matched = [];
        for (const origPos of origPositions) {
            let bestIdx = -1;
            let bestDist = matchTol;
            for (const ci of cornerIdxs) {
                const dx = expanded[ci][0] - origPos[0];
                const dy = expanded[ci][1] - origPos[1];
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < bestDist) { bestDist = d; bestIdx = ci; }
            }
            if (bestIdx >= 0 && !matched.includes(bestIdx)) matched.push(bestIdx);
        }
        matched.sort((a, b) => b - a);
        for (const idx of matched) {
            if (idx <= 0 || idx >= expanded.length - 1) continue;
            const p = expanded[idx];
            const vx = p[0] - expanded[idx - 1][0];
            const vy = p[1] - expanded[idx - 1][1];
            const vl = Math.sqrt(vx * vx + vy * vy);
            if (vl < 0.001) continue;
            const wx = expanded[idx + 1][0] - p[0];
            const wy = expanded[idx + 1][1] - p[1];
            const wl = Math.sqrt(wx * wx + wy * wy);
            if (wl < 0.001) continue;
            const dx = vx / vl - wx / wl;
            const dy = vy / vl - wy / wl;
            const dl = Math.sqrt(dx * dx + dy * dy);
            if (dl < 0.001) continue;
            const dogbone = [p[0] + dx / dl * offset, p[1] + dy / dl * offset];
            pts.splice(idx + 1, 0, dogbone, [p[0], p[1]]);
        }
    }

    _buildEdge(pts, dogboneList, start, dir, perp, edgeLen, t, fw, isOuter, gapOffset) {
        const effectiveLen = isOuter ? (edgeLen - 2*t) : edgeLen;
        if (effectiveLen <= 0) {
            pts.push([start[0], start[1]]);
            return;
        }
        let x = start[0], y = start[1];

        if (pts.length === 0) pts.push([x, y]);

        if (gapOffset) {
            // Pattern: gap, bead, gap, bead, ..., gap  (01010, start with edge-level void)
            const numSegs = Math.max(1, Math.floor(0.5 * effectiveLen / fw));
            const numGaps = numSegs + 1;
            const gapWidth = (effectiveLen - numSegs * fw) / numGaps;
            for (let i = 0; i < numSegs; i++) {
                // Edge-level gap space (void for outer's bead to enter)
                x += dir[0] * gapWidth; y += dir[1] * gapWidth; pts.push([x, y]);
                dogboneList.push({ idx: pts.length - 1 });
                // Bead protrusion (fills outer's gap)
                x += perp[0] * t; y += perp[1] * t; pts.push([x, y]);
                x += dir[0] * fw; y += dir[1] * fw; pts.push([x, y]);
                x -= perp[0] * t; y -= perp[1] * t; pts.push([x, y]);
                dogboneList.push({ idx: pts.length - 1 });
            }
            // Last gap (no bead after it)
            x += dir[0] * gapWidth; y += dir[1] * gapWidth; pts.push([x, y]);
        } else {
            // Pattern: bead, gap, bead, gap, ..., bead
            const numSegs = Math.max(1, Math.floor(0.5 * effectiveLen / fw));
            const space = (effectiveLen - numSegs * fw) / (numSegs + 1);
            const initBead = isOuter ? (t + space) : space;
            x += dir[0] * initBead; y += dir[1] * initBead;
            pts.push([x, y]);
            // Dogbone at bead base internal corners (edge-level LEFT turns, both outer and inner)
            dogboneList.push({ idx: pts.length - 1 });
            for (let i = 0; i < numSegs; i++) {
                x += perp[0] * t; y += perp[1] * t; pts.push([x, y]);
                x += dir[0] * fw; y += dir[1] * fw; pts.push([x, y]);
                x -= perp[0] * t; y -= perp[1] * t; pts.push([x, y]);
                // Bead return (edge-level LEFT turn into base)
                dogboneList.push({ idx: pts.length - 1 });
                x += dir[0] * space; y += dir[1] * space; pts.push([x, y]);
                if (!isOuter && i < numSegs - 1) { dogboneList.push({ idx: pts.length - 1 }); }
            }
            if (isOuter) {
                x += dir[0] * t; y += dir[1] * t; pts.push([x, y]);
            }
        }
    }

    _edgeSolid(pts, start, dir, len) {
        pts.push([start[0] + dir[0]*len, start[1] + dir[1]*len]);
    }

    _offsetContour(pts, ox, oy) {
        for (const p of pts) { p[0] += ox; p[1] += oy; }
    }

    _expandContour(pts, toolR) {
        if (toolR <= 0 || pts.length < 3) return;
        const scale = 1000;
        const clPath = pts.map(p => ({ X: Math.round(p[0] * scale), Y: Math.round(p[1] * scale) }));
        const co = new ClipperLib.ClipperOffset();
        co.AddPath(clPath, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
        const offsetPaths = new ClipperLib.Paths();
        co.Execute(offsetPaths, toolR * scale);
        if (offsetPaths.length === 0) return;
        const off = offsetPaths[0];
        pts.length = 0;
        for (const p of off) {
            pts.push([p.X / scale, p.Y / scale]);
        }
    }

    _cutContour(pts, s) {
        const t = s.stockThick;
        const dpp = Math.min(3, t);
        const passes = Math.ceil(t / dpp);
        let gc = '';
        const sx = pts[0][0], sy = pts[0][1];
        gc += 'G0 Z5\nG0 X' + sx.toFixed(3) + ' Y' + sy.toFixed(3) + '\n';
        for (let p = 1; p <= passes; p++) {
            const z = -Math.min(p * dpp, t);
            gc += 'G1 Z' + z.toFixed(3) + ' F' + s.plunge + '\n';
            for (let i = 1; i < pts.length; i++) {
                gc += 'G1 X' + pts[i][0].toFixed(3) + ' Y' + pts[i][1].toFixed(3) + ' F' + s.feed + '\n';
            }
            gc += 'G1 X' + sx.toFixed(3) + ' Y' + sy.toFixed(3) + ' F' + s.feed + '\n';
        }
        gc += 'G0 Z5\n';
        return gc;
    }

    _getSettings() {
        const g = (id) => {
            const el = document.getElementById(id);
            return el ? parseFloat(el.value) : this.defaults[id.replace('fj-', '')];
        };
        return {
            boxW: g('fj-box-w') || this.defaults.boxW,
            boxD: g('fj-box-d') || this.defaults.boxD,
            boxH: g('fj-box-h') || this.defaults.boxH,
            stockThick: g('fj-stock') || this.defaults.stockThick,
            toolDia: g('fj-tool') || this.defaults.toolDia,
            fingerWidth: g('fj-finger') || this.defaults.fingerWidth,
            feed: g('fj-feed') || this.defaults.feed,
            plunge: g('fj-plunge') || this.defaults.plunge,
            dogbones: document.getElementById('fj-dogbones')?.checked ?? true
        };
    }
    _header(s) { return '; Finger Joint Box - Generated by Ooznest Control\nG17 G21 G90\n'; }
    _footer() { return 'G0 Z5\nG90\n'; }
    _loadToViewer(gcode, doSwitchTab) {
        if (window.viewer) window.viewer.processGCodeString(gcode);
        window.currentGCodeContent = gcode;
        window.currentSDFile = null;
        window.uiManager.updateRunButtonsState();
        if (doSwitchTab !== false) window.switchTab('viewer-view');
    }
}
