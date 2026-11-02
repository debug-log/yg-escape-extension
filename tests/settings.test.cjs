const {test}=require('node:test');const assert=require('node:assert/strict');const {mergeConfig}=require('../settings.js');
test('stale editor preserves current enabled and unrelated edits',()=>{const before={enabled:false,sites:['https://a'],rules:[{id:'a',name:'old'}]};const current={...before,enabled:true,rules:[...before.rules,{id:'b',name:'other tab'}]};const after={...before,rules:[{id:'a',name:'new'}]};const out=mergeConfig(current,before,after);assert.equal(out.enabled,true);assert.deepEqual(out.rules,[{id:'a',name:'new'},{id:'b',name:'other tab'}]);});
test('site removal preserves concurrently added sites',()=>assert.deepEqual(mergeConfig({enabled:true,sites:['a','b'],rules:[]},{enabled:true,sites:['a'],rules:[]},{enabled:true,sites:[],rules:[]}).sites,['b']));
test('anti-debug defaults and concurrent per-site exceptions survive stale saves',()=>{
 const before={enabled:false,sites:['a','b'],rules:[]};
 assert.deepEqual(mergeConfig(before,before,before).antiDebugDisabledSites,[]);
 const current={...before,antiDebugDisabledSites:['b']};
 const after={...before,antiDebugDisabledSites:['a']};
 assert.deepEqual(mergeConfig(current,before,after).antiDebugDisabledSites.sort(),['a','b']);
 assert.deepEqual(mergeConfig(current,current,{...current,sites:['a']}).antiDebugDisabledSites,[]);
 assert.deepEqual(mergeConfig(current,current,{...current,antiDebugDisabledSites:[]}).antiDebugDisabledSites,[]);
});

test('date unlock defaults on and preserves concurrent edits',()=>{
 const before={enabled:false,sites:['https://keyescape.com'],rules:[]};
 assert.equal(mergeConfig(before,before,before).keyescapeDateUnlockEnabled,true);
 const current={...before,keyescapeDateUnlockEnabled:false};
 assert.equal(mergeConfig(current,before,{...before,enabled:true}).keyescapeDateUnlockEnabled,false);
 assert.equal(mergeConfig(before,before,{...before,keyescapeDateUnlockEnabled:false}).keyescapeDateUnlockEnabled,false);
 assert.equal(mergeConfig(current,current,{...current,keyescapeDateUnlockEnabled:true}).keyescapeDateUnlockEnabled,true);
});

const {helperState}=require('../settings.js');
const key='https://keyescape.com',play='https://play33.kr';
test('helper master preserves feature selections and is isolated by exact site',()=>{
 const config={enabled:true,sites:[key,play],rules:[],helperDisabledSites:[key],openingDisabledSites:[key],keyescapeDateUnlockEnabled:false};
 assert.deepEqual(helperState(config,key),{supported:true,registered:true,enabled:false,opening:false,dateUnlock:false,timetable:true,play33:false});
 assert.equal(helperState(config,play).enabled,true);
 assert.equal(helperState(config,key+':8443').supported,false);
 assert.equal(helperState({...config,helperDisabledSites:[]},key).dateUnlock,false);
 assert.equal(helperState({...config,helperDisabledSites:[]},key).opening,false);
 assert.equal(helperState({...config,enabled:false},key).timetable,false);
 assert.equal(helperState({...config,enabled:false,keyescapeTimetableEnabled:true},key).timetable,true);
});
test('stale editor preserves concurrent helper preferences and Play33 changes',()=>{
 const before={enabled:false,sites:[key,play],rules:[],keyescapeTimetableEnabled:false};
 const current={...before,helperDisabledSites:[play],openingDisabledSites:[play],play33Enabled:false,keyescapeTimetableEnabled:true};
 const after={...before,helperDisabledSites:[key],openingDisabledSites:[key],keyescapeDateUnlockEnabled:false};
 const out=mergeConfig(current,before,after);
 assert.deepEqual(out.helperDisabledSites,[play,key]);assert.deepEqual(out.openingDisabledSites,[play,key]);
 assert.equal(out.play33Enabled,false);assert.equal(out.keyescapeTimetableEnabled,true);assert.equal(out.keyescapeDateUnlockEnabled,false);
 const changed=mergeConfig(out,out,{...out,play33Enabled:true,keyescapeTimetableEnabled:false});
 assert.equal(changed.play33Enabled,true);assert.equal(changed.keyescapeTimetableEnabled,false);
});

const {responseConfig}=require('../settings.js');
test('bundled timetable is independent of custom responses, with rule order and per-rule choices preserved',()=>{
 const bundled=require('../keyescape-weekday-fallback-rules.json').rules[0];
 const custom={...bundled,id:'my-weekday-rule'};
 const config={enabled:false,keyescapeTimetableEnabled:true,sites:[key],rules:[custom,bundled,{...bundled,id:'disabled-copy',enabled:false}]};
 assert.deepEqual(responseConfig(config,key).rules.map(r=>r.id),[bundled.id]);
 const stopped=responseConfig({...config,enabled:true,helperDisabledSites:[key]},key);
 assert.deepEqual(stopped.rules.map(r=>r.id),['my-weekday-rule','disabled-copy']);
 assert.equal(stopped.rules[1].enabled,false);
 assert.equal(responseConfig({...config,sites:[]},key).enabled,false);
 assert.deepEqual(responseConfig({...config,enabled:true,keyescapeTimetableEnabled:false},key).rules.map(r=>r.id),['my-weekday-rule','disabled-copy']);
});
