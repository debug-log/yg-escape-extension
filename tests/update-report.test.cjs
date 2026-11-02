const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

async function fixture(journal,partial){
 const elements=Object.fromEntries(['partialUpdate','partialVersion','partialFiles','partialDownload'].map(id=>[id,{hidden:true,textContent:'',href:''}]));
 const saved={updatePartial:partial};
 const context={document:{getElementById:id=>elements[id]},
  XREUpdateStore:{get:async()=>journal},
  chrome:{storage:{local:{get:async()=>saved,set:async value=>Object.assign(saved,value)},onChanged:{addListener(){}}}}};
 await vm.runInNewContext(fs.readFileSync('update-report.js','utf8'),context);
 return {elements,saved};
}
test('partial report works even when the controller was not updated',async()=>{
 const f=await fixture({state:'partial',version:'1.4.5',failures:[{name:'update.js',error:'blocked'},{name:'manifest.json',error:'denied'}],applied:['background.js']});
 assert.equal(f.elements.partialUpdate.hidden,false);
 assert.match(f.elements.partialFiles.textContent,/update\.js/);
 assert.match(f.elements.partialFiles.textContent,/manifest\.json/);
 assert.doesNotMatch(f.elements.partialFiles.textContent,/background\.js/);
 assert.equal(f.elements.partialDownload.href,'https://github.com/debug-log/yg-escape-extension/releases/tag/v1.4.5');
 assert.equal(f.saved.updatePartial.failures.length,2);
});
test('report persists after journal removal and disappears after a successful repair',async()=>{
 const partial={version:'1.4.5',failures:[{name:'update.js',error:'blocked'}]};
 assert.equal((await fixture(undefined,partial)).elements.partialUpdate.hidden,false);
 const repaired=await fixture({state:'committed',version:'1.4.5',failures:[]},partial);
 assert.equal(repaired.elements.partialUpdate.hidden,true);
 assert.equal(repaired.saved.updatePartial,null);
});
