// Real unpacked-extension test. Host permission is pre-granted only in a temporary copy.
const {spawn}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'xre-date-'));
const extensionDir=path.join(temp,'extension');fs.mkdirSync(extensionDir);
for(const file of fs.readdirSync(root))if(/\.(js|html|css|json)$/.test(file)&&!file.startsWith('keyescape-'))fs.copyFileSync(path.join(root,file),path.join(extensionDir,file));
fs.cpSync(path.join(root,'vendor'),path.join(extensionDir,'vendor'),{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(extensionDir,'manifest.json')));
manifest.host_permissions=['https://keyescape.com/*'];
fs.writeFileSync(path.join(extensionDir,'manifest.json'),JSON.stringify(manifest));
let child,id=0,buffer='';const pending=new Map();
function call(method,params={},sessionId){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});child.stdio[3].write(JSON.stringify({id:key,method,params,...(sessionId?{sessionId}:{})})+'\0');});}
async function evaluate(sessionId,expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function tab(url,background=false){const {targetId}=await call('Target.createTarget',{url,background});const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});return {targetId,sessionId,url};}
async function until(check,description){const limit=Date.now()+10000;while(Date.now()<limit){const value=await check();if(value)return value;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+description);}
function startChrome(){
 buffer='';
 child=spawn(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless','--no-first-run','--disable-background-networking','--disable-component-update','--enable-unsafe-extension-debugging','--remote-debugging-pipe','--user-data-dir='+path.join(temp,'profile')],{stdio:['ignore','ignore','ignore','pipe','pipe']});
 child.stdio[4].on('data',b=>{buffer+=b.toString();let n;while((n=buffer.indexOf('\0'))>=0){const raw=buffer.slice(0,n);buffer=buffer.slice(n+1);const m=JSON.parse(raw);if(m.method==='Fetch.requestPaused'){call('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html'}],body:Buffer.from(fixture).toString('base64')},m.sessionId).catch(()=>{});}if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}});
}
async function stopChrome(){const exited=new Promise(resolve=>child.once('exit',resolve));await call('Browser.close').catch(()=>child.kill());await exited;}
const deadline=setTimeout(()=>{console.error('Chrome integration deadline exceeded');child?.kill();process.exit(1);},90000);

