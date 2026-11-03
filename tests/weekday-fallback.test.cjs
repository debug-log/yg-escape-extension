const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../engine.js');
const endpoint='https://keyescape.com/controller/run_proc.php';
const failure={status:false,msg:'예약 가능 한 날짜가 아닙니다.'};
const sample=(date,num,theme_num=66)=>({date,response:{status:true,msg:'',data:[{num,theme_num,gubun:'A',hh:'09',mm:'45',enable:'N'}]}});
const rule={id:'fallback',site:'https://keyescape.com',enabled:true,url:endpoint,match:'exact',method:'POST',requestParams:{t:'get_theme_time',zizumNum:'22',themeNum:'66'},conditions:[{path:'status',op:'equals',value:false}],action:'weekdayFallback',dateParam:'date',samples:[sample('2026-10-29',1),sample('2026-11-05',2),sample('2026-11-06',3),sample('2026-11-12',4)],allowedMessages:['예약 가능 한 날짜가 아닙니다.','예약가능시간이 아닙니다. 예약오픈시간 : 11:30']};
const body=(date,extra={})=>new URLSearchParams({t:'get_theme_time',zizumNum:'22',themeNum:'66',date,...extra}).toString();
const run=(date,original=failure,r=rule,extra={})=>E.transform(original,[r],endpoint,'POST','https://keyescape.com/reservation1.php',body(date,extra));
test('fallback selects nearest strictly earlier same weekday and only changes enable',()=>{
 const out=run('2026-11-12');assert.equal(out.matched,true);assert.deepEqual(out.value,{status:true,msg:'',data:[{num:2,theme_num:66,gubun:'A',hh:'09',mm:'45',enable:'Y'}]});assert.equal(out.sourceDate,'2026-11-05');assert.equal(rule.samples[1].response.data[0].enable,'N');
});
test('fallback uses the nearest sample in a confirmed weekday group',()=>{
 const grouped={...rule,weekdayGroups:[[1,2,3,4]],samples:[sample('2026-11-02',1),sample('2026-11-03',2)]};
 const thursday=E.transform(failure,[grouped],endpoint,'POST','https://keyescape.com/reservation1.php','t=get_theme_time&zizumNum=22&themeNum=66&date=2026-11-05');
 const friday=E.transform(failure,[grouped],endpoint,'POST','https://keyescape.com/reservation1.php','t=get_theme_time&zizumNum=22&themeNum=66&date=2026-11-06');
 assert.equal(thursday.matched,true);assert.equal(thursday.sourceDate,'2026-11-03');assert.equal(thursday.value.data[0].num,2);
 assert.equal(friday.matched,false);
});
test('fallback preserves successful responses, unknown errors and responses with data',()=>{
 for(const original of [{status:true,data:[{enable:'N'}]},{status:false,msg:'입력 오류'},{...failure,data:[]}])assert.equal(run('2026-11-12',original).matched,false);
});
test('request scope uses posted theme even when page URL has another selected theme',()=>{
 for(const extra of [{themeNum:'65'},{zizumNum:'23'},{t:'reserve'}])assert.equal(run('2026-11-12',failure,rule,extra).matched,false);
 assert.equal(E.transform(failure,[rule],endpoint,'POST','https://keyescape.com/?theme_num=99',body('2026-11-12')).matched,true);
 assert.equal(E.transform(failure,[rule],endpoint,'POST','https://keyescape.com').matched,false);
});
test('missing weekday, same-day-only, future-only, invalid and duplicate dates pass through',()=>{
 for(const date of ['2026-11-08','2026-10-29','2026-10-22','2026-02-30','bad','2026-11-12&date=2026-11-13'])assert.equal(run(date).matched,false);
 assert.equal(E.transform(failure,[rule],endpoint,'POST','',body('2026-11-12')+'&date=2026-11-13').matched,false);
});
test('fallback rejects samples from other themes and invalid dates',()=>{
 assert.throws(()=>E.validate({...rule,samples:[sample('2026-11-05',1,65)]}));
 assert.throws(()=>E.validate({...rule,samples:[sample('2026-02-30',1)]}));
 assert.throws(()=>E.validate({...rule,requestParams:{t:'get_theme_time'}}));
});
test('request body parser snapshots URLSearchParams and ignores unsupported bodies',()=>{
 const params=new URLSearchParams(body('2026-11-12'));const parsed=E.parseRequestBody(params);params.set('themeNum','65');assert.equal(parsed.themeNum,'66');
 assert.equal(E.parseRequestBody(null),null);assert.equal(E.parseRequestBody(new Blob(['ignored'])),null);
 const form=new FormData();form.set('themeNum','66');assert.equal(E.parseRequestBody(form).themeNum,'66');
});

test('bundled eoduksini uses distinct Friday, Saturday and Sunday slot IDs',()=>{
 const r=require('../keyescape-weekday-fallback-rules.json').rules.find(r=>r.id==='keyescape-weekday-fallback-31-96');
 const expectedTimes='09:25 10:20 11:15 12:05 13:00 13:55 14:45 15:40 16:35 17:25 18:20 19:15 20:05 21:00 21:55'.split(' ');
 for(const [date,gubun,first,last] of [['2026-11-06','B',3531,3545],['2026-11-07','C',3546,3560],['2026-11-08','D',3561,3575],['2026-11-09','A',3516,3530]]){
  const request=new URLSearchParams({...r.requestParams,date});
  const out=E.transform(failure,[r],endpoint,'POST','https://keyescape.com/reservation1.php',request);
  assert.equal(out.matched,true,date);
  assert.equal(out.value.data.length,15);
  assert.deepEqual(out.value.data.map(row=>`${row.hh}:${row.mm}`),expectedTimes);
  assert.deepEqual(out.value.data.map(row=>row.num),Array.from({length:15},(_,i)=>first+i));
  assert.equal(out.value.data.at(-1).num,last);
  assert.ok(out.value.data.every(row=>row.gubun===gubun&&row.theme_num===96&&row.enable==='Y'));
  assert.equal(E.transform({status:true,data:[{enable:'N'}]},[r],endpoint,'POST','',request).matched,false,'live successful response stays unchanged');
 }
});
