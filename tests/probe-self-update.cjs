// Throwaway feasibility probe. Only writes to a temporary extension/profile.
// Directory selection is automated via CDP drag-and-drop, not a mocked handle.
const {spawn,execFileSync}=require('node:child_process');
const http=require('node:http');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'xre-update-probe-'));
const ext=path.join(temp,'extension');
fs.mkdirSync(ext);
// Pre-grant write access only in this disposable automation profile.
// Native directory-picker / permission prompts still need a separate UI check.
fs.mkdirSync(path.join(temp,'profile','Default'),{recursive:true});
fs.writeFileSync(path.join(temp,'profile','Default','Preferences'),JSON.stringify({profile:{default_content_setting_values:{file_system_write_guard:1}}}));
const manifest={manifest_version:3,name:'Self-update feasibility probe',version:'0.0.1',permissions:['storage'],host_permissions:['http://127.0.0.1/*'],background:{service_worker:'worker.js'}};
fs.writeFileSync(path.join(ext,'manifest.json'),JSON.stringify(manifest));
fs.writeFileSync(path.join(ext,'worker.js'),`chrome.runtime.onInstalled.addListener(async()=>{await chrome.storage.local.set({loadedVersion:chrome.runtime.getManifest().version});const {targetTab}=await chrome.storage.local.get('targetTab');if(targetTab!==undefined){await chrome.storage.local.remove('targetTab');await chrome.tabs.reload(targetTab);}});`);
fs.writeFileSync(path.join(ext,'probe.html'),'<!doctype html><title>Self-update probe</title><body style="min-height:600px"><h1>Temporary self-update test</h1><script src="probe.js"></script></body>');
fs.writeFileSync(path.join(ext,'probe.js'),`
document.addEventListener('dragover',e=>e.preventDefault());
document.addEventListener('drop',async e=>{
 e.preventDefault();
 try{window.directory=await e.dataTransfer.items[0].getAsFileSystemHandle();window.dropResult={kind:directory.kind,name:directory.name};}
 catch(e){window.dropResult={error:e.name+': '+e.message};}
});
`);
const release=path.join(temp,'release');fs.mkdirSync(release);
fs.writeFileSync(path.join(release,'manifest.json'),JSON.stringify({...manifest,version:'0.0.2'}));
fs.writeFileSync(path.join(release,'release-marker.txt'),'downloaded-v0.0.2');
// Stored ZIP fixture only; this deliberately is not a production ZIP implementation.
execFileSync('zip',['-0','-q',path.join(temp,'update.zip'),'release-marker.txt','manifest.json'],{cwd:release});
let pageLoads=0,zipDownloads=0;
const server=http.createServer((req,res)=>{
 if(req.url==='/latest'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({tag_name:'v0.0.2',assets:[{name:'update.zip',browser_download_url:`http://127.0.0.1:${server.address().port}/update.zip`}]}));}
 else if(req.url==='/update.zip'){zipDownloads++;res.setHeader('Content-Type','application/zip');res.end(fs.readFileSync(path.join(temp,'update.zip')));}
 else {pageLoads++;res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Update target</title><h1>Page reload probe</h1>');}
});
let sequence=0,buffer='';
const pending=new Map();
const chrome=spawn(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
 '--headless','--no-first-run','--disable-background-networking','--enable-unsafe-extension-debugging','--remote-debugging-pipe','--user-data-dir='+path.join(temp,'profile')
],{stdio:['ignore','ignore','ignore','pipe','pipe']});
chrome.stdio[4].on('data',b=>{buffer+=b;let n;while((n=buffer.indexOf('\0'))!==-1){const m=JSON.parse(buffer.slice(0,n));buffer=buffer.slice(n+1);const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}});
function call(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},12000);pending.set(id,{resolve,reject,timer});chrome.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');});}
async function evaluate(sessionId,expression,userGesture=false){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function until(check,label){for(let i=0;i<100;i++){const result=await check();if(result)return result;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+label);}
async function tab(url){const {targetId}=await call('Target.createTarget',{url});const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});await until(()=>evaluate(sessionId,`document.readyState === "complete" && location.href !== 'about:blank' ${url.startsWith('chrome-extension:')?'&& !!chrome.storage?.local':''}`).catch(()=>false),'tab ready');return sessionId;}
const deadline=setTimeout(()=>{chrome.kill();process.exitCode=1;},55000);
(async()=>{try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const management=await tab('chrome://extensions');
 await evaluate(management,`new Promise(resolve=>chrome.developerPrivate.updateProfileConfiguration({inDeveloperMode:true},resolve))`);
 const {id}=await call('Extensions.loadUnpacked',{path:ext});
 const origin='chrome-extension://'+id;
 const session=await tab(origin+'/probe.html');
 const target=await tab(base+'/target');
 await evaluate(session,`(async()=>{const tabs=await chrome.tabs.query({});const t=tabs.find(t=>t.url===${JSON.stringify(base+'/target')});await chrome.storage.local.set({targetTab:t.id});})()`);
 console.log('API',await evaluate(session,'({picker:typeof showDirectoryPicker,handle:typeof FileSystemDirectoryHandle,version:chrome.runtime.getManifest().version})'));
 await evaluate(session,`chrome.storage.local.set({sentinel:{rule:'keep-me'}})`);
 for(const type of ['dragEnter','dragOver','drop'])await call('Input.dispatchDragEvent',{type,x:100,y:100,data:{items:[],files:[ext],dragOperationsMask:1}},session);
 console.log('DIRECTORY',await until(()=>evaluate(session,'window.dropResult'),'directory drop'));
 console.log('READ',await evaluate(session,`(async()=>JSON.parse(await(await(await directory.getFileHandle('manifest.json')).getFile()).text()))()`));
 console.log('PERMISSION',await evaluate(session,`directory.queryPermission({mode:'readwrite'})`));
 console.log('REQUEST',await evaluate(session,`directory.requestPermission({mode:'readwrite'})`,true));
 console.log('DOWNLOAD AND WRITE',await evaluate(session,`(async()=>{
 const release=await(await fetch(${JSON.stringify(base+'/latest')})).json();
 if(release.tag_name!=='v0.0.2')throw Error('Unexpected version');
 const bytes=new Uint8Array(await(await fetch(release.assets[0].browser_download_url)).arrayBuffer());
 const view=new DataView(bytes.buffer);let offset=0;const written=[];
 while(view.getUint32(offset,true)===0x04034b50){
  if(view.getUint16(offset+8,true)!==0)throw Error('Probe only supports stored ZIP fixtures');
  const size=view.getUint32(offset+18,true),n=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true);
  const name=new TextDecoder().decode(bytes.slice(offset+30,offset+30+n));
  if(!['manifest.json','release-marker.txt'].includes(name))throw Error('Unexpected fixture file');
  const start=offset+30+n+extra;const file=await directory.getFileHandle(name,{create:true});
  const stream=await file.createWritable();await stream.write(bytes.slice(start,start+size));await stream.close();
  written.push(name);offset=start+size;
 }
 return {version:release.tag_name,written};
})()`,true));
 assert.equal(zipDownloads,1);
 assert.equal(fs.readFileSync(path.join(ext,'release-marker.txt'),'utf8'),'downloaded-v0.0.2');
 assert.equal(JSON.parse(fs.readFileSync(path.join(ext,'manifest.json'))).version,'0.0.2');
 console.log('BEFORE RELOAD',await evaluate(session,`(async()=>({disk:await(await fetch('manifest.json',{cache:'no-store'})).json(),runtime:chrome.runtime.getManifest()}))()`));
 await evaluate(session,`chrome.runtime.reload();true`).catch(e=>console.log('reload context:',e.message));
 await new Promise(r=>setTimeout(r,1000));
 console.log('EXTENSION STATUS',await evaluate(management,`new Promise(resolve=>chrome.developerPrivate.getExtensionsInfo({includeDisabled:true},list=>resolve(list.map(({name,state,version,disableReasons})=>({name,state,version,disableReasons})))))`));
 const after=await tab(origin+'/probe.html');
 const saved=await evaluate(after,'chrome.storage.local.get(null)');
 console.log('AFTER',await evaluate(after,'({url:location.href,version:chrome.runtime.getManifest().version})'),saved);
 assert.equal(saved.sentinel.rule,'keep-me');
 assert.equal(saved.loadedVersion,'0.0.2');
 await until(()=>evaluate(target,'performance.getEntriesByType("navigation")[0]?.type === "reload"'),'target page automatically reloaded');
 assert.ok(pageLoads>=2);
 console.log('PASS ZIP download/unpack, real directory write, self reload, version change, storage preservation, target page reload');
}catch(e){console.error('PROBE FAILED:',e.message);process.exitCode=1;}finally{
 clearTimeout(deadline);
 try{await call('Browser.close');}catch{chrome.kill();}
 for(const p of pending.values())clearTimeout(p.timer);
 server.closeAllConnections();server.close();
 fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}})();
