const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/features/tools/bowl-cutter.js'), 'utf8');
const alerts = [];
const context = vm.createContext({
    window: { reporter: { showAlert: (...args) => alerts.push(args) } },
    document: { getElementById: () => null }
});
vm.runInContext(source.replace('export class BowlCutter', 'class BowlCutter') + '\nthis.bowl = new BowlCutter();', context);
const bowl = context.bowl;
const defaults = { ...bowl._getSettings(), cutout: false };
let output;
bowl._loadToViewer = code => { output = code; };
function generate(settings = {}) {
    output = undefined;
    alerts.length = 0;
    bowl._getSettings = () => ({ ...defaults, ...settings });
    bowl.generate();
    return output;
}

const pocket = generate();
assert.ok(!pocket.includes('; Cutout'));
assert.equal(generate({ cutoutOffset: NaN, stockDepth: NaN }), pocket);
for (const rpm of [12000, 0]) {
    const code = generate({ cutout: true, stepdown: 3, stockDepth: 25, rpm });
    const [before, cutout] = code.split('; Cutout\n');
    assert.ok(before.includes('G1 Z-20.000'));
    assert.ok(cutout.startsWith('G0 Z5.000\nG0 X-45.000 Y58.000\n'));
    assert.deepEqual([...cutout.matchAll(/^G1 Z(-?[\d.]+)/gm)].map(m => Number(m[1])),
        [-3, -6, -9, -12, -15, -18, -21, -24, -25]);
    assert.equal((cutout.match(/^G2 /gm) || []).length, 36);
    assert.ok(cutout.includes('G1 X58.000 Y-45.000'));
    assert.ok(cutout.endsWith('G0 Z5.000\nG90\nM5\n'));
    assert.equal((code.match(/^M5$/gm) || []).length, 1);
    assert.equal(code.includes('M3'), rpm > 0);
}
for (const settings of [
    { stockDepth: 20 }, { stockDepth: NaN }, { cutoutOffset: -1 },
    { cutoutOffset: 0 }, { cutoutOffset: Infinity }, { stockDepth: 101 },
    { width: 190 }, { length: 190 }, { stepdown: 0 }, { stepover: 0 }
]) {
    assert.equal(generate({ cutout: true, ...settings }), undefined);
    assert.equal(alerts.length, 1);
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.match(html, /id="bc-cutout-fields" disabled/);
assert.match(html, /onchange="document.getElementById\('bc-cutout-fields'\).disabled = !this.checked"/);
console.log('Bowl Cutter: optional cutout, offset geometry, depth passes, validation and spindle footer passed.');
