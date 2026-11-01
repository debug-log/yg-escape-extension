(async()=>{
 const results=[];const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
 const rule={id:'r',enabled:true,url:'/api',match:'contains',method:'ANY',conditions:[{path:'status',op:'equals',value:true}],action:'patch',patches:[{path:'data[*].enable',value:'Y'}]};
 async function configure(enabled,rules=[rule]){window.postMessage({source:'xr-editor-bridge',type:'config',config:{enabled,rules}},location.origin);await new Promise(r=>setTimeout(r,20));}
 function request(type='',url='/api',xhr=new XMLHttpRequest(),timeout=0){return new Promise((resolve,reject)=>{xhr.open('GET',url);xhr.responseType=type;xhr.timeout=timeout;const states=[];xhr.onreadystatechange=()=>{if(xhr.readyState===4&&xhr.status)states.push(xhr.response);};xhr.onload=()=>resolve({xhr,states,value:xhr.response});xhr.onerror=()=>reject(Error('network error'));xhr.ontimeout=()=>resolve({xhr,timeout:true});xhr.send();});}
 async function test(name,fn){try{await fn();results.push('PASS '+name);}catch(e){results.push('FAIL '+name+': '+e.message);}}
 await test('before configuration preserves response',async()=>assert(JSON.parse((await request()).value).data[0].enable==='N','changed early'));
 await configure(true);
 await test('text response and readystatechange are transformed',async()=>{const {xhr,states,value}=await request();assert(JSON.parse(value).data[0].enable==='Y','not patched');assert(xhr.responseText===value,'getters differ');assert(states[0]===value,'event saw original');});
 await test('JSON response has stable object identity and native text exception',async()=>{const {xhr,value}=await request('json');assert(value.data[0].enable==='Y','not patched');assert(value===xhr.response,'unstable object');let threw=false;try{xhr.responseText;}catch{threw=true;}assert(threw,'missing exception');});
 await test('concurrent and reused requests',async()=>{const all=await Promise.all([request(),request('json')]);assert(all.length===2,'concurrency');const reused=await request('', '/api',all[0].xhr);assert(JSON.parse(reused.value).data[0].enable==='Y','reuse');});
 await test('invalid JSON and binary pass through',async()=>{assert((await request('','/invalid')).value==='not json','invalid changed');assert((await request('arraybuffer')).value instanceof ArrayBuffer,'binary changed');});
 await test('condition failure preserved',async()=>assert(JSON.parse((await request('','/api?fail=1')).value).status===false,'failure changed'));
 await test('timeout and abort retain native behavior',async()=>{assert((await request('','/hang',new XMLHttpRequest(),10)).timeout,'no timeout');const x=new XMLHttpRequest();let aborted=false;x.open('GET','/slow');x.onabort=()=>aborted=true;x.send();x.abort();assert(aborted&&x.readyState===0,'abort broken');});
 await test('disabled switch preserves original',async()=>{await configure(false);assert(JSON.parse((await request()).value).data[0].enable==='N','disabled mutated');});
 await test('first replacement wins',async()=>{await configure(true,[{...rule,action:'replace',replacement:{ok:7}},rule]);assert((await request('json')).value.ok===7,'wrong rule');});
 await test('weekday fallback snapshots POST body for concurrent and reused XHR',async()=>{
  const fallback={id:'weekday',enabled:true,url:'/api?fail=1',match:'contains',method:'POST',conditions:[{path:'status',op:'equals',value:false}],action:'weekdayFallback',requestParams:{t:'get_theme_time',zizumNum:'22',themeNum:'66'},dateParam:'date',allowedMessages:['not available'],samples:[{date:'2026-11-05',response:{status:true,data:[{num:77,theme_num:66,enable:'N'}]}},{date:'2026-11-06',response:{status:true,data:[{num:88,theme_num:66,enable:'N'}]}}]};
  await configure(true,[fallback]);
  const post=(date,theme='66',xhr=new XMLHttpRequest())=>new Promise(resolve=>{xhr.open('POST','/api?fail=1');xhr.responseType='json';xhr.onload=()=>resolve({xhr,value:xhr.response});const body=new URLSearchParams({t:'get_theme_time',zizumNum:'22',themeNum:theme,date});xhr.send(body);body.set('themeNum','999');});
  const [thu,fri]=await Promise.all([post('2026-11-12'),post('2026-11-13')]);assert(thu.value.data[0].num===77&&fri.value.data[0].num===88,'request dates mixed');assert(thu.value.data[0].enable==='Y','not enabled');
  assert((await post('2026-11-12','65',thu.xhr)).value.status===false,'reused XHR kept old body');assert((await post('2026-11-15')).value.status===false,'missing Sunday changed');
 });
 document.getElementById('result').textContent=results.join('\n');document.title=results.some(r=>r.startsWith('FAIL'))?'FAIL':'PASS';
})();
