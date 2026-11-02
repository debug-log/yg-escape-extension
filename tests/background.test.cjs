const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function fixture(fail=false){let config={enabled:true,sites:['https://example.com'],rules:[]},handler,registered=[],permitted=true;const event={addListener(){}};const chrome={runtime:{id:'test',getURL:p=>p,onInstalled:event,onStartup:event,onMessage:{addListener(fn){handler=fn;}}},permissions:{contains:async()=>permitted,onRemoved:event,onAdded:event},storage:{local:{get:async()=>({config}),set:async obj=>{config=obj.config;}}},scripting:{getRegisteredContentScripts:async()=>registered,unregisterContentScripts:async()=>{registered=[];},registerContentScripts:async scripts=>{if(fail)throw Error('denied');registered=scripts;},updateContentScripts:async scripts=>{if(fail)throw Error('denied');registered=scripts;}}};const ctx=vm.createContext({URL,fetch:async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync('keyescape-weekday-fallback-rules.json','utf8'))}),chrome,console:{error(){}},structuredClone});ctx.importScripts=()=>vm.runInContext(fs.readFileSync('settings.js','utf8'),ctx);vm.runInContext(fs.readFileSync('background.js','utf8'),ctx);return {send:m=>new Promise(resolve=>handler(m,{id:'test',url:'chrome-extension://test/options.html',tab:{id:1}},resolve)),get:()=>({config,registered}),setConfig:value=>{config=value;},revoke:()=>{permitted=false;}};}
test('registration errors return failure instead of success',async()=>{const f=fixture(true);const result=await f.send({type:'sync'});assert.equal(result.ok,false);assert.match(result.error,/denied/);});
test('registered scripts use granted matches and MAIN/ISOLATED worlds',async()=>{const f=fixture();assert.equal((await f.send({type:'sync'})).ok,true);const scripts=f.get().registered;assert.equal(scripts.length,3);assert.equal(scripts[0].world,'MAIN');assert.equal(scripts[0].runAt,'document_start');assert.deepEqual(Array.from(scripts[0].matches),['https://example.com/*']);});
test('serialized enabled updates preserve config',async()=>{const f=fixture();await f.send({type:'enabled',enabled:false});assert.equal(f.get().config.enabled,false);assert.equal(f.get().config.sites.length,1);});

test('save and enable overrides unchanged stale global switch',async()=>{const f=fixture();await f.send({type:'enabled',enabled:false});const before=structuredClone(f.get().config);const after=structuredClone(before);const result=await f.send({type:'save',before,after,enable:true});assert.equal(result.config.enabled,true);});

test('anti-debug registration includes authorized frames without changing XHR frame scope',async()=>{
 const f=fixture();await f.send({type:'sync'});const {registered}=f.get();
 assert.equal(registered.find(s=>s.id==='xr-main').allFrames,false);
 assert.equal(registered.find(s=>s.id==='xr-bridge').allFrames,true);
 const anti=registered.find(s=>s.id==='xr-anti-main');assert.ok(anti);
 assert.equal(anti.world,'MAIN');assert.equal(anti.runAt,'document_start');assert.equal(anti.allFrames,true);
 await f.send({type:'enabled',enabled:false});assert.ok(f.get().registered.some(s=>s.id==='xr-anti-main'));
 const before=structuredClone(f.get().config);
 await f.send({type:'save',before,after:{...before,sites:[]}});assert.deepEqual(f.get().registered,[]);
});

test('revoked host permission clears site exception and all registrations',async()=>{
 const f=fixture();await f.send({type:'sync'});const before=structuredClone(f.get().config);
 await f.send({type:'save',before,after:{...before,antiDebugDisabledSites:['https://example.com']}});
 f.revoke();await f.send({type:'sync'});
 assert.equal(f.get().config.sites.length,0);assert.equal(f.get().config.antiDebugDisabledSites.length,0);assert.equal(f.get().registered.length,0);
});

test('date script is available before bridge configuration in isolated world',async()=>{
 const f=fixture();await f.send({type:'sync'});
 const bridge=f.get().registered.find(s=>s.id==='xr-bridge');
 assert.deepEqual(Array.from(bridge.js),['date-unlock.js','play33.js','bridge.js']);
});

