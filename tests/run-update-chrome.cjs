// Full shipping updater in a disposable real Chrome profile. CDP supplies a
// real directory handle by drag/drop and pre-grants permission only in that
// profile. Native picker/permission UI requires a separate interactive check.
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
// Windows AppData/Temp is deliberately blocked by File System Access. Use a
// normal workspace folder, as users do when installing under Documents.
const temp=fs.mkdtempSync(path.join(process.platform==='win32'?root:os.tmpdir(),'xre-update-chrome-'));
const installed=path.join(temp,'installed'),candidate=path.join(temp,'candidate'),output=path.join(temp,'dist');
const packageScript=path.join(root,'scripts/package.py');
execFileSync('python3',[packageScript,'--out-dir',output]);
const current=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).version;
const archive=path.join(output,`yg-escape-extension-${current}.zip`);
for(const dir of [installed,candidate])execFileSync('python3',['-c','import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',archive,dir]);
const version='1.4.1';
for(const dir of [installed,candidate]){
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
 manifest.host_permissions.push('http://127.0.0.1/*');
 if(dir===candidate)manifest.version=version;
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest));
}
fs.appendFileSync(path.join(candidate,'style.css'),'\n/* updated integration fixture */\n');
execFileSync('python3',[packageScript,'--root',candidate,'--out-dir',output]);
const zip=fs.readFileSync(path.join(output,`yg-escape-extension-${version}.zip`));
const sha=crypto.createHash('sha256').update(zip).digest('hex');
const download=`https://github.com/debug-log/yg-escape-extension/releases/download/v${version}/yg-escape-extension-${version}.zip`;
let apiMode='release',downloads=0;
const release={tag_name:'v'+version,assets:[{name:`yg-escape-extension-${version}.zip`,size:zip.length,digest:'sha256:'+sha,browser_download_url:download}]};
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Original page</title><h1>Update integration target</h1>');});
fs.mkdirSync(path.join(temp,'profile','Default'),{recursive:true});
fs.writeFileSync(path.join(temp,'profile','Default','Preferences'),JSON.stringify({profile:{default_content_setting_values:{file_system_write_guard:1,file_system_read_guard:1}}}));
let child,socket,sequence=0;const pending=new Map();
function call(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
async function evaluate(sessionId,expression,userGesture=false){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function until(check,label,timeout=15000){const deadline=Date.now()+timeout;while(Date.now()<deadline){const value=await check();if(value)return value;await new Promise(r=>setTimeout(r,80));}throw Error('Timed out: '+label);}
async function intercept(sessionId){await call('Fetch.enable',{patterns:[{urlPattern:'https://api.github.com/repos/debug-log/yg-escape-extension/releases/latest'},{urlPattern:download}]},sessionId);}
async function tab(url){const {targetId}=await call('Target.createTarget',{url:'about:blank'});const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});await intercept(sessionId);await call('Page.navigate',{url},sessionId);await until(()=>evaluate(sessionId,`document.readyState==='complete' && location.href!=='about:blank'`).catch(()=>false),'tab load');return {sessionId,targetId};}
async function drop(sessionId,dir){
 await evaluate(sessionId,`window.dropDone=false;window.dropError=null;document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',async e=>{e.preventDefault();try{window.testDirectory=await e.dataTransfer.items[0].getAsFileSystemHandle();if(!testDirectory)throw Error('Directory handle was null; items='+e.dataTransfer.items.length);window.dropDone=true;}catch(error){window.dropError=error.name+': '+error.message;}},{once:true});`);
 for(const type of ['dragEnter','dragOver','drop'])await call('Input.dispatchDragEvent',{type,x:100,y:100,data:{items:[],files:[dir],dragOperationsMask:1}},sessionId);
 await until(async()=>{const state=await evaluate(sessionId,'({done:window.dropDone,error:window.dropError})');if(state.error)throw Error(state.error);return state.done;},'directory handle');
}
const deadline=setTimeout(()=>{console.error('Updater integration deadline exceeded');child?.kill();process.exit(1);},150000);
(async()=>{try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const chromePaths=process.platform==='win32'
  ? [path.join(process.env.PROGRAMFILES||'C:\\Program Files','Google/Chrome/Application/chrome.exe'),path.join(process.env['PROGRAMFILES(X86)']||'C:\\Program Files (x86)','Google/Chrome/Application/chrome.exe')]
  : ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium'];
 const executable=process.env.CHROME_PATH||chromePaths.find(p=>fs.existsSync(p));
 if(!executable)throw Error('Chrome not found; set CHROME_PATH');
 child=spawn(executable,['--headless','--no-first-run','--disable-background-networking','--enable-unsafe-extension-debugging','--remote-debugging-port=0','--user-data-dir='+path.join(temp,'profile')],{stdio:'ignore',windowsHide:true});
 const portFile=path.join(temp,'profile','DevToolsActivePort');
 await until(()=>fs.existsSync(portFile),'Chrome debugging port');
 const [port,endpoint]=fs.readFileSync(portFile,'utf8').trim().split(/\r?\n/);
 socket=new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 socket.onmessage=event=>{const m=JSON.parse(event.data);
  if(m.method==='Fetch.requestPaused'){
   const isZip=m.params.request.url===download;if(isZip)downloads++;
   const status=isZip?200:apiMode==='missing'?404:200;
   const body=isZip?zip:Buffer.from(JSON.stringify(apiMode==='missing'?{message:'Not Found'}:release));
   call('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:isZip?'application/zip':'application/json'}],body:body.toString('base64')},m.sessionId).catch(()=>{});
  }
  const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}
 };
 console.log('BROWSER',await call('Browser.getVersion'));
 const management=await tab('chrome://extensions');
 await evaluate(management.sessionId,`new Promise(resolve=>chrome.developerPrivate.updateProfileConfiguration({inDeveloperMode:true},resolve))`);
 const {id}=await call('Extensions.loadUnpacked',{path:installed});const extension='chrome-extension://'+id;
 const original=await tab(origin+'/page');
 const updater=await tab(extension+'/update.html');const s=updater.sessionId;
 await until(()=>evaluate(s,`document.getElementById('releaseStatus').textContent.includes('v${version}')`),'new release displayed');
 // Store a custom rule and page target, then reconnect a real installation handle.
 await evaluate(s,`(async()=>{await chrome.runtime.sendMessage({type:'sync'});const {config}=await chrome.storage.local.get('config');config.rules.push({id:'personal',name:'preserve me'});config.sites=[${JSON.stringify(origin)}];await chrome.storage.local.set({config});const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url===${JSON.stringify(origin+'/page')});await chrome.storage.session.set({updateTarget:{id:tab.id,url:tab.url}});})()`);
 // A second copy with identical files must not pass the installation proof.
 await drop(s,candidate);
 assert.equal(await evaluate(s,`XREUpdate.verifyDirectory(testDirectory,name=>fetch(chrome.runtime.getURL(name),{cache:'no-store'})).then(()=>false,()=>true)`),true);
 await drop(s,installed);
 await evaluate(s,`(async()=>{await XREUpdate.verifyDirectory(testDirectory,name=>fetch(chrome.runtime.getURL(name),{cache:'no-store'}));await XREUpdateStore.set('directory',testDirectory);})()`);
 await call('Page.reload',{},s);
 await until(()=>evaluate(s,`!document.getElementById('install').disabled`).catch(()=>false),'stored handle reconnect');
 console.log('PASS latest release UI, wrong-copy rejection, persisted real directory handle');
 // Missing release is recoverable and leaves existing files untouched.
 apiMode='missing';await evaluate(s,`document.getElementById('check').click()`,true);
 await until(()=>evaluate(s,`document.getElementById('releaseStatus').textContent.includes('새로운 배포본이 없습니다')`),'404 release');
 assert.equal(JSON.parse(fs.readFileSync(path.join(installed,'manifest.json'))).version,current);
 apiMode='release';await evaluate(s,`document.getElementById('check').click()`,true);
 await until(()=>evaluate(s,`!document.getElementById('install').disabled`),'release recheck');
 // Exercise exclusive update lock through the actual button.
 await evaluate(s,`navigator.locks.request('xre-update',()=>new Promise(r=>window.releaseTestLock=r));true`);
 await until(()=>evaluate(s,'!!window.releaseTestLock'),'lock acquired');
 await evaluate(s,`document.getElementById('install').click()`,true);
 await until(()=>evaluate(s,`document.getElementById('error').textContent.includes('다른 업데이트 탭')`),'concurrent lock refusal');
 await evaluate(s,'releaseTestLock();true');
 await until(()=>evaluate(s,`!document.getElementById('install').disabled`),'button ready after lock refusal');
 console.log('PASS missing-release recovery and concurrent-update exclusion');
 // Real UI click -> GitHub-shaped response -> ZIP hashes -> native writes -> reload.
 await evaluate(s,`document.getElementById('install').click()`,true);
 await until(()=>evaluate(s,`document.getElementById('progress').textContent.includes('다운로드') || document.getElementById('progress').textContent.includes('적용') || document.getElementById('error').textContent`).catch(()=>true),'install started');
 let lastProgress='';
 const completed=await until(async()=>{
  const targets=(await call('Target.getTargets')).targetInfos;
  const target=targets.find(t=>t.url===extension+'/update.html?complete=1');
  if(target)return target;
  try{const state=await evaluate(s,`({error:document.getElementById('error').textContent,progress:document.getElementById('progress').textContent})`);if(state.error)throw Error(state.error);if(state.progress!==lastProgress){lastProgress=state.progress;console.log('UPDATE',lastProgress);}}catch(e){if(!/context|session|target/i.test(e.message))throw e;}
  return false;
 },'automatic restart completion',45000);
 const {sessionId:after}=await call('Target.attachToTarget',{targetId:completed.targetId,flatten:true});await intercept(after);
 await until(()=>evaluate(after,`document.getElementById('progress')?.textContent.includes('적용 완료')`).catch(()=>false),'completion message');
 const result=await evaluate(after,`chrome.storage.local.get(['config','updateResult','updatePending'])`);
 assert.equal(result.updateResult.ok,true);assert.equal(result.updateResult.version,version);assert.equal(result.updateResult.pageReloaded,true);assert.equal(result.updatePending,undefined);
 assert.ok(result.config.rules.some(r=>r.id==='personal'&&r.name==='preserve me'));
 assert.equal(await evaluate(after,'XREUpdateStore.get("journal")'),undefined);
 assert.equal(await evaluate(original.sessionId,`performance.getEntriesByType('navigation')[0].type`),'reload');
 assert.equal(downloads,1);assert.equal(JSON.parse(fs.readFileSync(path.join(installed,'manifest.json'))).version,version);
 assert.match(fs.readFileSync(path.join(installed,'style.css'),'utf8'),/updated integration fixture/);
 await call('Emulation.setDeviceMetricsOverride',{width:900,height:1100,deviceScaleFactor:1,mobile:false},after);
 const shot=await call('Page.captureScreenshot',{format:'png'},after);fs.writeFileSync(path.join(os.tmpdir(),'xre-update-complete.png'),Buffer.from(shot.data,'base64'));
 console.log('PASS production updater: ZIP downloaded, files verified/replaced, extension restarted, settings retained, original page reloaded, journal cleared');
}catch(e){console.error(e);process.exitCode=1;}finally{
 clearTimeout(deadline);if(child){const exited=child.exitCode===null?new Promise(resolve=>child.once('exit',resolve)):Promise.resolve();try{await call('Browser.close');}catch{child.kill();}await exited;}
 socket?.close();
 for(const p of pending.values())clearTimeout(p.timer);
 server.closeAllConnections();server.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:300});
}})();
