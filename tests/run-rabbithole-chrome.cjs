// Browser integration test. All reservation traffic is served from a local fixture.
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'xre-rabbithole-'));
const extensionDir=path.join(temp,'extension');fs.mkdirSync(extensionDir);
for(const file of fs.readdirSync(root))if(/\.(js|html|css|json)$/.test(file))fs.copyFileSync(path.join(root,file),path.join(extensionDir,file));
fs.cpSync(path.join(root,'icons'),path.join(extensionDir,'icons'),{recursive:true});
fs.cpSync(path.join(root,'vendor'),path.join(extensionDir,'vendor'),{recursive:true});
const site='https://www.rabbitholeescape.co.kr';
const manifest=JSON.parse(fs.readFileSync(path.join(extensionDir,'manifest.json')));
manifest.host_permissions=[site+'/*'];fs.writeFileSync(path.join(extensionDir,'manifest.json'),JSON.stringify(manifest));
let child,id=0,buffer='';const pending=new Map();
function call(method,params={},sessionId){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});child.stdio[3].write(JSON.stringify({id:key,method,params,...(sessionId?{sessionId}:{})})+'\0');});}
async function evaluate(sessionId,expression,userGesture=false){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function tab(url,background=false){const {targetId}=await call('Target.createTarget',{url,background});const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});return {targetId,sessionId};}
async function until(check,description){const limit=Date.now()+10000;while(Date.now()<limit){if(await check())return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+description);}
function startChrome(){
 child=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--no-first-run','--disable-background-networking','--disable-component-update','--enable-unsafe-extension-debugging','--remote-debugging-pipe','--user-data-dir='+path.join(temp,'profile')],{stdio:['ignore','ignore','ignore','pipe','pipe']});
 child.stdio[4].on('data',b=>{buffer+=b.toString();let n;while((n=buffer.indexOf('\0'))>=0){const m=JSON.parse(buffer.slice(0,n));buffer=buffer.slice(n+1);if(m.method==='Fetch.requestPaused')call('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html; charset=utf-8'}],body:Buffer.from(fixture).toString('base64')},m.sessionId).catch(()=>{});if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}});
}
const fixture=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rabbit Hole fixture</title>
<style>body{margin:0;background:#eee}form{margin:30px auto;max-width:1000px}</style>
<form method="post" action="/reservation/create"><table><tr><th>예약일</th><td><p class="el-text" id="summaryDate">26년 11월 18일 / 14시 20분</p></td></tr><tr><th>테마명</th><td><p class="el-text" id="summaryTheme">행운만물상</p></td></tr></table>
<input name="name" value="테스트"><input name="phone" value="010-0000-0000"><select name="people"><option value="2">2명</option></select>
<input type="hidden" name="branch" value="1"><input type="hidden" name="theme" value="5"><input type="hidden" name="date" value="2026-11-18"><input type="hidden" name="time" value="14:20"><input type="hidden" name="_token" value="unchanged"><button type="submit">예약하기</button></form>
<script>window.submitted=0;window.changes=[];document.forms[0].addEventListener('submit',e=>{e.preventDefault();submitted++});document.forms[0].addEventListener('change',e=>{if(e.target.type==='hidden')changes.push(Object.fromEntries(new FormData(document.forms[0])));});</script>`;
const deadline=setTimeout(()=>{child?.kill();console.error('Chrome deadline exceeded');process.exit(1);},60000);
(async()=>{try{
 startChrome();const extension=await call('Extensions.loadUnpacked',{path:extensionDir});
 const options=await tab('chrome-extension://'+extension.id+'/options.html');
 await until(()=>evaluate(options.sessionId,'typeof config!=="undefined"&&!!config'),'options loaded');
 assert.equal(await evaluate(options.sessionId,"document.querySelectorAll('#rabbitholeCatalog details').length"),2);
 await evaluate(options.sessionId,"document.querySelector('#enableRabbithole').click()",true);
 await until(()=>evaluate(options.sessionId,`chrome.storage.local.get('config').then(r=>r.config.sites.includes('${site}'))`),'startup');
 await until(()=>evaluate(options.sessionId,"!helperBusy && !document.querySelector('#rabbitholeToggle').disabled"),'content scripts registered');
 const page=await tab('about:blank');
 await call('Fetch.enable',{patterns:[{urlPattern:site+'/*',requestStage:'Request'}]},page.sessionId);
 await call('Page.navigate',{url:site+'/reservation/create#list'},page.sessionId);
 const ev=expr=>evaluate(page.sessionId,expr),panel="document.querySelector('#xr-rabbithole-panel').shadowRoot";
 await until(()=>ev("!!document.querySelector('#xr-rabbithole-panel')"),'panel installed');
 const values=()=>ev("Object.fromEntries(new FormData(document.forms[0]))"),original=await values();
 assert.equal(original.theme,'5');assert.equal(original.date,'2026-11-18');assert.equal(await ev('changes.length'),0);
 async function change(key,value){await ev(`(()=>{const el=${panel}.getElementById(${JSON.stringify(key)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
 await change('date','2027-01-09');assert.equal((await values()).time,'14:20');
 assert.equal(await ev(`${panel}.getElementById('time').options[0].value`),'09:50');
 assert.match(await ev("document.querySelector('#summaryDate').textContent"),/27년 01월 09일/);
 await change('theme','4');assert.equal((await values()).theme,'4');assert.equal((await values()).time,'10:05');
 assert.match(await ev("document.querySelector('#summaryTheme').textContent"),/두껍아/);
 await change('time','22:05');assert.equal((await values()).time,'22:05');
 for(const key of ['name','phone','people','_token'])assert.equal((await values())[key],original[key]);
 assert.equal(await ev("changes.every(x=>x.branch==='1'&&x.date==='2027-01-09'&&(['5','4'].includes(x.theme)))"),true);
 await until(()=>ev(`${panel}.querySelector('xr-opening-hint')?.shadowRoot?.textContent.includes('2027-01-02 23:00')`),'opening rule');
 const valid=await values();await change('date','');assert.deepEqual(await values(),valid);
 await ev(`${panel}.getElementById('restore').click()`);assert.deepEqual(await values(),original);
 assert.equal(await ev("document.querySelectorAll('[data-xr-rabbithole-changed]').length"),0);
 await change('date','2027-01-09');
 for(const mobile of [false,true]){
  if(mobile)await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},page.sessionId);
  assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth'),true);
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},page.sessionId);
  fs.writeFileSync(path.join(os.tmpdir(),`xre-rabbithole-${mobile?'mobile':'desktop'}.png`),Buffer.from(shot.data,'base64'));
 }
 await evaluate(options.sessionId,"document.querySelector('#rabbitholeToggle').click()");
 await until(()=>ev("!document.querySelector('#xr-rabbithole-panel')"),'panel off');assert.deepEqual(await values(),original);
 await until(()=>evaluate(options.sessionId,"!document.querySelector('#rabbitholeToggle').disabled"),'settings saved');
 await evaluate(options.sessionId,"document.querySelector('#rabbitholeToggle').click()");
 await until(()=>ev("!!document.querySelector('#xr-rabbithole-panel')"),'panel restored');
 await ev(`(()=>{const form=document.forms[0],copy=form.cloneNode(true);copy.querySelector('#xr-rabbithole-panel').remove();form.replaceWith(copy);})()`);
 await until(()=>ev("!!document.querySelector('#xr-rabbithole-panel')"),'form replacement');
 await change('theme','4');assert.equal((await values()).theme,'4');assert.equal(await ev('submitted'),0);
 await call('Target.activateTarget',{targetId:page.targetId});const popup=await tab('chrome-extension://'+extension.id+'/popup.html',true);
 await until(()=>evaluate(popup.sessionId,"document.querySelector('#play33State')?.textContent.includes('사용 중')"),'popup state');
 assert.equal(await evaluate(popup.sessionId,"document.querySelector('#site').textContent"),'래빗홀');
 assert.equal(await ev("!!document.querySelector('#xr-play33-panel')"),false);
 console.log('PASS Rabbit Hole: settings, catalog, hidden fields, summary, weekend times, restore, opening, toggle, form replacement, popup, mobile layout, personal data preservation, no submission');
 console.log('Screenshots: '+path.join(os.tmpdir(),'xre-rabbithole-desktop.png')+' / '+path.join(os.tmpdir(),'xre-rabbithole-mobile.png'));
}catch(e){console.error(e);process.exitCode=1;}finally{
 clearTimeout(deadline);if(child){const exited=new Promise(resolve=>child.once('exit',resolve));await call('Browser.close').catch(()=>child.kill());await exited;}
 const resolved=path.resolve(temp);
 if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('xre-rabbithole-'))throw Error('Unexpected cleanup path');
 fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}})();
