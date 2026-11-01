// Real unpacked-extension test. Host permission is pre-granted only in a temporary copy.
const {spawn}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const http=require('node:http');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'xre-anti-'));
const extensionDir=path.join(temp,'extension');fs.mkdirSync(extensionDir);
for(const file of fs.readdirSync(root))if(/\.(js|html|css|json)$/.test(file)&&!file.startsWith('keyescape-'))fs.copyFileSync(path.join(root,file),path.join(extensionDir,file));
fs.cpSync(path.join(root,'vendor'),path.join(extensionDir,'vendor'),{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(extensionDir,'manifest.json')));
manifest.host_permissions=['http://127.0.0.1/*','http://localhost/*'];
if(process.env.XRE_TEST_LIVE==='1')manifest.host_permissions.push('https://keyescape.com/*');
fs.writeFileSync(path.join(extensionDir,'manifest.json'),JSON.stringify(manifest));
const serve=(req,res)=>{if(req.url==='/api'){res.setHeader('Content-Type','application/json');res.end('{"status":true,"data":[{"enable":"N"}]}');}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Anti-debug fixture</title><h1>Extension fixture</h1>');}};
const servers=[http.createServer(serve),http.createServer(serve)];
let child,id=0,buffer='';const pending=new Map();const pauses=[],requests=[];
function call(method,params={},sessionId){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});child.stdio[3].write(JSON.stringify({id:key,method,params,...(sessionId?{sessionId}:{})})+'\0');});}
async function evaluate(sessionId,expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function tab(url,background=false){const {targetId}=await call('Target.createTarget',{url,background});const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});return {targetId,sessionId,url};}
async function until(check,description){const limit=Date.now()+10000;while(Date.now()<limit){const value=await check();if(value)return value;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+description);}
function startChrome(){
 buffer='';
 child=spawn(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless','--no-first-run','--disable-background-networking','--disable-component-update','--enable-unsafe-extension-debugging','--remote-debugging-pipe','--user-data-dir='+path.join(temp,'profile')],{stdio:['ignore','ignore','ignore','pipe','pipe']});
 child.stdio[4].on('data',b=>{buffer+=b.toString();let n;while((n=buffer.indexOf('\0'))>=0){const raw=buffer.slice(0,n);buffer=buffer.slice(n+1);const m=JSON.parse(raw);if(m.method==='Page.javascriptDialogOpening'){console.log('LIVE dialog:',m.params.type,m.params.message);call('Page.handleJavaScriptDialog',{accept:false},m.sessionId).catch(()=>{});}if(m.method==='Network.requestWillBeSent')requests.push(m.params.request);if(m.method==='Debugger.paused'){pauses.push(m.params.reason);call('Debugger.resume',{},m.sessionId).catch(()=>{});}if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}});
}
async function stopChrome(){const exited=new Promise(resolve=>child.once('exit',resolve));await call('Browser.close').catch(()=>child.kill());await exited;}
const deadline=setTimeout(()=>{console.error('Chrome integration deadline exceeded');child?.kill();process.exit(1);},90000);
(async()=>{try{
 await Promise.all(servers.map(s=>new Promise(r=>s.listen(0,'127.0.0.1',r))));
 const origin='http://127.0.0.1:'+servers[0].address().port;
 const otherPort='http://127.0.0.1:'+servers[1].address().port;
 startChrome();
 const extension=await call('Extensions.loadUnpacked',{path:extensionDir});
 let options=await tab('chrome-extension://'+extension.id+'/options.html');
 await until(()=>evaluate(options.sessionId,'typeof config!=="undefined"&&!!config'),'options loaded');
 async function save(patch){return evaluate(options.sessionId,`(async()=>{const before=(await chrome.storage.local.get('config')).config;const after={...before,...${JSON.stringify(patch)}};const result=await chrome.runtime.sendMessage({type:'save',before,after});if(!result.ok)throw Error(result.error);config=result.config;baseline=structuredClone(config);render();return result.config;})()`);}
 await save({enabled:true,sites:[origin],rules:[{id:'test',name:'통합 검증 규칙',site:origin,enabled:true,url:'/api',match:'contains',method:'ANY',conditions:[],action:'patch',patches:[{path:'data[*].enable',value:'Y'}]}]});
 let page=await tab(origin+'/fixture');
 async function state(url=page.url){return evaluate(options.sessionId,`(async()=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url===${JSON.stringify(url)});if(!tab)return null;try{return await chrome.tabs.sendMessage(tab.id,{type:'state'},{frameId:0});}catch{return null;}})()`);}
 async function ready(url,expected){return until(async()=>{const s=await state(url);return s?.antiDebug?.ready&&(expected===undefined||(s.antiDebug.active===expected&&!s.antiDebug.reloadRequired))?s:null;},'anti-debug ready');}
 assert.equal((await ready()).antiDebug.active,true);
 const fnSource=()=>evaluate(page.sessionId,`Function.prototype.constructor('x','debugger; return x').toString()`);
 assert.equal((await fnSource()).includes('debugger'),false);
 assert.equal(await evaluate(page.sessionId,`Function.prototype.constructor('debugger; return "debugger"')()`),'debugger');
 const xhr=()=>evaluate(page.sessionId,`new Promise((resolve,reject)=>{const x=new XMLHttpRequest();x.open('GET','/api');x.onload=()=>resolve(JSON.parse(x.responseText).data[0].enable);x.onerror=reject;x.send();})`);
 assert.equal(await xhr(),'Y');
 await save({enabled:false});await until(async()=>(await state())?.enabled===false,'XHR disabled');
 assert.equal(await xhr(),'N');assert.equal((await fnSource()).includes('debugger'),false);
 console.log('PASS automatic activation, debugger parsing, XHR independence');
 // Real frames: registered same-origin gets anti-debug but not XHR; other port gets neither.
 await evaluate(page.sessionId,`Promise.all([${JSON.stringify(origin+'/child')},${JSON.stringify(otherPort+'/child')}].map(src=>new Promise(resolve=>{const f=document.createElement('iframe');f.src=src;f.onload=resolve;document.body.append(f);}))).then(()=>true)`);
 await until(()=>evaluate(page.sessionId,`!!frames[0].__xrAntiDebugInstalled&&!frames[0].Function.prototype.constructor('debugger;').toString().includes('debugger')`),'same-origin frame protected');
 assert.equal(await evaluate(page.sessionId,'!!frames[0].__xrEditorInstalled'),false);
 const other=await tab(otherPort+'/fixture');await until(()=>evaluate(other.sessionId,"document.readyState==='complete'"),'other port loaded');assert.notEqual((await state(other.url))?.antiDebug?.active,true);
 assert.equal(await evaluate(other.sessionId,`Function.prototype.constructor('debugger;').toString().includes('debugger')`),true);
 const unknown=await tab(origin.replace('127.0.0.1','localhost')+'/fixture');
 await until(()=>evaluate(unknown.sessionId,"document.readyState==='complete'"),'unregistered page loaded');
 assert.equal(await evaluate(unknown.sessionId,'!!window.__xrAntiDebugInstalled'),false);
 console.log('PASS exact origin/port exclusion and registered iframe scope');
 // The actual options control persists the exception and shows reload state.
 await evaluate(options.sessionId,`document.querySelector('#sites input[type=checkbox]').click()`);
 await until(async()=>(await state())?.antiDebug?.reloadRequired,'site toggle pending reload');
 assert.equal((await state()).antiDebug.active,true);
 await call('Page.reload',{},page.sessionId);assert.equal((await ready(undefined,false)).antiDebug.active,false);
 assert.equal((await fnSource()).includes('debugger'),true);
 await save({antiDebugDisabledSites:[]});await until(async()=>(await state())?.antiDebug?.reloadRequired,'reenable pending');
 await call('Page.reload',{},page.sessionId);assert.equal((await ready(undefined,true)).antiDebug.active,true);
 // CDP-loaded unpacked extensions must be loaded again after restarting Chrome.
 // Keep the same profile and verify saved settings restore without another save.
 await stopChrome();startChrome();
 assert.equal((await call('Extensions.loadUnpacked',{path:extensionDir})).id,extension.id);
 options=await tab('chrome-extension://'+extension.id+'/options.html');
 await until(()=>evaluate(options.sessionId,'typeof config!=="undefined"&&!!config'),'options after restart');
 page=await tab(origin+'/restart');assert.equal((await ready()).antiDebug.active,true);
 assert.equal((await fnSource()).includes('debugger'),false);
 console.log('PASS saved settings restore after browser restart and temporary extension reload');
 await call('Target.activateTarget',{targetId:page.targetId});
 const popup=await tab('chrome-extension://'+extension.id+'/popup.html',true);
 await until(()=>evaluate(popup.sessionId,"document.querySelector('#antiDebugState')?.textContent.includes('설정 반영됨')"),'popup anti-debug state');
 assert.equal(await evaluate(popup.sessionId,"document.querySelector('#enabled').checked"),false);
 assert.equal(await evaluate(popup.sessionId,"document.querySelector('#antiDebugState').textContent.includes('설정 켜짐')"),true);
 await call('Target.closeTarget',{targetId:popup.targetId});
 console.log('PASS popup reports anti-debug independently of response switch');
 // Same source screenshot is inspectable without affecting the user's Chrome profile.
 await evaluate(options.sessionId,'showMode(false)');
 await call('Emulation.setDeviceMetricsOverride',{width:1000,height:850,deviceScaleFactor:1,mobile:false},options.sessionId);
 const shot=await call('Page.captureScreenshot',{format:'png'},options.sessionId);
 fs.writeFileSync('/tmp/xre-anti-debug-settings.png',Buffer.from(shot.data,'base64'));
 await save({sites:[]});await until(async()=>(await state())?.antiDebug?.reloadRequired,'site removal pending');
 assert.equal(await evaluate(options.sessionId,'chrome.scripting.getRegisteredContentScripts().then(s=>s.length)'),0);
 await call('Page.reload',{},page.sessionId);await until(()=>evaluate(page.sessionId,"document.readyState==='complete'&&!window.__xrAntiDebugInstalled"),'removed page loaded');
 assert.equal(await evaluate(page.sessionId,'!!window.__xrAntiDebugInstalled'),false);
 console.log('PASS site exception UI, refresh activation/deactivation, site removal');
 if(process.env.XRE_TEST_LIVE==='1'){
  await save({sites:['https://keyescape.com'],enabled:false,antiDebugDisabledSites:[],rules:[]});
  const live=await tab('https://keyescape.com/reservation1.php?zizum_num=31&theme_num=96');
  await ready(live.url);
  await until(()=>evaluate(live.sessionId,"document.readyState==='complete'&&!!document.body"),'live page loaded');
  await until(async()=>(await state(live.url))?.dateUnlock?.active,'live date unlock active');
  assert.equal(await evaluate(live.sessionId,"document.querySelectorAll('td.selDate.disabled[data-date]').length"),0);
  assert.ok((await state(live.url)).dateUnlock.count>0,'closed dates were opened');
  await call('Page.enable',{},live.sessionId);
  await call('Network.enable',{},live.sessionId);
  await evaluate(live.sessionId,"document.querySelector('td.selDate.available[data-date]').click()");
  await until(()=>requests.some(r=>r.url.includes('run_proc.php')&&r.postData?.includes('get_theme_time')),'date click triggers time lookup');
  console.log('LIVE PASS date unlock and calendar click triggers read-only time lookup');
  await call('Debugger.enable',{},live.sessionId);
  const debugResult=await evaluate(live.sessionId,`Function.prototype.constructor('debugger; return 123')()`);
  assert.equal(debugResult,123);
  const body=await evaluate(live.sessionId,`new URLSearchParams({t:'get_theme_time',zizumNum:document.querySelector('#zizum').value,themeNum:document.querySelector('#theme').value,date:new Date(Date.now()+2*86400000).toISOString().slice(0,10)}).toString()`);
  const query=`new Promise((resolve,reject)=>{const x=new XMLHttpRequest();x.open('POST','/controller/run_proc.php');x.setRequestHeader('Content-Type','application/x-www-form-urlencoded');x.onload=()=>{try{resolve(JSON.parse(x.responseText));}catch(e){reject(e);}};x.onerror=()=>reject(Error('time lookup failed'));x.send(${JSON.stringify(body)});})`;
  const original=await evaluate(live.sessionId,query);
  assert.ok(original&&typeof original==='object');
  await save({enabled:true,rules:[{id:'live-probe',name:'읽기 전용 응답 교체 검증',enabled:true,site:'https://keyescape.com',url:'https://keyescape.com/controller/run_proc.php',match:'exact',method:'POST',requestParams:Object.fromEntries(new URLSearchParams(body)),conditions:[],action:'replace',replacement:{...original,__xrIntegrationProbe:true}}]});
  await until(async()=>(await state(live.url))?.enabled,'live XHR enabled');
  const replaced=await evaluate(live.sessionId,query);assert.equal(replaced.__xrIntegrationProbe,true);
  delete replaced.__xrIntegrationProbe;assert.deepEqual(replaced,original);
  await evaluate(live.sessionId,'new Promise(resolve=>setTimeout(()=>resolve(true),2000))');
  assert.equal(pauses.length,0,'no debugger pauses while connected');
  const liveState=await state(live.url);assert.ok(liveState.count>=1);assert.equal(liveState.antiDebug.active,true);
  console.log('LIVE PASS',JSON.stringify({state:liveState,dom:await evaluate(live.sessionId,'({title:document.title,url:location.href,hasCalendar:document.body.innerText.includes("테마 및 날짜")})'),originalStatus:original.status,readOnlyLookup:body,debuggerPauses:pauses.length}));
  const liveShot=await call('Page.captureScreenshot',{format:'png'},live.sessionId);fs.writeFileSync('/tmp/xre-anti-debug-live.png',Buffer.from(liveShot.data,'base64'));
 }
 console.log('PASS unpacked extension integration');
}catch(e){console.error(e);process.exitCode=1;}finally{
 clearTimeout(deadline);if(child)await stopChrome();
 for(const s of servers)s.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}})();
