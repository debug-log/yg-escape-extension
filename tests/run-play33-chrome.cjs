// Real unpacked-extension test. Host permission is pre-granted only in a temporary copy.
const {spawn}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'xre-play33-'));
const extensionDir=path.join(temp,'extension');fs.mkdirSync(extensionDir);
for(const file of fs.readdirSync(root))if(/\.(js|html|css|json)$/.test(file)&&(!file.startsWith('keyescape-')||file==='keyescape-weekday-fallback-rules.json'))fs.copyFileSync(path.join(root,file),path.join(extensionDir,file));
fs.cpSync(path.join(root,'icons'),path.join(extensionDir,'icons'),{recursive:true});
fs.cpSync(path.join(root,'vendor'),path.join(extensionDir,'vendor'),{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(extensionDir,'manifest.json')));
manifest.host_permissions=['https://play33.kr/*'];
fs.writeFileSync(path.join(extensionDir,'manifest.json'),JSON.stringify(manifest));
let child,id=0,buffer='';const pending=new Map();
function call(method,params={},sessionId){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});child.stdio[3].write(JSON.stringify({id:key,method,params,...(sessionId?{sessionId}:{})})+'\0');});}
async function evaluate(sessionId,expression,userGesture=false){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function tab(url,background=false){const {targetId}=await call('Target.createTarget',{url,background});const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});return {targetId,sessionId,url};}
async function until(check,description){const limit=Date.now()+10000;while(Date.now()<limit){const value=await check();if(value)return value;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+description);}
function startChrome(){
 buffer='';
 child=spawn(process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':process.platform==='linux'?'/usr/bin/google-chrome':'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),['--headless','--no-first-run','--disable-background-networking','--disable-component-update','--enable-unsafe-extension-debugging','--remote-debugging-pipe','--user-data-dir='+path.join(temp,'profile')],{stdio:['ignore','ignore','ignore','pipe','pipe']});
 child.stdio[4].on('data',b=>{buffer+=b.toString();let n;while((n=buffer.indexOf('\0'))>=0){const raw=buffer.slice(0,n);buffer=buffer.slice(n+1);const m=JSON.parse(raw);if(m.method==='Fetch.requestPaused'){call('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html'}],body:Buffer.from(fixture).toString('base64')},m.sessionId).catch(()=>{});}if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}});
}
async function stopChrome(){const exited=new Promise(resolve=>child.once('exit',resolve));await call('Browser.close').catch(()=>child.kill());await exited;}
const deadline=setTimeout(()=>{console.error('Chrome integration deadline exceeded');child?.kill();process.exit(1);},90000);

