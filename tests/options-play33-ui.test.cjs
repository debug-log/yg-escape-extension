const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

const chromePath=process.env.CHROME_PATH||[
 'C:/Program Files/Google/Chrome/Application/chrome.exe',
 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(candidate=>fs.existsSync(candidate));

test('Play33 예약 진입 영역은 상태보다 예약 링크를 주 행동으로 보여준다',{skip:!chromePath},async t=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'xre-options-ui-'));
 const child=spawn(chromePath,[
  '--headless','--no-first-run','--disable-background-networking',
  '--remote-debugging-pipe','--user-data-dir='+profile,'about:blank',
 ],{stdio:['ignore','ignore','ignore','pipe','pipe'],windowsHide:true});
 t.after(async()=>{
  if(child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 });

 let sequence=0;const pending=new Map();let buffer=Buffer.alloc(0);
 child.stdio[4].on('data',chunk=>{
  buffer=Buffer.concat([buffer,chunk]);
  for(let end;(end=buffer.indexOf(0))!==-1;){
   const message=JSON.parse(buffer.subarray(0,end).toString());buffer=buffer.subarray(end+1);
   const request=pending.get(message.id);if(!request)continue;
   pending.delete(message.id);clearTimeout(request.timer);
   message.error?request.reject(Error(message.error.message)):request.resolve(message.result);
  }
 });
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
  const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},10000);
  pending.set(id,{resolve,reject,timer});
  child.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');
 });
 const {targetInfos}=await call('Target.getTargets');
 const page=targetInfos.find(target=>target.type==='page');
 const {sessionId}=await call('Target.attachToTarget',{targetId:page.targetId,flatten:true});
 await call('Page.enable',{},sessionId);
 await call('Page.navigate',{url:pathToFileURL(path.resolve('options.html')).href},sessionId);
 await new Promise(resolve=>setTimeout(resolve,300));
 const {result}=await call('Runtime.evaluate',{returnByValue:true,expression:`(()=>{
  const area=document.querySelector('#play33Defaults .play33-actions');
  const status=document.querySelector('#play33RegistrationState');
  const link=document.querySelector('#play33ReservationLink');
  if(!area||!status||!link)return null;
  area.classList.add('is-registered');status.hidden=false;
  const linkStyle=getComputedStyle(link);const statusStyle=getComputedStyle(status);
  const permissionStyle=getComputedStyle(document.querySelector('#enablePlay33'));
  return {
   linkText:link.textContent.trim(),linkBackground:linkStyle.backgroundColor,
   linkColor:linkStyle.color,linkDisplay:linkStyle.display,
   statusText:status.textContent.trim(),statusBackground:statusStyle.backgroundColor,
   permissionDisplay:permissionStyle.display,
   sameArea:area.contains(status)&&area.contains(link),
  };
 })()`},sessionId);
 const ui=result.value;
 assert.ok(ui,'상태와 예약 링크를 묶는 Play33 행동 영역이 필요합니다.');
 assert.equal(ui.linkText,'예약 페이지 열기');
 assert.equal(ui.sameArea,true);
 assert.equal(ui.linkDisplay,'flex');
 assert.equal(ui.linkBackground,'rgb(217, 33, 48)');
 assert.equal(ui.linkColor,'rgb(255, 255, 255)');
 assert.equal(ui.statusBackground,'rgba(0, 0, 0, 0)','등록 상태는 별도 버튼처럼 보이면 안 됩니다.');
 assert.equal(ui.permissionDisplay,'none','등록 후에는 권한 요청 버튼이 상태 문구와 경쟁하면 안 됩니다.');
 if(process.env.VISUAL_OUTPUT){
  const {data}=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);
  fs.writeFileSync(process.env.VISUAL_OUTPUT,Buffer.from(data,'base64'));
 }
});
