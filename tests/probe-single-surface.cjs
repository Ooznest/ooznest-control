const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function setup(){
 const Handler=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/machine/probe.js'),'utf8').replace('export class ProbeHandler','class ProbeHandler')+'\nProbeHandler');
 const handler=Object.create(Handler.prototype),commands=[];
 Object.assign(handler,{store:{data:{probe:{toolDiameter:6,xPlateOffset:8,yPlateOffset:10,plateThickness:15,travel:25,feed:100,retract:2}}},selections:{singleAxis:'Z',singleDir:-1},term:{writeln(){}},_requireProbeSafe:()=>true,saveSettings(){},_resetProbeTest(){},sendBatch:batch=>commands.push(...batch)});
 return {handler,commands};
}
test('Top sets Z from plate thickness regardless of cutter diameter or XY offsets',()=>{
 for(const diameter of [3,6,12]){const {handler,commands}=setup();handler.store.data.probe.toolDiameter=diameter;handler.runSingleSurface();assert.ok(commands.includes('G10 L20 P0 Z15.000'));assert.ok(commands.includes('G38.2 Z-25 F100'));assert.equal(commands.at(-1),'G90');}
});
test('Side probing retains directional plate offset and cutter radius',()=>{
 for(const [axis,dir,expected] of [['X',1,-11],['X',-1,11],['Y',1,-13],['Y',-1,13]]){const {handler,commands}=setup();handler.runSingleAxis(axis,dir);assert.ok(commands.includes(`G10 L20 P0 ${axis}${expected.toFixed(3)}`));}
});
test('A 3D probe Top touch sets Z zero without adding tool radius',()=>{
 const {handler,commands}=setup();handler.enable3DProbe=true;handler.store.data.probe.mode='probe';handler.runSingleSurface();assert.ok(commands.includes('G10 L20 P0 Z0.000'));
});
test('A failed probe safety gate sends no probing or zero-setting commands',()=>{
 const {handler,commands}=setup();handler._requireProbeSafe=()=>false;handler.runSingleSurface();assert.deepEqual(commands,[]);
});
test('Single Surface selects millimetres before using millimetre input values',()=>{
 const {handler,commands}=setup();handler.runSingleSurface();assert.equal(commands[0],'G21');assert.ok(commands.indexOf('G21')<commands.findIndex(c=>c.includes('G38.2')));
});
test('Outside Corner selects millimetres before zeroing or making any moves',()=>{
 const {handler,commands}=setup();handler.ws={sendCommand:c=>commands.push(c)};handler.selections.outsideCorner='FL';handler.runAutoCorner();assert.equal(commands[0],'G21');assert.equal(commands[1],'G10 P0 L20 X0 Y0 Z0');
});
