const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function fixture(tabURL='https://example.com/page',version='1.4.1') {
 const state={updatePending:{version:'1.4.1',target:{id:7,url:'https://example.com/page'}}},reloaded=[],opened=[];
 const event={addListener(){}};
 const chrome={runtime:{id:'test',getManifest:()=>({version}),getURL:p=>'chrome-extension://test/'+p,onInstalled:event,onStartup:event,onMessage:event},permissions:{onRemoved:event,onAdded:event},
 storage:{local:{get:async()=>state,set:async o=>Object.assign(state,o),remove:async k=>{delete state[k];}}},
 tabs:{get:async()=>({id:7,url:tabURL}),reload:async id=>reloaded.push(id),create:async data=>opened.push(data)}};
 const ctx=vm.createContext({chrome,console,URL,Date,importScripts(){}});vm.runInContext(fs.readFileSync('background.js','utf8'),ctx);
 return {run:()=>vm.runInContext('finishPendingUpdate()',ctx),state,reloaded,opened};
}
test('successful upgrade reloads only the unchanged originating tab',async()=>{
 const f=fixture();await f.run();assert.deepEqual(f.reloaded,[7]);assert.equal(f.state.updatePending,undefined);assert.equal(f.state.updateResult.version,'1.4.1');assert.equal(f.state.updateResult.ok,true);assert.equal(f.opened.length,1);
});
test('changed target tab and wrong loaded version never trigger page reload',async()=>{
 const moved=fixture('https://example.com/other');await moved.run();assert.deepEqual(moved.reloaded,[]);assert.equal(moved.state.updateResult.ok,true);
 const wrong=fixture(undefined,'1.4.0');await wrong.run();assert.deepEqual(wrong.reloaded,[]);assert.equal(wrong.state.updateResult.ok,false);
});