const fixture='<!doctype html><title>Date fixture</title><table><tr><td id="date" class="selDate sun disabled endDay" data-date="2026-11-08">8</td><td id="past" class="selDate disabled" data-date="2020-01-01">1</td><td id="empty" class="selDate disabled">empty</td></tr></table><button class="disabled" id="button">Other</button>';
(async()=>{try{
 startChrome();
 const extension=await call('Extensions.loadUnpacked',{path:extensionDir});
 const options=await tab('chrome-extension://'+extension.id+'/options.html');
 await until(()=>evaluate(options.sessionId,'typeof config!=="undefined"&&!!config'),'options loaded');
 async function save(patch){return evaluate(options.sessionId,`(async()=>{const before=(await chrome.storage.local.get('config')).config;const after={...before,...${JSON.stringify(patch)}};const r=await chrome.runtime.sendMessage({type:'save',before,after});if(!r.ok)throw Error(r.error);config=r.config;baseline=structuredClone(config);render();return r.config;})()`);}
 await save({enabled:false,sites:['https://keyescape.com'],rules:[]});
 async function fixtureTab(url){const t=await tab('about:blank');await call('Fetch.enable',{patterns:[{urlPattern:'https://keyescape.com/*',resourceType:'Document',requestStage:'Request'}]},t.sessionId);await call('Page.navigate',{url},t.sessionId);await until(()=>evaluate(t.sessionId,"!!document.querySelector('#date')"),'fixture loaded');return {...t,url};}
 const page=await fixtureTab('https://keyescape.com/reservation1.php?zizum_num=31&theme_num=96');
 const ev=expression=>evaluate(page.sessionId,expression);
 async function state(){return evaluate(options.sessionId,`(async()=>{const tabs=await chrome.tabs.query({});const t=tabs.find(t=>t.url===${JSON.stringify(page.url)});return chrome.tabs.sendMessage(t.id,{type:'state'},{frameId:0});})()`);}
 await until(()=>ev("document.querySelector('#date').classList.contains('available')"),'date opens by default');
 assert.equal(await ev("document.querySelector('#date').className"),'selDate sun endDay available');
 assert.equal(await ev("document.querySelector('#past').classList.contains('available')"),true);
 assert.equal(await ev("document.querySelector('#empty').classList.contains('disabled')&&document.querySelector('#button').classList.contains('disabled')"),true);
 assert.equal((await state()).enabled,false);assert.equal((await state()).dateUnlock.active,true);
 await ev(`document.querySelector('tr').insertAdjacentHTML('beforeend','<td id="next" class="selDate disabled" data-date="2026-12-01">1</td>')`);
 await until(()=>ev("document.querySelector('#next').classList.contains('available')"),'month rerender');
 await ev("document.querySelector('#next').className='selDate disabled'");
 await until(()=>ev("document.querySelector('#next').classList.contains('available')"),'class reset');
 const count=(await state()).dateUnlock.count;await ev('new Promise(r=>setTimeout(r,100))');assert.equal((await state()).dateUnlock.count,count);
 await ev(`new Promise(resolve=>{const f=document.createElement('iframe');f.src='/reservation1.php?frame=1';f.onload=resolve;document.body.append(f);})`);
 assert.equal(await ev("frames[0].document.querySelector('#date').classList.contains('disabled')"),true);
 const other=await fixtureTab('https://keyescape.com/other.php');
 assert.equal(await evaluate(other.sessionId,"document.querySelector('#date').classList.contains('disabled')"),true);
 console.log('PASS default on, independent of XHR, rerender, class preservation, exclusions and no self-loop');
 await evaluate(options.sessionId,"document.querySelector('#keyescapeDateUnlock').click()");
 await until(async()=>(await state()).dateUnlock.active===false,'disable takes effect');
 assert.equal((await state()).dateUnlock.reloadRequired,true);
 await ev("document.querySelector('#next').className='selDate disabled'");await ev('new Promise(r=>setTimeout(r,100))');
 assert.equal(await ev("document.querySelector('#next').classList.contains('disabled')"),true);
 await call('Page.reload',{},page.sessionId);await until(()=>ev("!!document.querySelector('#date')"),'disabled page reload');
 assert.equal(await ev("document.querySelector('#date').classList.contains('disabled')"),true);
 await save({keyescapeDateUnlockEnabled:true});await until(()=>ev("document.querySelector('#date').classList.contains('available')"),'reenabled');
 await call('Target.activateTarget',{targetId:page.targetId});const popup=await tab('chrome-extension://'+extension.id+'/popup.html',true);
 await until(()=>evaluate(popup.sessionId,"document.querySelector('#dateUnlockState')?.textContent.includes('적용 중')"),'popup date status');
 assert.equal(await evaluate(popup.sessionId,"document.querySelector('#enabled').checked"),false);
 await call('Target.closeTarget',{targetId:popup.targetId});
 await save({sites:[]});await until(async()=>(await state()).dateUnlock.active===false,'site removal');
 await ev("document.querySelector('#date').className='selDate disabled'");await ev('new Promise(r=>setTimeout(r,100))');
 assert.equal(await ev("document.querySelector('#date').classList.contains('disabled')"),true);
 const unregistered=await fixtureTab('https://keyescape.com/reservation1.php?unregistered=1');
 assert.equal(await evaluate(unregistered.sessionId,"document.querySelector('#date').classList.contains('disabled')"),true);
 console.log('PASS toggle persistence, immediate stop, reload restoration, popup and unregistered site');
}catch(e){console.error(e);process.exitCode=1;}finally{
 clearTimeout(deadline);if(child)await stopChrome();
 fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}})();
