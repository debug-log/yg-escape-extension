// Real unpacked-extension test. Host permission is pre-granted only in a temporary copy.
const {spawn}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'xre-date-'));
const extensionDir=path.join(temp,'extension');fs.mkdirSync(extensionDir);
for(const file of fs.readdirSync(root))if(/\.(js|html|css|json)$/.test(file)&&(!file.startsWith('keyescape-')||file==='keyescape-weekday-fallback-rules.json'))fs.copyFileSync(path.join(root,file),path.join(extensionDir,file));
fs.cpSync(path.join(root,'icons'),path.join(extensionDir,'icons'),{recursive:true});
fs.cpSync(path.join(root,'vendor'),path.join(extensionDir,'vendor'),{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(extensionDir,'manifest.json')));
manifest.host_permissions=['https://keyescape.com/*'];
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

const fixture='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Date fixture</title><style>body{font:16px sans-serif;margin:20px}.reservationPick{max-width:500px}table{width:100%;text-align:center}td{padding:12px}#datepicker{padding:20px;border:1px solid #ddd;border-radius:10px}</style><select id="zizum"><option value="31">백산방역</option><option value="26">에버랜드</option></select><select id="theme"><option value="84" data-doing="3">A</option><option value="34" data-doing="7">B</option></select><div class="reservationPick"><div id="datepicker"><table><tr><td id="date" title="원래 날짜 안내" class="selDate disabled endDay" data-date="2026-11-05">5</td><td id="blocked" class="selDate disabled" data-date="2026-11-06">6</td><td id="past" title="original hint" style="outline: 1px solid blue; outline-offset: 1px" class="selDate disabled" data-date="2020-01-01">1</td><td id="native" class="selDate available" data-date="2026-11-09">9</td><td id="empty" class="selDate disabled">empty</td></tr></table></div></div><button class="disabled" id="button">Other</button>';
(async()=>{try{
 startChrome();
 const extension=await call('Extensions.loadUnpacked',{path:extensionDir});
 const options=await tab('chrome-extension://'+extension.id+'/options.html');
 await until(()=>evaluate(options.sessionId,'typeof config!=="undefined"&&!!config'),'options loaded');
 async function save(patch){return evaluate(options.sessionId,`(async()=>{const before=(await chrome.storage.local.get('config')).config;const after={...before,...${JSON.stringify(patch)}};const r=await chrome.runtime.sendMessage({type:'save',before,after});if(!r.ok)throw Error(r.error);config=r.config;baseline=structuredClone(config);render();return r.config;})()`);}
 const installed=await evaluate(options.sessionId,"chrome.storage.local.get('config').then(r=>r.config)");
 assert.equal(installed.rules.filter(r=>r.action==='weekdayFallback').length,34);
 assert.equal(installed.enabled,false);
 await save({enabled:false,sites:['https://keyescape.com'],rules:installed.rules});
 async function fixtureTab(url){const t=await tab('about:blank');await call('Fetch.enable',{patterns:[{urlPattern:'https://keyescape.com/*',resourceType:'Document',requestStage:'Request'}]},t.sessionId);await call('Page.navigate',{url},t.sessionId);await until(()=>evaluate(t.sessionId,"!!document.querySelector('#date')"),'fixture loaded');return {...t,url};}
 const page=await fixtureTab('https://keyescape.com/reservation1.php?zizum_num=31&theme_num=96&theme_info_num=84');
 const ev=expression=>evaluate(page.sessionId,expression);
 // The site's option value is an info ID; data-themenum is the rule ID.
 const dropdownPage=await fixtureTab('https://keyescape.com/reservation1.php');
 const dropdownEv=expression=>evaluate(dropdownPage.sessionId,expression);
 await dropdownEv(`document.querySelector('#theme').selectedOptions[0].dataset.themenum='96';
   document.querySelector('tr').insertAdjacentHTML('beforeend','<td id="saturday" class="selDate sat disabled" data-date="2026-11-07">7</td><td id="sunday" class="selDate sun disabled" data-date="2026-11-08">8</td>');
   document.querySelector('#theme').dispatchEvent(new Event('change',{bubbles:true}));`);
 await dropdownEv('new Promise(r=>setTimeout(r,100))');
 // The supplied Friday/Saturday/Sunday schedules make every weekday selectable.
 await until(()=>dropdownEv("['date','blocked','saturday','sunday'].every(id=>document.getElementById(id).classList.contains('available'))"),'all eoduksini weekday groups available');
 // Retain regression coverage for users who keep only the original weekday samples.
 await save({rules:installed.rules.map(r=>r.id==='keyescape-weekday-fallback-31-96'
   ?{...r,samples:r.samples.filter(s=>!s.source)}:r)});
 await until(()=>dropdownEv("document.querySelector('#blocked').classList.contains('disabled')"),'custom partial sample selection respected');
 async function assertDropdownWeekdays(){
   assert.equal(await dropdownEv("document.querySelector('#date').classList.contains('available')"),true,'Thursday remains selectable');
   for(const id of ['blocked','saturday','sunday']){
     assert.equal(await dropdownEv(`document.getElementById('${id}').classList.contains('disabled')&&!document.getElementById('${id}').classList.contains('available')`),true,`${id} stays disabled without URL theme parameters`);
     assert.equal(await dropdownEv(`getComputedStyle(document.getElementById('${id}')).backgroundColor`),'rgb(236, 236, 236)');
     assert.equal(await dropdownEv(`getComputedStyle(document.getElementById('${id}')).cursor`),'not-allowed');
   }
 }
 await assertDropdownWeekdays();
 await dropdownEv("history.replaceState(null,'','/reservation1.php?zizum_num=31&theme_num=34&theme_info_num=84');document.querySelector('#theme').dispatchEvent(new Event('change',{bubbles:true}))");
 await dropdownEv('new Promise(r=>setTimeout(r,100))');
 await assertDropdownWeekdays();
 await dropdownEv("document.querySelector('#theme').selectedIndex=1;document.querySelector('#theme').dispatchEvent(new Event('change',{bubbles:true}))");
 await until(()=>dropdownEv("document.querySelector('#blocked').classList.contains('available')"),'switching away clears partial restriction');
 await dropdownEv("document.querySelector('#theme').selectedIndex=0;document.querySelector('#theme').dispatchEvent(new Event('change',{bubbles:true}))");
 await until(()=>dropdownEv("document.querySelector('#blocked').classList.contains('disabled')"),'switching back restores partial restriction');
 await assertDropdownWeekdays();
 await call('Target.closeTarget',{targetId:dropdownPage.targetId});
 async function state(){return evaluate(options.sessionId,`(async()=>{const tabs=await chrome.tabs.query({});const t=tabs.find(t=>t.url===${JSON.stringify(page.url)});return chrome.tabs.sendMessage(t.id,{type:'state'},{frameId:0});})()`);}
 await until(()=>ev("document.querySelector('#date').classList.contains('available')"),'confirmed weekday opens by default');
 await until(()=>ev("document.querySelector('#blocked').classList.contains('xr-date-unlock-unconfirmed')"),'unconfirmed weekday is marked unavailable');
 assert.equal(await ev("document.querySelector('#blocked').classList.contains('disabled')"),true);
 assert.equal(await ev("getComputedStyle(document.querySelector('#blocked')).backgroundColor"),'rgb(236, 236, 236)');
 await ev("document.querySelector('#blocked').classList.remove('disabled');document.querySelector('#blocked').classList.add('available')");
 await until(()=>ev("!document.querySelector('#blocked').classList.contains('xr-date-unlock-unconfirmed')"),'native availability clears unavailable shading');
 await ev("document.querySelector('#blocked').classList.remove('available');document.querySelector('#blocked').classList.add('disabled')");
 await until(()=>ev("document.querySelector('#blocked').classList.contains('xr-date-unlock-unconfirmed')"),'native reset restores unavailable shading');
 await until(()=>ev("!!document.querySelector('#date').dataset.xrOpening"),'future opening hint rendered');

 await until(()=>ev("!!document.querySelector('#date').dataset.xrCalendarHint"),'unified calendar tooltip');
 assert.equal(await ev("document.querySelector('#date').hasAttribute('title')"),false,'native tooltip suppressed');
 assert.equal(await ev("document.querySelector('#date').dataset.xrCalendarHint"),'2026-11-03 09:30 오픈 (한국시간)\n확장 프로그램으로 선택 제한을 해제한 날짜\n원래 날짜 안내');
 assert.equal(await ev("document.querySelector('#date').getAttribute('aria-label').includes('잔여석 미확인')"),false);
 const upcoming=require('../opening.js').range(require('../opening.js').rule('keyescape','31',3)).next;
 await ev(`(async()=>{const cell=document.createElement('td');cell.className='selDate disabled';cell.dataset.date='${upcoming}';cell.id='nearest';document.querySelector('tr').append(cell);await Promise.resolve();})()`);
 await until(()=>ev("document.querySelector('#nearest .xr-opening-badge')?.textContent==='09:30 오픈'"),'nearest opening date displays time even after today opening');
 await save({openingDisabledSites:['https://keyescape.com']});
 await until(()=>ev("!document.querySelector('#date').hasAttribute('data-xr-opening-label')"),'opening tooltip disabled');
 assert.equal(await ev("document.querySelector('#date').dataset.xrCalendarHint"),'확장 프로그램으로 선택 제한을 해제한 날짜\n원래 날짜 안내','unlock tooltip works independently');
 assert.equal(await ev("document.querySelector('#date').hasAttribute('title')"),false);
 await save({openingDisabledSites:[]});
 await until(()=>ev("document.querySelector('#date').dataset.xrCalendarHint?.includes('09:30 오픈')"),'opening tooltip restored');
 // A freshly rendered calendar must be annotated in the same turn, without waiting for the timer.
 assert.equal(await ev(`(async()=>{
   const calendar=document.querySelector('#datepicker');
   const clone=new DOMParser().parseFromString(${JSON.stringify(fixture)},'text/html').querySelector('#datepicker');
   calendar.replaceWith(clone);
   await Promise.resolve();
   return !!document.querySelector('#date').dataset.xrOpeningLabel;
 })()`),true,'calendar replacement receives opening hints before the next task');

 assert.equal(await ev("document.querySelectorAll('xr-opening-card').length"),0,'large opening card must stay removed');
 assert.equal(await ev("document.querySelector('#date').hasAttribute('tabindex')"),false,'opening hints preserve native calendar focus');
 assert.equal(await ev("document.querySelector('#past').classList.contains('disabled')&&!document.querySelector('#past').classList.contains('available')"),true,'past dates stay locked');
 assert.equal(await ev("document.querySelector('#past').title"),'original hint','past dates do not receive the unlock explanation');
 await ev("document.querySelector('#date').click()");
 assert.match(await ev("document.querySelector('#date').dataset.xrOpeningLabel"),/2026-11-03 09:30/);
 await ev("document.querySelector('#theme').selectedIndex=1;document.querySelector('#theme').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#date').click()");
 await ev('new Promise(r=>setTimeout(r,100))');
 assert.equal(await ev("document.querySelector('#date').classList.contains('available')&&!document.querySelector('#date').classList.contains('xr-date-unlock-unconfirmed')"),true,'themes without partial restrictions keep the original unlock behavior');
 assert.match(await ev("document.querySelector('#date').dataset.xrOpeningLabel"),/2026-10-30 09:30/,'current theme calendar span used');
 await ev("document.querySelector('#zizum').value='26';document.querySelector('#zizum').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#date').click()");
 await ev('new Promise(r=>setTimeout(r,100))');
 assert.equal(await ev("document.querySelector('#date').classList.contains('available')"),true,'branches without partial restrictions keep the original unlock behavior');
 assert.equal(await ev("document.querySelector('#date').dataset.xrOpeningLabel"),'오픈 일정 확인 필요');
 await ev("document.querySelector('#zizum').value='31';document.querySelector('#theme').selectedIndex=0;document.querySelector('#zizum').dispatchEvent(new Event('change',{bubbles:true}))");
 await ev("document.querySelector('#date').classList.add('selected')");
 assert.equal(await ev("getComputedStyle(document.querySelector('#date')).paddingTop"),'12px','opening hints preserve calendar spacing');
 await ev("document.querySelector('#date').classList.remove('selected')");
 const keyShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},page.sessionId);
 fs.writeFileSync(path.join(os.tmpdir(),'xre-opening-keyescape.png'),Buffer.from(keyShot.data,'base64'));
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},page.sessionId);
 assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth'),true);
 await call('Emulation.clearDeviceMetricsOverride',{},page.sessionId);
 assert.equal(await ev("document.querySelector('#date').className"),'selDate endDay available');
 assert.equal(await ev("document.querySelector('#past').classList.contains('disabled')"),true);
 assert.equal(await ev("document.querySelector('#empty').classList.contains('disabled')&&document.querySelector('#button').classList.contains('disabled')"),true);
 assert.equal((await state()).enabled,false);assert.equal((await state()).dateUnlock.active,true);
 await ev(`document.querySelector('tr').insertAdjacentHTML('beforeend','<td id="next" class="selDate disabled" data-date="2026-12-01">1</td>')`);
 await until(()=>ev("document.querySelector('#next').classList.contains('available')"),'month rerender');
 await until(()=>ev("!!document.querySelector('#next').dataset.xrOpeningLabel"),'new month annotated');
 await ev("document.querySelector('#next').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
 assert.match(await ev("document.querySelector('#next').dataset.xrOpeningLabel"),/2026-11-29 09:30/);
 await ev("document.querySelector('#next').className='selDate disabled'");
 await until(()=>ev("document.querySelector('#next').classList.contains('available')"),'class reset');
 const count=(await state()).dateUnlock.count;await ev('new Promise(r=>setTimeout(r,100))');assert.equal((await state()).dateUnlock.count,count);
 await ev(`new Promise(resolve=>{const f=document.createElement('iframe');f.src='/reservation1.php?frame=1';f.onload=resolve;document.body.append(f);})`);
 assert.equal(await ev("frames[0].document.querySelector('#date').classList.contains('disabled')"),true);
 const other=await fixtureTab('https://keyescape.com/other.php');
 assert.equal(await evaluate(other.sessionId,"document.querySelector('#date').classList.contains('disabled')"),true);
 console.log('PASS default on, independent of XHR, rerender, class preservation, exclusions and no self-loop');
 await ev("document.querySelector('#theme').selectedIndex=1");
 await evaluate(options.sessionId,"document.querySelector('#keyescapeDateUnlock').click()");
 await until(async()=>(await state()).dateUnlock.active===false,'disable takes effect');
 assert.equal((await state()).dateUnlock.reloadRequired,false);
 assert.equal(await ev("document.querySelector('#date').classList.contains('disabled')"),true);
 assert.equal(await ev("document.querySelector('#date').classList.contains('available')"),false);
 assert.equal(await ev("document.querySelector('#date').style.backgroundImage"),'');
 assert.equal(await ev("document.querySelector('#native').classList.contains('available')"),true);
 assert.equal(await ev("document.querySelector('#theme').selectedIndex"),1);
 assert.equal(await ev("document.querySelector('#past').title"),'original hint');
 assert.equal(await ev("document.querySelector('#past').style.outlineOffset"),'1px');
 assert.equal(await ev("document.querySelector('#past').style.outlineStyle"),'solid');
 await ev("document.querySelector('#next').className='selDate disabled'");await ev('new Promise(r=>setTimeout(r,100))');
 assert.equal(await ev("document.querySelector('#next').classList.contains('disabled')"),true);
 // Keep the same document and selected theme when toggling dates.
 assert.equal(await ev("document.querySelector('#date').classList.contains('disabled')"),true);
 await save({keyescapeDateUnlockEnabled:true});await until(()=>ev("document.querySelector('#date').classList.contains('available')"),'unknown theme reopens when reenabled');
 assert.equal(await ev("document.querySelector('#theme').selectedIndex"),1);
 await ev("document.querySelector('#theme').selectedIndex=0;document.querySelector('#theme').dispatchEvent(new Event('change',{bubbles:true}))");
 await until(()=>ev("document.querySelector('#date').classList.contains('available')"),'confirmed theme opens after selection change');
 // Reusing a cell for a naturally available date must not disable the new date.
 await ev("document.querySelector('#next').className='selDate available';document.querySelector('#next').setAttribute('data-date','2027-01-01')");
 await until(()=>ev("document.querySelector('#next').style.backgroundImage===''") ,'reused date clears old decoration');
 await call('Target.activateTarget',{targetId:page.targetId});const popup=await tab('chrome-extension://'+extension.id+'/popup.html',true);
 await until(()=>evaluate(popup.sessionId,"document.querySelector('#dateUnlockState')?.textContent.includes('사용 중')"),'popup date status');
 assert.equal(await evaluate(popup.sessionId,"document.querySelector('#timetableToggle').checked"),false);
 await evaluate(popup.sessionId,"document.querySelector('#dateUnlockToggle').click()",true);
 await until(async()=>(await state()).dateUnlock.active===false,'popup disables dates');
 await until(()=>evaluate(popup.sessionId,"document.querySelector('#dateUnlockState').textContent==='꺼짐'&&document.querySelector('#reload').hidden"),'popup date toggle needs no reload');
 assert.equal(await ev("document.querySelector('#next').classList.contains('available')"),true);
 assert.equal(await ev("document.querySelector('#theme').selectedIndex"),0);
 await evaluate(popup.sessionId,"document.querySelector('#helperToggle').click()",true);
 await until(async()=>(await state()).opening.active===false,'master stops opening');
 assert.equal(await ev("document.querySelectorAll('xr-opening-card,.xr-opening-badge').length"),0);
 await until(()=>evaluate(popup.sessionId,"document.querySelector('#dateUnlockToggle').disabled"),'master disables individual controls');
 await until(()=>evaluate(popup.sessionId,"!document.querySelector('#helperToggle').checked&&!document.querySelector('#helperToggle').disabled"),'master save completes');
 await evaluate(popup.sessionId,"document.querySelector('#helperToggle').click()",true);
 await until(async()=>(await state()).opening.active===true,'master resumes opening');
 assert.equal((await state()).dateUnlock.active,false,'date choice remains off');
 await evaluate(options.sessionId,"showMode(false);[...document.querySelectorAll('#sites input')].find(el=>el.getAttribute('aria-label')?.includes('방해 완화')).click()",true);
 await until(async()=>(await state()).antiDebug.reloadRequired,'advanced setting disables anti-debug');
 await evaluate(options.sessionId,"showMode(false);document.querySelector('#restoreDefaults').click()",true);
 await until(()=>evaluate(options.sessionId,"chrome.storage.local.get('config').then(r=>r.config.rules.filter(x=>x.action==='weekdayFallback').length===34)"),'settings restores defaults');
 const restored=await evaluate(options.sessionId,"chrome.storage.local.get('config').then(r=>r.config)");
 assert.equal(restored.enabled,false);assert.equal(restored.keyescapeDateUnlockEnabled,false);
 await call('Emulation.setDeviceMetricsOverride',{width:380,height:720,deviceScaleFactor:1,mobile:false},popup.sessionId);
 const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},popup.sessionId);
 fs.writeFileSync(path.join(os.tmpdir(),'xre-popup-settings.png'),Buffer.from(shot.data,'base64'));
 await call('Target.closeTarget',{targetId:popup.targetId});
 await save({sites:[]});await until(async()=>(await state()).dateUnlock.active===false,'site removal');
 assert.equal(await ev("document.querySelectorAll('xr-opening-card,.xr-opening-badge,[data-xr-opening]').length"),0);
 assert.equal(await ev("document.querySelector('#date').hasAttribute('tabindex')"),false);
 assert.equal(await ev("document.querySelector('#date').title"),'원래 날짜 안내','original native tooltip restored after both features stop');
 assert.equal(await ev("document.querySelector('#date').hasAttribute('data-xr-calendar-hint')"),false);
 await ev("document.querySelector('#date').className='selDate disabled'");await ev('new Promise(r=>setTimeout(r,100))');
 assert.equal(await ev("document.querySelector('#date').classList.contains('disabled')"),true);
 const unregistered=await fixtureTab('https://keyescape.com/reservation1.php?unregistered=1');
 assert.equal(await evaluate(unregistered.sessionId,"document.querySelector('#date').classList.contains('disabled')"),true);
 await call('Target.activateTarget',{targetId:unregistered.targetId});
 const registrationPopup=await tab('chrome-extension://'+extension.id+'/popup.html',true);
 await until(()=>evaluate(registrationPopup.sessionId,"document.querySelector('#addCurrentSite')?.hidden===false"),'unregistered popup');
 await evaluate(registrationPopup.sessionId,"document.querySelector('#addCurrentSite').click()",true);
 await until(()=>evaluate(options.sessionId,"chrome.storage.local.get('config').then(r=>r.config.sites.includes('https://keyescape.com')&&r.config.keyescapeDateUnlockEnabled)"),'popup registers site with already granted permission');
 assert.equal(await evaluate(options.sessionId,"chrome.storage.local.get('config').then(r=>r.config.rules.filter(x=>x.action==='weekdayFallback').length)"),34);
 console.log('PASS install defaults, popup toggles, missing-rule restore, date toggle without reload and site registration');
 console.log('PASS toggle persistence, immediate stop, in-place restoration, popup and unregistered site');
}catch(e){console.error(e);process.exitCode=1;}finally{
 clearTimeout(deadline);if(child)await stopChrome();
 fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}})();