test('missing defaults are seeded once without losing existing rules or global switch',async()=>{
 const f=fixture();await f.send({type:'sync'});
 const seeded=f.get().config;
 assert.equal(seeded.rules.filter(r=>r.action==='weekdayFallback').length,34);
 assert.equal(seeded.keyescapeDefaultsVersion,1);
 const edited={...seeded.rules[0],name:'my edit',enabled:false};
 const after={...seeded,enabled:false,rules:[edited,{id:'custom',name:'keep me'}]};
 await f.send({type:'save',before:structuredClone(seeded),after});
 await f.send({type:'sync'});
 assert.equal(f.get().config.enabled,false);
 assert.equal(f.get().config.rules.length,2,'intentional deletion is not undone every sync');
 assert.equal(f.get().config.rules[0].name,'my edit');
});
test('all bundled defaults validate and contain only the 215 verified schedules',()=>{
 const {rules}=JSON.parse(fs.readFileSync('keyescape-weekday-fallback-rules.json','utf8'));
 const engine=require('../engine.js');
 assert.equal(rules.length,34);assert.equal(new Set(rules.map(r=>r.id)).size,34);
 assert.equal(rules.reduce((n,r)=>n+r.samples.length,0),215);
 for(const r of rules)engine.validate(r);
});

test('new installation automatically loads defaults without enabling global responses',async()=>{
 const f=fixture();f.setConfig(undefined);await f.send({type:'sync'});
 assert.equal(f.get().config.rules.filter(r=>r.action==='weekdayFallback').length,34);
 assert.equal(f.get().config.enabled,false);
});
test('upgrade and explicit restoration preserve customized defaults and unrelated settings',async()=>{
 const defaults=JSON.parse(fs.readFileSync('keyescape-weekday-fallback-rules.json','utf8')).rules;
 const custom={...defaults[0],name:'edited',enabled:false};
 const f=fixture();f.setConfig({enabled:false,sites:[],rules:[custom,{id:'mine',name:'personal'}],keyescapeDateUnlockEnabled:false});
 await f.send({type:'sync'});
 assert.equal(f.get().config.rules.length,35);assert.equal(f.get().config.rules[0].name,'edited');
 const before=structuredClone(f.get().config);
 await f.send({type:'save',before,after:{...before,rules:[custom,{id:'mine',name:'personal'}]}});
 const result=await f.send({type:'siteSetting',site:'https://keyescape.com',setting:'restoreDefaults'});
 assert.equal(result.ok,true);assert.equal(result.config.rules.length,35);
 assert.equal(result.config.rules[0].enabled,false);assert.equal(result.config.rules[0].name,'edited');
 assert.equal(result.config.keyescapeDateUnlockEnabled,false);assert.equal(result.config.enabled,false);
 assert.ok(result.config.sites.includes('https://keyescape.com'));
});
test('popup setting changes register permitted sites and preserve unrelated values',async()=>{
 const f=fixture();await f.send({type:'sync'});
 let result=await f.send({type:'siteSetting',site:'https://keyescape.com',setting:'dateUnlock',enabled:false});
 assert.equal(result.ok,true);assert.equal(result.config.keyescapeDateUnlockEnabled,false);
 assert.ok(result.config.sites.includes('https://keyescape.com'));assert.equal(result.config.enabled,true);
 result=await f.send({type:'siteSetting',site:'https://keyescape.com',setting:'antiDebug',enabled:false});
 assert.ok(result.config.antiDebugDisabledSites.includes('https://keyescape.com'));
 assert.equal(result.config.keyescapeDateUnlockEnabled,false);
 result=await f.send({type:'siteSetting',site:'https://keyescape.com',setting:'antiDebug',enabled:true});
 assert.ok(!result.config.antiDebugDisabledSites.includes('https://keyescape.com'));
 const before=structuredClone(f.get().config);f.revoke();
 result=await f.send({type:'siteSetting',site:'https://keyescape.com',setting:'dateUnlock',enabled:true});
 assert.equal(result.ok,false);assert.deepEqual(structuredClone(f.get().config),before);
});
