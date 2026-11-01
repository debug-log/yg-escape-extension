const {spawn}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');
const binary=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile=fs.mkdtempSync('/tmp/xre-cdp-');
const child=spawn(binary,['--headless','--no-first-run','--disable-background-networking','--disable-component-update','--enable-unsafe-extension-debugging','--remote-debugging-pipe','--user-data-dir='+profile],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let id=0,buffer='';const pending=new Map();child.stdio[4].on('data',b=>{buffer+=b.toString();let n;while((n=buffer.indexOf('\0'))>=0){const raw=buffer.slice(0,n);buffer=buffer.slice(n+1);try{const m=JSON.parse(raw);if(pending.has(m.id)){const {resolve,reject}=pending.get(m.id);pending.delete(m.id);m.error?reject(Error(m.error.message)):resolve(m.result);}}catch{}}});
function call(method,params={},sessionId){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});child.stdio[3].write(JSON.stringify({id:key,method,params,...(sessionId?{sessionId}:{})})+'\0');});}
const deadline=setTimeout(()=>{console.error('Browser test deadline exceeded');child.kill();process.exitCode=1;},30000);
(async()=>{try{
 const {targetId}=await call('Target.createTarget',{url:'http://127.0.0.1:8765/tests/browser.html'});const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
 await new Promise(r=>setTimeout(r,500));
 const result=await call('Runtime.evaluate',{expression:`new Promise(resolve=>{const t=setInterval(()=>{if(['PASS','FAIL'].includes(document.title)){clearInterval(t);resolve({title:document.title,text:document.querySelector('#result').textContent});}},50);})`,awaitPromise:true,returnByValue:true},sessionId);
 console.log(JSON.stringify(result.result.value,null,2));if(result.result.value.title!=='PASS')process.exitCode=1;
 try{const extension=await call('Extensions.loadUnpacked',{path:path.resolve(__dirname,'..')});console.log('Extension loaded:',extension.id);
 const t=await call('Target.createTarget',{url:'chrome-extension://'+extension.id+'/options.html'});const s=await call('Target.attachToTarget',{targetId:t.targetId,flatten:true});
 await new Promise(r=>setTimeout(r,500));
 await call('Runtime.evaluate',{expression:`(async()=>{await chrome.runtime.sendMessage({type:'sync'});location.reload();})()`,awaitPromise:true},s.sessionId);
 await new Promise(r=>setTimeout(r,500));
 const ui=await call('Runtime.evaluate',{expression:`new Promise(resolve=>setTimeout(()=>resolve({title:document.title,rules:document.querySelector('#rules')?.textContent,hasChromeStorage:!!chrome.storage}),500))`,awaitPromise:true,returnByValue:true},s.sessionId);console.log('Extension UI:',JSON.stringify(ui.result.value));
 if(!ui.result.value?.hasChromeStorage||!ui.result.value.rules?.includes('enable'))process.exitCode=1;
 const checks=await call('Runtime.evaluate',{expression:`(async()=>{
  await chrome.runtime.sendMessage({type:'enabled',enabled:true});config.rules[0].name='Edited';await persist();
  const saved=(await chrome.storage.local.get('config')).config;
  if(!saved.enabled||saved.rules[0].name!=='Edited')throw Error('stale editor overwrote switch');
  config.sites=['https://a.example','https://b.example'];render();$('site').value='https://b.example';render();
  if($('site').value!=='https://b.example')throw Error('site selection lost');
  fill({...config.rules[0],site:'https://b.example',enabled:true});$('previewUrl').value='https://b.example/run_proc.php';$('preview').click();
  if(JSON.parse($('output').textContent).data[0].enable!=='Y')throw Error('preview failed');
  showMode(true);$('quickPage').value='https://keyescape.com/reservation1.php?zizum_num=31&theme_num=96';$('quickName').value='테스트 테마';$('quickAction').value='replace';$('quickReplacement').value=JSON.stringify({status:true,data:[{theme_num:96,hh:'09',mm:'25',enable:'Y'}]});quickVisibility();quickPreview();
  if(!$('quickResult').textContent.includes('시간대 1개'))throw Error('quick summary failed');
  $('quickAction').value='patch';quickVisibility();if(getComputedStyle($('quickReplacementLabel')).display!=='none')throw Error('hidden field visible');
  $('action').value='replace';visibility();if(getComputedStyle($('patchLabel')).display!=='none')throw Error('advanced hidden field visible');
  $('quickAction').value='replace';quickVisibility();quickPreview();
  const scoped={...quickRule(),id:'scoped'};config.rules.push(scoped);fill(scoped);$('site').value='https://b.example';let rejected=false;try{read();}catch{rejected=true;}if(!rejected)throw Error('hidden theme scope accepted different site');$('clearScope').click();if(read().pageParams)throw Error('scope removal failed');
  quickEditing='scoped';resetQuick();if(quickEditing!==null||$('quickName').value)throw Error('new quick setting did not reset');
  showMode(true);$('quickPage').value='https://keyescape.com/reservation1.php?zizum_num=31&theme_num=96';$('quickName').value='테스트 테마';$('quickReplacement').value=JSON.stringify({status:true,data:[{theme_num:96,hh:'09',mm:'25',enable:'Y'}]});quickPreview();
  const savedRules=config.rules;
  config.rules=[{id:'one',site:'https://keyescape.com',name:'STATION · 내 방 · 이전 같은 요일',action:'weekdayFallback',enabled:true,samples:[{date:'2026-11-05'}]},{id:'two',site:'https://other.example',name:'STATION',action:'patch',enabled:false}];
  renderQuick();if(document.querySelectorAll('.site-group').length!==2||document.querySelectorAll('.rule-group').length!==1)throw Error('sites or branch grouping mixed');
  $('ruleSearch').value='other.example';renderQuick();if(document.querySelectorAll('.site-group').length!==1||!$('quickRules').textContent.includes('STATION')||$('quickRules').textContent.includes('내 방'))throw Error('site search failed');
  $('ruleSearch').value='내 방';renderQuick();if(!document.querySelector('.site-group').open||!document.querySelector('.rule-group').open)throw Error('search did not expand matching hierarchy');
  $('collapseRules').click();if(document.querySelectorAll('.site-group[open],.rule-group[open]').length)throw Error('collapse all failed');
  config.rules=savedRules;renderQuick();
  return 'PASS settings persistence, site selection, preview, quick preset, hidden fields, scope removal, new setting, site grouping, search and collapse';
 })()`,awaitPromise:true,returnByValue:true},s.sessionId);
 console.log('UI checks:',JSON.stringify(checks));if(checks.exceptionDetails)process.exitCode=1;
 const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},s.sessionId);fs.writeFileSync('/tmp/xre-ux-preview.png',Buffer.from(screenshot.data,'base64'));

 }catch(e){console.log('Extension integration unavailable:',e.message);}
 }catch(e){console.error(e);process.exitCode=1;}finally{clearTimeout(deadline);await call('Browser.close').catch(()=>{});child.kill();}})();
