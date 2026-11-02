const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const key='https://keyescape.com',play='https://play33.kr';
async function popup(sendMessage, options={}) {
 const elements=new Map();let tick;
 const config=options.config||{enabled:false,sites:[],rules:[]};
 const context={URL,XRSettings:require('../settings.js'),document:{getElementById(id){if(!elements.has(id))elements.set(id,{textContent:'',checked:false});return elements.get(id);}},chrome:{
 tabs:{query:async()=>[{id:1,url:options.url||key+'/reservation1.php'}],sendMessage:options.pageState||(async()=>{throw Error('no script');}),reload:async()=>{}},
 storage:{session:{set:async()=>{}},local:{get:async()=>({config})}},
 runtime:{sendMessage},permissions:{request:options.requestPermission||(async()=>true)}},
 setInterval(callback){tick=callback;}};
 await vm.runInNewContext(fs.readFileSync('popup.js','utf8'),context);
 return {elements,tick,config};
}
test('popup exposes only the supported site features and guides other/internal pages',async()=>{
 for(const [url,dateVisible,playVisible,supported] of [[key,true,false,true],[play+'/reservation/create',false,true,true],['https://example.com',false,false,false],['chrome://extensions',false,false,false]]){
  const f=await popup(async()=>({ok:true}),{url});
  assert.equal(f.elements.get('dateUnlockFeature').hidden,!dateVisible);
  assert.equal(f.elements.get('play33Feature').hidden,!playVisible);
  assert.equal(f.elements.get('helperToggle').disabled,true);
  assert.equal(f.elements.get('addCurrentSite').hidden,!supported);
 }
});
test('starting helper requests permission first without enabling custom rules',async()=>{
 const calls=[],config={enabled:false,sites:[],rules:[]};
 const f=await popup(async m=>{calls.push(m);if(m.type==='siteSetting')config.sites.push(m.site);return {ok:true};},{config,url:play+'/reservation/create',requestPermission:async p=>{calls.push(p);return true;}});
 await f.elements.get('addCurrentSite').onclick();
 assert.deepEqual(JSON.parse(JSON.stringify(calls.slice(1))),[{origins:[play+'/*']},{type:'siteSetting',site:play,setting:'startHelper'}]);
 assert.equal(config.enabled,false);assert.equal(f.elements.get('addCurrentSite').hidden,true);
});
test('permission denial leaves the site unregistered and shows an actionable error',async()=>{
 const calls=[];const f=await popup(async m=>{calls.push(m);return {ok:true};},{requestPermission:async()=>false});
 await f.elements.get('addCurrentSite').onclick();assert.equal(calls.length,1);
 assert.match(f.elements.get('popupMessage').textContent,/권한/);assert.equal(f.elements.get('helperToggle').disabled,true);
});
test('master off displays saved feature choices disabled, without affecting the other site',async()=>{
 const f=await popup(async()=>({ok:true}),{config:{enabled:false,sites:[key,play],rules:[],helperDisabledSites:[key],openingDisabledSites:[key],keyescapeDateUnlockEnabled:true,keyescapeTimetableEnabled:false}});
 assert.equal(f.elements.get('helperToggle').checked,false);
 assert.equal(f.elements.get('openingToggle').checked,false);assert.equal(f.elements.get('openingToggle').disabled,true);
 assert.equal(f.elements.get('dateUnlockToggle').checked,true);assert.equal(f.elements.get('dateUnlockToggle').disabled,true);
 assert.equal(f.elements.get('timetableToggle').checked,false);
 assert.equal(f.elements.get('reload').hidden,true);
});
test('missing setting reply restores the saved checkbox and reports extension recovery',async()=>{
 const f=await popup(async m=>m.type==='sync'?{ok:true}:undefined,{config:{enabled:false,sites:[key],rules:[],keyescapeDateUnlockEnabled:false}});
 f.elements.get('dateUnlockToggle').checked=true;await f.elements.get('dateUnlockToggle').onchange();
 assert.match(f.elements.get('popupMessage').textContent,/chrome:\/\/extensions/);
 assert.equal(f.elements.get('dateUnlockToggle').checked,false);assert.equal(f.elements.get('dateUnlockToggle').disabled,false);
});
test('feature toggle sends a site-local command and never the global response switch',async()=>{
 const calls=[],config={enabled:true,sites:[key],rules:[],keyescapeTimetableEnabled:true};
 const f=await popup(async m=>{calls.push(m);if(m.setting==='timetable')config.keyescapeTimetableEnabled=m.enabled;return {ok:true};},{config});
 f.elements.get('timetableToggle').checked=false;await f.elements.get('timetableToggle').onchange();
 assert.deepEqual(JSON.parse(JSON.stringify(calls.slice(1))),[{type:'siteSetting',site:key,setting:'timetable',enabled:false}]);assert.equal(config.enabled,true);
});
test('applied state stays visible while polling, then real reload requirement is shown',async()=>{
 let resolve,delay=false;const applied={ready:true,enabled:false,dateUnlock:{ready:true,active:true},opening:{ready:true,eligible:true,active:true}};
 const f=await popup(async()=>({ok:true}),{config:{enabled:false,sites:[key],rules:[]},pageState:()=>delay?new Promise(r=>{resolve=r;}):Promise.resolve(applied)});
 assert.equal(f.elements.get('dateUnlockState').textContent,'사용 중');
 delay=true;const refresh=f.tick();await new Promise(r=>setImmediate(r));assert.equal(f.elements.get('dateUnlockState').textContent,'사용 중');
 resolve({...applied,dateUnlock:{ready:true,active:false,reloadRequired:true}});await refresh;
 assert.equal(f.elements.get('dateUnlockState').textContent,'새로고침 필요');assert.equal(f.elements.get('reload').hidden,false);
});
test('startup transport failure keeps popup usable and preserves backend error',async()=>{
 const f=await popup(async()=>{throw Error('connection failed');});assert.equal(f.elements.get('popupMessage').textContent,'connection failed');assert.equal(typeof f.tick,'function');
});