const fixture=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Play33 fixture</title>
<style>body{margin:0;background:#eee}form{margin:30px auto;max-width:1000px}</style>
<form method="post" action="/reservation/create"><div class="resform-table"><h2>예약 정보</h2><p>목격자 / 2026-11-03 10:30</p>
<input name="name" value="예약자"><input name="phone" value="010-1234-5678"><select name="people"><option value="2">2명</option></select></div>
<input type="hidden" name="branch" value="1"><input type="hidden" name="theme" value="47"><input type="hidden" name="date" value="2026-11-03"><input type="hidden" name="time" value="10:30"><input type="hidden" name="_token" value="unchanged">
<button type="submit">예약하기</button></form><form id="unrelated"><input type="hidden" name="branch" value="99"></form>
<script>window.submitted=0;window.changes=[];document.forms[0].addEventListener('submit',e=>{e.preventDefault();submitted++});document.forms[0].addEventListener('change',e=>{if(e.target.type==='hidden')changes.push(Object.fromEntries(new FormData(document.forms[0])));});</script>`;
(async()=>{try{
 startChrome();
 const extension=await call('Extensions.loadUnpacked',{path:extensionDir});
 const options=await tab('chrome-extension://'+extension.id+'/options.html');
 await until(()=>evaluate(options.sessionId,'typeof config!=="undefined"&&!!config'),'options loaded');
 async function save(sites){return evaluate(options.sessionId,`(async()=>{const before=(await chrome.storage.local.get('config')).config;const r=await chrome.runtime.sendMessage({type:'save',before,after:{...before,enabled:false,sites:${JSON.stringify(sites)}}});if(!r.ok)throw Error(r.error);})()`);}
 assert.equal(await evaluate(options.sessionId,"document.querySelectorAll('#play33Catalog details').length"),10);
 assert.equal(await evaluate(options.sessionId,"document.querySelector('#quickTitle').textContent"),'기본 템플릿 · 키이스케이프');
 await evaluate(options.sessionId,"document.querySelector('#enablePlay33').click()",true);
 await until(()=>evaluate(options.sessionId,"chrome.storage.local.get('config').then(r=>r.config.sites.includes('https://play33.kr'))"),'built-in Play33 activation');
 assert.equal(await evaluate(options.sessionId,"chrome.storage.local.get('config').then(r=>r.config.enabled)"),false);
 async function fixtureTab(url){const t=await tab('about:blank');await call('Fetch.enable',{patterns:[{urlPattern:'https://play33.kr/*',resourceType:'Document',requestStage:'Request'}]},t.sessionId);await call('Page.navigate',{url},t.sessionId);await until(()=>evaluate(t.sessionId,"!!document.forms[0]"),'fixture loaded');return {...t,url};}
 const page=await fixtureTab('https://play33.kr/reservation/create#content');
 const ev=expression=>evaluate(page.sessionId,expression);
 const panel="document.querySelector('#xr-play33-panel').shadowRoot";
 const values=()=>ev("Object.fromEntries(new FormData(document.forms[0]))");
 async function change(key,value){return ev(`(()=>{const el=${panel}.getElementById(${JSON.stringify(key)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
 await until(()=>ev("!!document.querySelector('#xr-play33-panel')"),'panel installed');
 await until(()=>ev(`${panel}.querySelector('xr-opening-hint')?.shadowRoot?.querySelector('#when')`),'inline opening hint installed');
 await change('date','2027-01-15');
 assert.match(await ev(`${panel}.querySelector('xr-opening-hint').shadowRoot.textContent`),/2027-01-08 20:00/);
 await change('branch','7');
 assert.match(await ev(`${panel}.querySelector('xr-opening-hint').shadowRoot.textContent`),/2027-01-08 22:00/);
 await ev(`${panel}.getElementById('restore').click()`);
 await ev('changes=[]');
 const original=await values();
 assert.equal(await ev(`${panel}.getElementById('theme').value`),'47');
 assert.equal(await ev('changes.length'),0,'initial mounting must not change the form');
 await change('date','2026-11-07');
 assert.equal((await values()).time,'09:45');
 assert.equal((await values()).date,'2026-11-07');
 assert.equal(await ev("document.querySelector('input[name=time]').getAttribute('value')"),'09:45');
 assert.equal(await ev("changes.every(x=>x.branch==='1'&&x.theme==='47'&&x.date==='2026-11-07'&&x.time==='09:45')"),true,'all fields updated before notification');
 await change('time','22:25');assert.equal((await values()).time,'22:25');
 await change('branch','5');assert.equal((await values()).theme,'44');
 await change('theme','31');assert.equal((await values()).time,'09:55');
 await change('date','2026-11-06');assert.equal((await values()).time,'09:50');
 await change('time','13:25');await change('date','2026-11-08');assert.equal((await values()).time,'13:25','valid time preserved');
 const beforeInvalid=await values();await change('date','');assert.deepEqual(await values(),beforeInvalid,'empty date does not partially write');
 await ev(`${panel}.getElementById('restore').click()`);assert.deepEqual(await values(),original);
 assert.equal(await ev("document.querySelector('#unrelated input').value"),'99');
 assert.equal(await ev('submitted'),0);
 await change('branch','7');
 await evaluate(options.sessionId,"document.querySelector('#play33Toggle').click()",true);
 await until(()=>ev("!document.querySelector('#xr-play33-panel')"),'toggle removes panel');
 assert.deepEqual(await values(),original,'disabling restores the original reservation');
 await call('Page.reload',{},page.sessionId);
 await until(()=>ev("!!document.forms[0]"),'disabled page reloaded');
 assert.equal(await ev("!!document.querySelector('#xr-play33-panel')"),false);
 assert.equal(await evaluate(options.sessionId,"chrome.storage.local.get('config').then(r=>r.config.play33Enabled)"),false);
 await until(()=>evaluate(options.sessionId,"document.querySelector('#play33Toggle').disabled===false"),'toggle save completes');
 await evaluate(options.sessionId,"document.querySelector('#play33Toggle').click()",true);
 await until(()=>ev("!!document.querySelector('#xr-play33-panel')"),'toggle restores panel');
 await change('branch','7');
 assert.equal((await values()).theme,'40');assert.equal((await values()).name,'예약자');assert.equal((await values())._token,'unchanged');
 const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},page.sessionId);
 fs.writeFileSync(path.join(os.tmpdir(),'xre-play33-desktop.png'),Buffer.from(shot.data,'base64'));
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},page.sessionId);
 assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth'),true);
 const mobile=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},page.sessionId);
 fs.writeFileSync(path.join(os.tmpdir(),'xre-play33-mobile.png'),Buffer.from(mobile.data,'base64'));
 await ev(`new Promise(resolve=>{const f=document.createElement('iframe');f.src='/reservation/create';f.onload=resolve;document.body.append(f);})`);
 assert.equal(await ev("!!frames[0].document.querySelector('#xr-play33-panel')"),false);
 const other=await fixtureTab('https://play33.kr/reservation');
 assert.equal(await evaluate(other.sessionId,"!!document.querySelector('#xr-play33-panel')"),false);
 await evaluate(other.sessionId,`document.body.innerHTML='<form><select name="branch"><option value="7">수원점</option></select><input name="date" value="2027-01-15"></form><input id="reservation_range_day" value="8"><input id="reservation_range_open_time" value="18:30:00">'`);
 await until(()=>evaluate(other.sessionId,"document.querySelector('xr-opening-hint')?.shadowRoot.textContent.includes('2027-01-07 18:30')"),'listing reads current official settings');
 await save([]);await until(()=>ev("!document.querySelector('#xr-play33-panel')"),'remove site');assert.deepEqual(await values(),original);
 assert.equal(await evaluate(other.sessionId,"document.querySelectorAll('xr-opening-hint').length"),0);
 await call('Target.activateTarget',{targetId:page.targetId});
 const popup=await tab('chrome-extension://'+extension.id+'/popup.html',true);
 await until(()=>evaluate(popup.sessionId,"document.querySelector('#addCurrentSite')?.disabled === false"),'quick registration available');
 await evaluate(popup.sessionId,"document.querySelector('#addCurrentSite').click()",true);
 await until(()=>ev("!!document.querySelector('#xr-play33-panel')"),'quick registration reenables panel');
 await until(()=>evaluate(popup.sessionId,"document.querySelector('#play33State').textContent.includes('적용 중')"),'popup Play33 state');
 assert.equal(await evaluate(popup.sessionId,"document.querySelector('#addCurrentSite').disabled"),true);
 assert.equal(await evaluate(options.sessionId,"chrome.storage.local.get('config').then(r=>r.config.enabled)"),false);
 const popupShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},popup.sessionId);
 fs.writeFileSync(path.join(os.tmpdir(),'xre-play33-quick-add.png'),Buffer.from(popupShot.data,'base64'));
 await call('Target.closeTarget',{targetId:popup.targetId});
 const optionsShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},options.sessionId);
 fs.writeFileSync(path.join(os.tmpdir(),'xre-play33-defaults.png'),Buffer.from(optionsShot.data,'base64'));
 assert.equal(await ev("document.querySelectorAll('#xr-play33-panel').length"),1);
 await ev(`(()=>{const form=document.forms[0],copy=form.cloneNode(true);copy.querySelector('#xr-play33-panel').remove();form.replaceWith(copy);})()`);
 await until(()=>ev("!!document.querySelector('#xr-play33-panel')"),'form replacement');
 await change('branch','4');assert.equal((await values()).theme,'26');
 assert.equal(await ev('submitted'),0);
 console.log('PASS built-in catalog, settings activation and popup quick registration with independent response switch');
 console.log('PASS real extension: initial preservation, dependent choices, atomic hidden writes, invalid date, restore, personal data, no submission, mobile layout, frame/path exclusions, site removal and form replacement');
 console.log('Screenshots: '+path.join(os.tmpdir(),'xre-play33-desktop.png')+' / '+path.join(os.tmpdir(),'xre-play33-mobile.png'));
}catch(e){console.error(e);process.exitCode=1;}finally{
 clearTimeout(deadline);if(child)await stopChrome();
 fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}})();
