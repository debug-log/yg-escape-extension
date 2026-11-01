(function(root){
  'use strict';
  const own=(o,k)=>o!==null && typeof o==='object' && Object.hasOwn(o,k);
  function tokens(path){
    if(typeof path!=='string'||!/^[$A-Z_a-z][$\w]*(?:(?:\.[$A-Z_a-z][$\w]*)|(?:\[(?:\d+|\*)\]))*$/.test(path)) throw Error('잘못된 JSON 경로: '+path);
    const keys=path.match(/[$A-Z_a-z][$\w]*|\d+|\*/g);
    if(keys.some(k=>['__proto__','constructor','prototype'].includes(k)))throw Error('허용되지 않는 경로');
    return keys;
  }
  function refs(value,path){
    let nodes=[{value}];
    for(const key of tokens(path)) nodes=nodes.flatMap(n=>key==='*'?(Array.isArray(n.value)?n.value.map((v,k)=>({parent:n.value,key:k,value:v})):[]):own(n.value,key)?[{parent:n.value,key,value:n.value[key]}]:[]);
    return nodes;
  }
  const select=(v,p)=>refs(v,p).map(n=>n.value);
  function equal(a,b){if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>own(b,k)&&equal(a[k],b[k]));}
  function dateValue(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
    const date=new Date(value+'T00:00:00Z');
    return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?date:null;
  }
  function parseRequestBody(body){
    if(body&&Object.getPrototypeOf(body)===null)return body;
    let entries;
    if(typeof body==='string')entries=new URLSearchParams(body);
    else if(body instanceof URLSearchParams||(typeof FormData!=='undefined'&&body instanceof FormData))entries=body;
    else return null;
    const result=Object.create(null);
    for(const [key,value] of entries){if(typeof value!=='string'||own(result,key))return null;result[key]=value;}
    return result;
  }
  function validate(r){
    if(!r||typeof r.url!=='string'||!r.url.trim()||!['exact','contains'].includes(r.match)||!['ANY','GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(r.method))throw Error('URL 조건과 메서드를 확인하세요.');
    if(!Array.isArray(r.conditions))throw Error('conditions는 배열이어야 합니다.');
    for(const c of r.conditions){tokens(c.path);if(!['equals','exists'].includes(c.op))throw Error('조건 op는 equals 또는 exists입니다.');if(c.op==='equals'&&!own(c,'value'))throw Error('equals에는 value가 필요합니다.');}
    if(r.action==='patch'){if(!Array.isArray(r.patches)||!r.patches.length)throw Error('수정 항목이 필요합니다.');for(const p of r.patches){tokens(p.path);if(!own(p,'value'))throw Error('수정 value가 필요합니다.');}}
    else if(r.action==='replace'){if(!own(r,'replacement'))throw Error('교체할 JSON이 필요합니다.');}
    else if(r.action==='weekdayFallback'){
      if(r.requestParams?.t!=='get_theme_time'||!/^\d+$/.test(r.requestParams?.zizumNum)||!/^\d+$/.test(r.requestParams?.themeNum)||!r.dateParam)throw Error('요일 대체에는 시간표 요청의 지점·테마·날짜 조건이 필요합니다.');
      if(!Array.isArray(r.allowedMessages)||!r.allowedMessages.length||r.allowedMessages.some(x=>typeof x!=='string'||!x))throw Error('대체할 오류 문구가 필요합니다.');
      if(!Array.isArray(r.samples)||!r.samples.length)throw Error('확인된 시간표가 필요합니다.');
      const dates=new Set();
      for(const s of r.samples){if(!dateValue(s.date)||dates.has(s.date)||s.response?.status!==true||!Array.isArray(s.response.data)||!s.response.data.length||s.response.data.some(row=>!row||String(row.theme_num)!==r.requestParams.themeNum||!own(row,'enable')))throw Error('시간표 날짜와 테마를 확인하세요.');dates.add(s.date);}
    }else throw Error('잘못된 작업');
    if(r.requestParams&&(!r.requestParams||typeof r.requestParams!=='object'||Array.isArray(r.requestParams)||Object.values(r.requestParams).some(v=>typeof v!=='string')))throw Error('요청 조건은 문자열 값의 객체여야 합니다.');
    return r;
  }
  function transform(value,rules,url,method,pageURL,requestBody){
    const params=parseRequestBody(requestBody);
    for(const r of rules){
      if(!r.enabled)continue;
      validate(r);
      if(r.pageParams){let page;try{page=new URL(pageURL);}catch{continue;}if(Object.entries(r.pageParams).some(([k,v])=>page.searchParams.get(k)!==v))continue;}
      if(!(r.match==='exact'?url===r.url:url.includes(r.url))||(r.method!=='ANY'&&r.method!==method))continue;
      if(r.requestParams&&Object.keys(r.requestParams).length&&(!params||Object.entries(r.requestParams).some(([k,v])=>params[k]!==v)))continue;
      if(!r.conditions.every(c=>{const vals=select(value,c.path);return c.op==='exists'?vals.length>0:vals.some(v=>equal(v,c.value));}))continue;
      if(r.action==='weekdayFallback'){
        if(value?.status!==false||own(value,'data')||!r.allowedMessages.includes(value.msg))continue;
        const target=dateValue(params?.[r.dateParam]);if(!target)continue;
        const source=r.samples.filter(s=>s.date<params[r.dateParam]&&dateValue(s.date).getUTCDay()===target.getUTCDay()).sort((a,b)=>b.date.localeCompare(a.date))[0];
        if(!source)continue;
        const result=JSON.parse(JSON.stringify(source.response));
        for(const row of result.data)row.enable='Y';
        return {matched:true,value:result,ruleId:r.id,sourceDate:source.date};
      }
      let result=JSON.parse(JSON.stringify(r.action==='replace'?r.replacement:value));
      if(r.action==='patch')for(const p of r.patches)for(const ref of refs(result,p.path))ref.parent[ref.key]=JSON.parse(JSON.stringify(p.value));
      return {matched:true,value:result,ruleId:r.id};
    }
    return {matched:false,value};
  }
  const api={tokens,select,equal,validate,transform,parseRequestBody};
  if(typeof module!=='undefined')module.exports=api;else root.XREngine=api;
})(globalThis);
