const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../timetable-core.js');
const S=require('../timetable-sync.js');
const rules=require('../keyescape-weekday-fallback-rules.json').rules;
test('feed URL explicitly selects the published main branch',()=>{
 assert.equal(S.URL,'https://raw.githubusercontent.com/debug-log/yg-escape-extension/refs/heads/main/data/keyescape-timetable.json');
});
function fixture(fetcher){
 const data={config:{enabled:false,sites:[],rules:structuredClone(rules)}};
 let time=10000000, calls=0, alarm, queue=Promise.resolve();
 const chrome={storage:{local:{get:async()=>structuredClone(data),set:async obj=>Object.assign(data,structuredClone(obj))}},alarms:{get:async()=>alarm,create:async(name,options)=>{alarm={name,...options};}}};
 const feed=C.exportFeed(rules,2);feed.themes[0].samples[0].response.data[0].num=88888;
 const dependencies={chrome,fetch:async(...args)=>{calls++;return fetcher?fetcher(...args):new Response(JSON.stringify(feed));},enqueue:task=>{const job=queue.then(task);queue=job.catch(()=>{});return job;},now:()=>time,bundledRules:async()=>rules};
 const service=S.createSync(dependencies);
 return {service,data,feed,restart:()=>S.createSync(dependencies),clearAlarm:()=>{alarm=undefined;},get calls(){return calls;},get alarm(){return alarm;},advance:n=>time+=n};
}
test('download applies data and repeated checks are throttled across restart',async()=>{
 const f=fixture();await f.service.ensureAlarm();assert.equal(f.alarm.periodInMinutes,360);
 await f.service.check();assert.equal(f.data.config.rules[0].samples[0].response.data[0].num,88888);
 assert.equal(f.data.keyescapeTimetable.dataVersion,2);
 f.clearAlarm();const restarted=f.restart();await restarted.ensureAlarm();assert.equal(f.alarm.periodInMinutes,360);
 await restarted.check();assert.equal(f.calls,1);assert.equal(f.data.keyescapeTimetable.dataVersion,2);
 f.advance(3600000);await f.service.check();assert.equal(f.calls,2);
});
test('network failure and invalid payload preserve last good config',async()=>{
 for(const fetcher of [async()=>{throw Error('offline');},async()=>new Response('{}'),async()=>new Response('no',{status:500}),async()=>new Response('x'.repeat(C.MAX_BYTES+1))]){
  const f=fixture(fetcher),before=structuredClone(f.data.config);
  await f.service.check();assert.deepEqual(f.data.config,before);assert.ok(f.data.keyescapeTimetable.lastError);
 }
});
test('in-flight download does not overwrite concurrent edits or launch a duplicate request',async()=>{
 let finish;const f=fixture(()=>new Promise(resolve=>finish=resolve));
 const one=f.service.check(),two=f.service.check();
 await new Promise(resolve=>setImmediate(resolve));
 f.data.config.rules[0].samples[0].response.data[0].num=77777;
 f.data.config.enabled=true;
 finish(new Response(JSON.stringify(f.feed)));await Promise.all([one,two]);
 assert.equal(f.calls,1);assert.equal(f.data.config.enabled,true);
 assert.equal(f.data.config.rules[0].samples[0].response.data[0].num,77777);
});
test('clock rollback retries and lower versions cannot replace data',async()=>{
 const f=fixture();await f.service.check();f.advance(-1000000);await f.service.check();assert.equal(f.calls,2);
 f.feed.dataVersion=1;await f.service.check({force:true});assert.equal(f.data.keyescapeTimetable.dataVersion,2);
 assert.ok(f.data.keyescapeTimetable.lastError);
});
test('request timeout covers both headers and streaming body',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const phase of ['headers','body']){
  const f=fixture(async(_url,{signal})=>{
   if(phase==='headers')return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout'))));
   return new Response(new ReadableStream({start(controller){signal.addEventListener('abort',()=>controller.error(Error('timeout')));}}));
  });
  const before=structuredClone(f.data.config),job=f.service.check();
  await new Promise(resolve=>setImmediate(resolve));t.mock.timers.tick(15000);await job;
  assert.deepEqual(f.data.config,before);assert.ok(f.data.keyescapeTimetable.lastError);
 }
});
test('corrupt cached state and storage failures preserve config',async()=>{
 const f=fixture();await f.service.check();const before=structuredClone(f.data.config);
 f.data.keyescapeTimetable.feed.schemaVersion=999;
 await f.service.check({force:true});assert.deepEqual(f.data.config,before);assert.ok(f.data.keyescapeTimetable.lastError);
 let writes=0;
 const service=S.createSync({chrome:{storage:{local:{get:async()=>({config:before}),set:async()=>{writes++;throw Error('quota');}}}},fetch:async()=>{throw Error('should not fetch');},enqueue:task=>task(),bundledRules:async()=>rules});
 await service.check();assert.equal(writes,2);
});
