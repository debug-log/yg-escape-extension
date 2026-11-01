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
