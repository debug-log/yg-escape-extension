// Real Chrome storage/alarms integration; remote responses are local fixtures.
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'xre-timetable-'));
let child,id=0,buffer='';const pending=new Map();
function call(method,params={},sessionId){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});child.stdio[3].write(JSON.stringify({id:key,method,params,...(sessionId?{sessionId}:{})})+'\0');});}
async function evaluate(sessionId,expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function until(check){const end=Date.now()+15000;while(Date.now()<end){const value=await check();if(value)return value;await new Promise(r=>setTimeout(r,50));}throw Error('Chrome fixture timed out');}
const deadline=setTimeout(()=>{child?.kill();process.exitCode=1;console.error('Chrome deadline exceeded');},55000);
(async()=>{try{
 for(const store of [false,true]){
  const out=path.join(temp,store?'store':'github');
  execFileSync('python',['scripts/package.py','--out-dir',out,...(store?['--store']:[])],{cwd:root});
  const zip=fs.readdirSync(out).find(n=>n.endsWith('.zip')),extensionDir=path.join(out,'extension');
  execFileSync('python',['-c','import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',path.join(out,zip),extensionDir]);
  child=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--no-first-run','--disable-background-networking','--disable-component-update','--enable-unsafe-extension-debugging','--remote-debugging-pipe','--user-data-dir='+path.join(out,'profile')],{stdio:['ignore','ignore','ignore','pipe','pipe']});
  buffer='';child.stdio[4].on('data',b=>{buffer+=b.toString();let n;while((n=buffer.indexOf('\0'))>=0){const m=JSON.parse(buffer.slice(0,n));buffer=buffer.slice(n+1);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}});
  child.on('error',error=>{for(const p of pending.values())p.reject(error);pending.clear();});
  const extension=await call('Extensions.loadUnpacked',{path:extensionDir});
  const worker=await until(async()=> (await call('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.includes(extension.id)));
  const {sessionId}=await call('Target.attachToTarget',{targetId:worker.targetId,flatten:true});
  await call('Runtime.enable',{},sessionId);
  await until(()=>evaluate(sessionId,"typeof chrome!=='undefined' && !!chrome.storage && chrome.storage.local.get('config').then(r=>r.config?.rules.length===36)"));
  const result=await evaluate(sessionId,`(async()=>{
    const rules=await loadDefaultRules();
    const feed=XRTimetableCore.exportFeed(rules,900);
    feed.themes[0].samples[0].response.data[0].num=88888;
    const service=XRTimetableSync.createSync({chrome,fetch:async()=>new Response(JSON.stringify(feed)),enqueue,bundledRules:loadDefaultRules});
    await service.ensureAlarm();await service.check({force:true});
    let saved=await chrome.storage.local.get(['config','keyescapeTimetable']);
    const actual=saved.config.rules.find(r=>r.id===rules[0].id).samples[0].response.data[0].num;
    const offline=XRTimetableSync.createSync({chrome,fetch:async()=>{throw Error('offline fixture');},enqueue,bundledRules:loadDefaultRules});
    await offline.check({force:true});
    const after=await chrome.storage.local.get(['config','keyescapeTimetable']);
    return {actual,version:after.keyescapeTimetable.dataVersion,preserved:JSON.stringify(saved.config)===JSON.stringify(after.config),alarm:await chrome.alarms.get(XRTimetableSync.ALARM)};
  })()`);
  assert.equal(result.actual,88888);assert.equal(result.version,900);assert.equal(result.preserved,true);assert.equal(result.alarm.periodInMinutes,360);
  console.log(`${store?'Store':'GitHub'} Chrome integration passed: data applied, offline preserved, alarm registered`);
  await call('Browser.close');await new Promise(resolve=>child.once('exit',resolve));child=null;
 }
}finally{clearTimeout(deadline);child?.kill();console.log('Temporary test artifacts: '+temp);}})().catch(error=>{console.error(error);process.exitCode=1;});
