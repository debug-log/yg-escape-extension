(function(root){
 const E=typeof module!=='undefined'?require('./engine.js'):root.XREngine;
 function preset({page,name,action,replacement}){
  const u=new URL(page.trim());
  if(u.origin!=='https://keyescape.com')throw Error('키이스케이프 예약 페이지 주소를 넣어주세요. https://keyescape.com 으로 시작해야 합니다.');
  const pageParams={};for(const k of ['zizum_num','theme_num','theme_info_num']){const v=u.searchParams.get(k);if(v)pageParams[k]=v;}
  if(!pageParams.zizum_num||!pageParams.theme_num)throw Error('테마가 포함된 예약 페이지 주소가 필요합니다. 주소창의 전체 주소를 붙여넣으세요.');
  if(!name.trim())throw Error('나중에 알아볼 수 있도록 테마 이름을 입력하세요.');
  if(action==='replace'&&(!replacement||replacement.status!==true||!Array.isArray(replacement.data)||!replacement.data.length||replacement.data.some(row=>String(row.theme_num)!==pageParams.theme_num)))throw Error('이 테마의 시간대 목록이 필요합니다. status:true, 비어 있지 않은 data, 동일한 theme_num을 확인하세요.');
  return {name:name.trim()+' · '+(action==='patch'?'시간대 선택 상태 변경':'날짜 오류 응답 교체'),site:u.origin,pageParams,pageURL:u.href,template:'keyescape',themeName:name.trim(),enabled:true,match:'contains',url:'run_proc.php',method:'POST',conditions:action==='patch'?[{path:'status',op:'equals',value:true},{path:'data',op:'exists'}]:[{path:'status',op:'equals',value:false},{path:'msg',op:'equals',value:'예약 가능 한 날짜가 아닙니다.'}],action,...(action==='patch'?{patches:[{path:'data[*].enable',value:'Y'}]}:{replacement})};
 }
 function reason(r,url,method,body,page){
  if(new URL(url).origin!==r.site)return `사이트가 다릅니다. 규칙: ${r.site} / 입력: ${new URL(url).origin}`;
  if(!(r.match==='exact'?url===r.url:url.includes(r.url)))return `요청 URL이 조건 '${r.url}'과 일치하지 않습니다.`;
  if(r.method!=='ANY'&&r.method!==method)return `메서드가 다릅니다. 규칙: ${r.method} / 입력: ${method}`;
  if(r.pageParams){if(!page)return '테마 범위를 확인할 예약 페이지 주소가 없습니다.';const u=new URL(page);for(const [k,v]of Object.entries(r.pageParams))if(u.searchParams.get(k)!==v)return `다른 테마 또는 지점입니다. ${k}는 ${v}여야 합니다.`;}
  for(const c of r.conditions){const vals=E.select(body,c.path);if(c.op==='exists'?!vals.length:!vals.some(v=>E.equal(v,c.value)))return `JSON 조건 불일치: ${c.path} ${c.op==='exists'?'필드가 없습니다.':`값이 ${JSON.stringify(c.value)}여야 합니다. 현재: ${JSON.stringify(vals)}`}`;}
  return '';
 }
 function summary(body){if(body&&Array.isArray(body.data)&&body.data.length){const rows=body.data;const times=rows.filter(r=>r.hh!=null&&r.mm!=null).map(r=>`${r.hh}:${r.mm}`).sort();return `시간대 ${rows.length}개${times.length?' · '+times[0]+'–'+times.at(-1):''} · 선택 가능 ${rows.filter(r=>r.enable==='Y').length}개`;}if(body&&typeof body==='object'&&!Array.isArray(body)&&!Object.keys(body).length)return '빈 객체 {}로 교체됩니다. 필요한 데이터가 없는지 확인하세요.';return 'JSON 응답을 교체합니다.';}
 const api={preset,reason,summary};if(typeof module!=='undefined')module.exports=api;else root.XRUX=api;
})(globalThis);
