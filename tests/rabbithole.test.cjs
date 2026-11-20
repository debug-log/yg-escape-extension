const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const S=require('../settings.js');
const O=require('../opening.js');
const site='https://www.rabbitholeescape.co.kr';
test('Rabbit Hole is independently configurable without enabling Play33',()=>{
 const config={enabled:false,sites:[site],rules:[],play33Enabled:false};
 const state=S.helperState(config,site);
 assert.equal(state.supported,true);assert.equal(state.rabbithole,true);
 assert.equal(state.play33,false);assert.equal(state.opening,true);
 assert.equal(S.helperState({...config,rabbitholeEnabled:false},site).rabbithole,false);
 assert.equal(S.helperState(config,site+':8443').supported,false);
 const current={...config,rabbitholeEnabled:false};
 assert.equal(S.mergeConfig(current,config,{...config,enabled:true}).rabbitholeEnabled,false);
 assert.equal(S.mergeConfig(current,current,{...current,rabbitholeEnabled:true}).rabbitholeEnabled,true);
});
test('Rabbit Hole catalog matches observed weekday and weekend schedules',()=>{
 assert.ok(fs.existsSync('rabbithole.js'),'Rabbit Hole adapter must exist');
 const R=require('../rabbithole.js');
 assert.deepEqual(R.branches.map(b=>[b.id,b.themes.map(t=>t.id)]),[['1',['5','4']]]);
 assert.deepEqual(R.times('1','5','2026-11-18'),['11:20','12:50','14:20','15:50','17:20','18:50','20:20','21:50']);
 assert.deepEqual(R.times('1','4','2026-11-18'),['11:35','13:05','14:35','16:05','17:35','19:05','20:35','22:05']);
 for(const date of ['2026-11-21','2026-11-22']){
  assert.equal(R.times('1','5',date)[0],'09:50');assert.equal(R.times('1','4',date)[0],'10:05');
  assert.equal(R.times('1','4',date).length,9);
 }
 for(const date of ['2026-11-17','2026-11-19','2026-11-20','2026-11-23'])assert.equal(R.times('1','5',date).length,8);
 assert.deepEqual(R.times('1','5','2026-02-30'),[]);
 assert.deepEqual(R.times('2','5','2026-11-18'),[]);
 assert.deepEqual(R.times('1','47','2026-11-18'),[]);
});
test('Rabbit Hole opens seven days before at 23:00 KST',()=>{
 const rule=O.rule('rabbithole','1');assert.deepEqual(rule,{leadDays:7,time:'23:00'});
 assert.equal(O.state(rule,'2026-11-25',Date.parse('2026-11-18T22:59:59+09:00')).phase,'upcoming');
 assert.equal(O.state(rule,'2026-11-25',Date.parse('2026-11-18T23:00:00+09:00')).phase,'open');
});
