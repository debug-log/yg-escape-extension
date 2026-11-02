const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
async function publish(config,origin='https://example.com',top=true){
 const messages=[];let dateConfig,play33Config;const event={addListener(){}};
 const ctx=vm.createContext({XRSettings:require('../settings.js'),location:{origin},XRDateUnlock:{configure:c=>{dateConfig=c;}},XRPlay33:{configure:c=>{play33Config=c;}},chrome:{storage:{local:{get:async()=>({config})},onChanged:event},runtime:{onMessage:event}},addEventListener(){},postMessage:m=>messages.push(m)});
 vm.runInContext('window=globalThis; window.top='+(top?'window':'{}'),ctx);
 vm.runInContext(fs.readFileSync('bridge.js','utf8'),ctx);await new Promise(r=>setImmediate(r));
 return {...messages.find(m=>m.type==='config'),dateConfig,play33Config};
}
test('bridge activates anti-debug independently of XHR switch, only on exact registered origins',async()=>{
 const config={enabled:false,sites:['https://example.com'],rules:[]};
 assert.equal((await publish(config)).antiDebug?.enabled,true);
 assert.equal((await publish(config,'https://example.com:8443')).antiDebug?.enabled,false);
 assert.equal((await publish({...config,antiDebugDisabledSites:['https://example.com']})).antiDebug?.enabled,false);
 assert.equal((await publish({...config,sites:[]})).antiDebug?.enabled,false);
});
test('child frames receive anti-debug but cannot enable XHR transformation',async()=>{
 const out=await publish({enabled:true,sites:['https://example.com'],rules:[]},'https://example.com',false);
 assert.equal(out.antiDebug?.enabled,true);assert.equal(out.config.enabled,false);
});

test('bridge passes date setting independently of global switch',async()=>{
 const config={enabled:false,sites:['https://keyescape.com'],rules:[]};
 assert.equal((await publish(config,'https://keyescape.com')).dateConfig?.keyescapeDateUnlockEnabled,undefined);
 assert.equal((await publish({...config,keyescapeDateUnlockEnabled:false},'https://keyescape.com')).dateConfig?.keyescapeDateUnlockEnabled,false);
 assert.deepEqual(Array.from((await publish(config,'https://keyescape.com')).dateConfig?.sites||[]),config.sites);
});

test('bridge configures Play33 independently of XHR and passes site removal',async()=>{
 const config={enabled:false,sites:['https://play33.kr'],rules:[]};
 assert.deepEqual((await publish(config,'https://play33.kr')).play33Config,config);
 const removed={...config,sites:[]};
 assert.deepEqual((await publish(removed,'https://play33.kr')).play33Config,removed);
});
