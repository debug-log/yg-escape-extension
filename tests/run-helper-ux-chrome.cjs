// Full helper UI in an isolated Chrome profile; host grants belong only to this copy.
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'xre-helper-ux-'));
const extensionDir=path.join(temp,'extension');fs.mkdirSync(extensionDir);
for(const file of fs.readdirSync(root))if(/\.(js|html|css|json)$/.test(file)&&(!file.startsWith('keyescape-')||file==='keyescape-weekday-fallback-rules.json'))fs.copyFileSync(path.join(root,file),path.join(extensionDir,file));
for(const dir of ['icons','vendor'])fs.cpSync(path.join(root,dir),path.join(extensionDir,dir),{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(extensionDir,'manifest.json')));
manifest.host_permissions=['https://keyescape.com/*','https://play33.kr/*'];
fs.writeFileSync(path.join(extensionDir,'manifest.json'),JSON.stringify(manifest));
const binary=process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':process.platform==='linux'?'/usr/bin/google-chrome':'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const child=spawn(binary,['--headless','--no-first-run','--disable-background-networking','--disable-component-update','--enable-unsafe-extension-debugging','--remote-debugging-pipe','--user-data-dir='+path.join(temp,'profile')],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let id=0,buffer='';const pending=new Map();
child.stdio[4].on('data',data=>{buffer+=data.toString();let n;while((n=buffer.indexOf('\0'))>=0){const m=JSON.parse(buffer.slice(0,n));buffer=buffer.slice(n+1);if(m.method==='Fetch.requestPaused'){call('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html'}],body:Buffer.from('<!doctype html><title>Fixture</title><div id=fixture>예약 페이지</div>').toString('base64')},m.sessionId).catch(()=>{});continue;}const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}});
function call(method,params={},sessionId){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});child.stdio[3].write(JSON.stringify({id:key,method,params,...(sessionId?{sessionId}:{})})+'\0');});}
async function evaluate(sessionId,expression,userGesture=false){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function until(check,label){const end=Date.now()+10000;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,40));}throw Error('Timed out: '+label);}
async function tab(url,background=false){const {targetId}=await call('Target.createTarget',{url,background});const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});await until(()=>evaluate(sessionId,`document.readyState==='complete'&&location.href===${JSON.stringify(url)}`),'document');return {sessionId,targetId};}
async function screenshot(sessionId,name,width=1060){await call('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false},sessionId);const result=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},sessionId);fs.writeFileSync(path.join(os.tmpdir(),name),Buffer.from(result.data,'base64'));}
const deadline=setTimeout(()=>{console.error('Helper UI deadline exceeded');child.kill();process.exit(1);},60000);
(async()=>{try{
 const extension=await call('Extensions.loadUnpacked',{path:extensionDir});
 const options=await tab('chrome-extension://'+extension.id+'/options.html');
 const ev=code=>evaluate(options.sessionId,code),click=id=>evaluate(options.sessionId,`document.getElementById('${id}').click()`,true);
 const saved=()=>ev("chrome.storage.local.get('config').then(r=>r.config)");
 await until(()=>ev('typeof baseline!=="undefined"&&!!baseline'),'stable initial configuration');
 assert.equal((await saved()).rules.filter(r=>r.action==='weekdayFallback').length,34,'initialization waits for default rules');
 assert.equal((await saved()).keyescapeTimetableEnabled,false);
 assert.equal(await ev("document.querySelector('#advanced').hidden"),true);
 assert.equal(await ev("document.querySelector('#quickForm').closest('#advanced')!==null"),true);
 assert.equal(await ev("[...document.querySelectorAll('[id]')].map(x=>x.id).length===new Set([...document.querySelectorAll('[id]')].map(x=>x.id)).size"),true,'unique control labels');
 await click('enableKeyescape');
 await until(async()=>{const c=await saved();return c.sites.includes('https://keyescape.com')&&c.keyescapeTimetableEnabled;},'KeyEscape start');
 await until(()=>ev('!helperBusy'),'start complete');
 assert.equal((await saved()).enabled,false,'starting a helper never enables custom responses');
 await click('keyescapeDateUnlock');await until(()=>ev('!helperBusy'),'date saved');assert.equal((await saved()).keyescapeDateUnlockEnabled,false);
 await click('keyescapeHelper');await until(()=>ev('!helperBusy'),'master off');
 assert.equal(await ev("document.querySelector('#keyescapeDateUnlock').checked"),false);
 assert.equal(await ev("document.querySelector('#keyescapeOpening').checked&&document.querySelector('#keyescapeOpening').disabled"),true);
 await click('keyescapeHelper');await until(()=>ev('!helperBusy'),'master restored');
 assert.equal((await saved()).keyescapeDateUnlockEnabled,false);
 assert.equal(await ev("document.querySelector('#keyescapeOpening').checked&&!document.querySelector('#keyescapeOpening').disabled"),true);
 await click('enablePlay33');await until(()=>ev('!helperBusy'),'Play33 started');assert.equal((await saved()).sites.length,2);
 await click('play33Toggle');await until(()=>ev('!helperBusy'),'panel off');assert.equal((await saved()).play33Enabled,false);
 assert.equal((await saved()).keyescapeTimetableEnabled,true);
 await click('advancedTab');await click('globalEnabled');
 await until(()=>ev("!document.querySelector('#globalEnabled').disabled"),'custom switch saved');
 assert.equal((await saved()).enabled,true);assert.equal((await saved()).keyescapeTimetableEnabled,true);
 await click('newResponseRule');
 assert.equal(await ev("document.querySelector('#editorTitle').getBoundingClientRect().top>=0&&document.querySelector('#editorTitle').getBoundingClientRect().top<innerHeight"),true,'creating a rule reveals the editor below the long rule list');
 await ev("fill(config.rules.find(r=>r.id==='example'));document.querySelector('#name').value='작성 중인 규칙';");
 await evaluate(options.sessionId,"chrome.runtime.sendMessage({type:'siteSetting',site:'https://play33.kr',setting:'opening',enabled:false})");
 await until(()=>ev("!document.querySelector('#play33Opening').checked"),'external change reflected');
 assert.equal(await ev("document.querySelector('#name').value"),'작성 중인 규칙','external settings do not erase editor draft');
 await screenshot(options.sessionId,'xre-helper-advanced-desktop.png');
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:850,deviceScaleFactor:1,mobile:false},options.sessionId);
 assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth'),true,'advanced layout fits narrow viewport');
 await click('simpleTab');await ev("document.querySelector('#message').textContent='';document.querySelector('#keyescapeHelper').focus();");
 assert.equal(await ev("getComputedStyle(document.querySelector('#keyescapeHelper')).outlineStyle"),'solid','keyboard focus remains visible');
 await screenshot(options.sessionId,'xre-helper-settings-mobile.png',390);
 assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth'),true,'helper layout fits narrow viewport');
 await screenshot(options.sessionId,'xre-helper-settings-desktop.png');
 const page=await tab('about:blank');
 await call('Fetch.enable',{patterns:[{urlPattern:'https://keyescape.com/*',resourceType:'Document',requestStage:'Request'}]},page.sessionId);
 await call('Page.navigate',{url:'https://keyescape.com/reservation1.php'},page.sessionId);
 await until(()=>evaluate(page.sessionId,"!!document.querySelector('#fixture')"),'fixture page');
 await call('Target.activateTarget',{targetId:page.targetId});
 const popup=await tab('chrome-extension://'+extension.id+'/popup.html',true);
 await until(()=>evaluate(popup.sessionId,"document.querySelector('#helperToggle')?.disabled===false"),'popup initialized');
 await screenshot(popup.sessionId,'xre-helper-popup.png',352);
 const update=await tab('chrome-extension://'+extension.id+'/update.html?settings=1');
 await until(()=>evaluate(update.sessionId,"document.querySelector('#folderSettings')!==null"),'update screen');
 await screenshot(update.sessionId,'xre-helper-update-desktop.png',900);
 console.log('PASS initial migration, site starts, master/feature selection persistence, independent user rules, cross-tab updates, editor draft preservation, unique labels, keyboard focus and desktop/mobile layouts');
 console.log('Screenshots: '+path.join(os.tmpdir(),'xre-helper-*.png'));
}catch(error){console.error(error);process.exitCode=1;}finally{
 clearTimeout(deadline);const exited=new Promise(resolve=>child.once('exit',resolve));await call('Browser.close').catch(()=>child.kill());await exited;
 fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}})();
