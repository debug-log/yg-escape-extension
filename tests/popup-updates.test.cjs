const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const U=require('../update-core.js');
async function fixture(result,partial){
 const elements={updateStatus:{},openUpdater:{hidden:false}},saved={},opened=[];
 const context={document:{getElementById:id=>elements[id]},window:{close(){}},
  XREUpdate:{...U,checkRelease:async()=>result},XREUpdateCache:{},
  chrome:{runtime:{getManifest:()=>({version:'1.4.0'}),getURL:p=>'chrome-extension://test/'+p},
   tabs:{query:async()=>[{id:17,url:'https://example.com/page'}],create:async x=>opened.push(x)},storage:{local:{get:async()=>({updatePartial:partial})},session:{set:async x=>Object.assign(saved,x)}}}};
 await vm.runInNewContext(fs.readFileSync('popup-updates.js','utf8'),context);
 return {elements,saved,opened};
}
test('popup announces new version and updater keeps original page as reload target',async()=>{
 const f=await fixture({release:{version:'1.4.1'}});
 assert.match(f.elements.updateStatus.textContent,/1\.4\.1/);assert.equal(f.elements.openUpdater.hidden,false);
 await f.elements.openUpdater.onclick();assert.equal(f.saved.updateTarget.id,17);assert.equal(f.saved.updateTarget.url,'https://example.com/page');assert.equal(f.opened[0].url,'chrome-extension://test/update.html');
});

test('partial installation remains visible even when manifest is already latest',async()=>{
 const f=await fixture({release:{version:'1.4.0'}},{version:'1.4.0',failures:[{name:'update.js'}]});
 assert.equal(f.elements.openUpdater.hidden,false);
 assert.match(f.elements.updateStatus.textContent,/미적용 1개/);
 assert.match(f.elements.openUpdater.textContent,/미적용 파일/);
});
test('latest release hides update action while an error retains the retry entry',async()=>{
 const latest=await fixture({release:{version:'1.4.0'}});assert.equal(latest.elements.openUpdater.hidden,true);
 const offline=await fixture({release:null,error:'offline'});assert.equal(offline.elements.openUpdater.hidden,false);
});
