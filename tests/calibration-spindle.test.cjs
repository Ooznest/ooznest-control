const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function setup() {
    const context = vm.createContext({window:{grblSettings:{settings:{'30':{val:'24000'},'31':{val:'8000'},'395':{val:'0'}}}},document:{getElementById:()=>null},setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout,console});
    for (const file of ['js/viewer/gcode-draw.js','js/features/calibration.js']) {
        const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
        vm.runInContext(source,context);
    }
    const h=vm.runInContext('Object.create(CalibrationHandler.prototype)',context);
    const sent=[],values=new Map();
    Object.assign(h,{axis:'X',method:'vernier',spindleControl:'controller',spindleRpm:16000,spindleDelay:3,startedSpindle:false,
        store:{get:k=>values.get(k),set:(k,v)=>values.set(k,v)},ws:{isConnected:true,sendCommand:line=>sent.push(line),on(){},removeListener(){}},term:{writeln(){}},renderWizard(){},setStep(){}});
    return {h,context,sent,values};
}
test('Controller spindle starts after Z clearance, waits before cutting, and stops after the final retract',()=>{
    const {h}=setup();const lines=h.generateGCode().trim().split('\n');
    assert.equal(lines[1],'G0 Z1');assert.equal(lines[2],'M3 S16000');assert.equal(lines[3],'G4 P3');assert.equal(lines[4],'G0 X0 Y0');
    assert.equal(lines.at(-1),'M5');assert.match(lines.at(-2),/^G0.*Z1\.000$/);
    assert.equal(lines.filter(l=>/^M3\b/.test(l)).length,1);assert.equal(lines.filter(l=>/^M5\b/.test(l)).length,1);
});
test('Manual spindle program never sends spindle start/stop commands',()=>{
    const {h}=setup();h.spindleControl='manual';assert.doesNotMatch(h.generateGCode(),/\bM[345]\b/);
    assert.match(h._renderCutStep(),/Start your manual spindle/);
});
test('Controller UI includes explicit RPM and spin-up delay controls',()=>{
    const {h}=setup();const html=h._renderCutStep();assert.match(html,/cal-spindle-rpm/);assert.match(html,/cal-spindle-delay/);assert.match(html,/configured spindle/);
});
test('Zero spin-up delay emits no dwell and Y orientation has the same safe spindle sequence',()=>{
    const {h}=setup();h.axis='Y';h.spindleDelay=0;const code=h.generateGCode();assert.doesNotMatch(code,/\bG4\b/);assert.match(code,/M3 S16000/);assert.ok(code.endsWith('M5\n'));
});
test('Measured travel never starts a spindle or uses the Vernier generator',()=>{
    const {h,sent}=setup();h.method='distance';let moved=false;h.runDistanceMove=()=>{moved=true;};h.runCutJob();assert.equal(moved,true);assert.equal(sent.length,0);assert.doesNotMatch(h._renderCutStep(),/cal-spindle-rpm/);
});
test('Invalid RPM and delay cannot start a program',()=>{
    const {h,context,sent}=setup();let message='';context.window.reporter={showAlert:(title,text)=>{message=text;}};
    for(const rpm of [0,-1,NaN,Infinity,16000.5,25000,7000]){h.spindleRpm=rpm;assert.ok(h._validateSpindleSettings());h.runCutJob();assert.equal(sent.length,0);}
    h.spindleRpm=16000;for(const delay of [-1,61,Infinity,NaN]){h.spindleDelay=delay;assert.ok(h._validateSpindleSettings());}
    assert.ok(message);
});
test('Laser-only profiles and a laser primary spindle block Vernier operation',()=>{
    const {h,context,values}=setup();values.set('machine.toolheads',JSON.stringify({spindle:'laser-pwm'}));assert.match(h._validateSpindleSettings(),/not a laser/);
    values.set('machine.toolheads',JSON.stringify({spindle:'vfd-0-10v'}));context.window.grblSettings.settings['395'].val='1';assert.match(h._validateSpindleSettings(),/not a laser/);
});
test('Known digital heads default to controller mode; manual and unknown heads do not',()=>{
    const {h,values}=setup();for(const spindle of ['mafell-digital','vfd-0-10v','vfd-modbus']){values.set('machine.toolheads',JSON.stringify({spindle}));assert.equal(h._defaultSpindleControl(),'controller');}
    for(const spindle of ['workbee-router-head','mafell-manual','laser-pwm','unknown']){values.set('machine.toolheads',{spindle});assert.equal(h._defaultSpindleControl(),'manual');}
});
test('Cancel sends M5 only for a controller spindle started by this wizard',()=>{
    const {h,sent}=setup();h.cancel(undefined,{returnToOperation:false});assert.deepEqual(sent,[]);h.startedSpindle=true;h.cancel(undefined,{returnToOperation:false});assert.deepEqual(sent,['M5']);h.cancel(undefined,{returnToOperation:false});assert.equal(sent.length,1);
});
test('A controller error stops streaming and requests spindle stop rather than sending another cut line',()=>{
    const {h,sent}=setup();h.runCutJob();const before=sent.length;assert.ok(h.startedSpindle);h.okListener('error:20');assert.equal(h.isCutting,false);assert.deepEqual(sent.slice(before),['M5']);
});
