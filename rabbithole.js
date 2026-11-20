(function(root){
  'use strict';
  // Observed on www.rabbitholeescape.co.kr/reservation for 2026-11-17 through 2026-11-23.
  // These are ordinary-day schedules, not live availability or holiday overrides.
  const theme=(id,name,weekday,weekend=weekday)=>({id,name,weekday:weekday.split(' '),weekend:weekend.split(' ')});
  const branches=[
    {id:'1',name:'홍대점',themes:[
      theme('5','행운만물상','11:20 12:50 14:20 15:50 17:20 18:50 20:20 21:50','09:50 11:20 12:50 14:20 15:50 17:20 18:50 20:20 21:50'),
      theme('4','두껍아 두껍아 헌집줄게 새집다오','11:35 13:05 14:35 16:05 17:35 19:05 20:35 22:05','10:05 11:35 13:05 14:35 16:05 17:35 19:05 20:35 22:05')
    ]}
  ];
  function dayOfWeek(date){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
    const d=new Date(date+'T12:00:00Z');
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===date?d.getUTCDay():null;
  }
  function times(branch,id,date){
    const t=branches.find(b=>b.id===branch)?.themes.find(t=>t.id===id),day=dayOfWeek(date);
    return t&&day!==null?[...(day===0||day===6?t.weekend:t.weekday)]:[];
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={branches,times};return;}
  root.XRRabbitholeCatalog={branches,times};
  if(root.XRRabbithole)return;

  const keys=['branch','theme','date','time'];
  let active=false,host=null,form=null,inputs=null,original=null,lastApplied=null,summary=[];
  const eligible=()=>window===window.top&&location.origin==='https://www.rabbitholeescape.co.kr'&&location.pathname==='/reservation/create';
  const read=()=>Object.fromEntries(keys.map(k=>[k,inputs[k].value]));
  function captureSummary(){
    summary=[];
    for(const row of form.querySelectorAll('tr')){
      const label=row.querySelector('th')?.textContent.trim();
      const key=label==='예약일'?'date':label==='테마명'?'theme':null;
      const node=row.querySelector('td .el-text') || row.querySelector('td');
      if(key&&node)summary.push({key,node,before:node.textContent,applied:null});
    }
  }
  function restoreSummary(){
    for(const item of summary)if(item.applied!==null&&item.node.textContent===item.applied){
      item.node.textContent=item.before;item.applied=null;
    }
  }
  function updateSummary(values){
    const theme=branches.find(b=>b.id===values.branch)?.themes.find(t=>t.id===values.theme);
    for(const item of summary){
      const changed=item.key==='date'?values.date!==original.date||values.time!==original.time:values.theme!==original.theme;
      if(!changed){
        if(item.applied!==null&&item.node.textContent===item.applied)item.node.textContent=item.before;
        item.applied=null;continue;
      }
      const label=item.key==='date'
        ?`${values.date.slice(2,4)}년 ${values.date.slice(5,7)}월 ${values.date.slice(8)}일 / ${values.time.slice(0,2)}시 ${values.time.slice(3)}분`
        :theme?.name;
      if(!label)continue;
      item.node.textContent=label;
      const badge=document.createElement('span');
      badge.dataset.xrRabbitholeChanged='';badge.textContent='변경됨';
      badge.style.cssText='display:inline-block;vertical-align:middle;margin-left:8px;padding:2px 6px;border-radius:4px;background:#fff0f1;color:#a31c2d;font:600 11px/1.5 "Malgun Gothic",sans-serif;white-space:nowrap';
      item.node.append(badge);item.applied=item.node.textContent;
    }
  }
  function write(values){
    // Set all four before notifying listeners so they see a consistent selection.
    for(const k of keys){inputs[k].value=values[k];inputs[k].setAttribute('value',values[k]);}
    updateSummary(values);
    for(const k of keys)for(const type of ['input','change'])inputs[k].dispatchEvent(new Event(type,{bubbles:true}));
  }
  function stop(){
    active=false;observer.disconnect();
    if(inputs&&lastApplied&&keys.every(k=>inputs[k].value===lastApplied[k]))write(original);
    restoreSummary();summary=[];
    host?.remove();host=form=inputs=original=lastApplied=null;
  }
  function scan(){
    if(!active||!eligible())return;
    if(host?.isConnected&&form?.isConnected&&keys.every(k=>form.contains(inputs[k])))return;
    restoreSummary();summary=[];
    host?.remove();host=form=inputs=original=lastApplied=null;
    for(const candidate of document.forms){
      const fields=Object.fromEntries(keys.map(k=>[k,candidate.querySelector(`input[type="hidden"][name="${k}"]`)]));
      if(!keys.every(k=>fields[k]))continue;
      const action=new URL(candidate.action,location.href);
      if(action.origin!==location.origin||action.pathname!=='/reservation/create')continue;
      form=candidate;inputs=fields;break;
    }
    if(!form)return;
    original=read();captureSummary();
    host=document.createElement('div');host.id='xr-rabbithole-panel';
    const shadow=host.attachShadow({mode:'open'});
    shadow.innerHTML=`<style>
      :host{display:block;position:relative;z-index:1;margin:24px auto;width:calc(100% - 32px);max-width:960px;color:#242424;text-align:left;color-scheme:light;font:14px/1.5 "Pretendard","Malgun Gothic",sans-serif}
      *{box-sizing:border-box}section{padding:16px 0;border-bottom:1px solid #ddd}
      header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px}h2{margin:0;font-size:14px;font-weight:600}button{border:0;background:transparent;padding:4px 0;color:#666;font:inherit;font-size:12px;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
      .intro{margin:0 0 14px;color:#666;font-size:12px}.fields{display:grid;grid-template-columns:1fr 1.5fr 1.2fr 1fr;gap:14px}label{display:flex;flex-direction:column;gap:6px;font-weight:650}
      select,input{width:100%;min-width:0;height:42px;border:1px solid #bbb;border-radius:5px;background:#fff;color:#222;padding:8px;font:inherit;font-weight:400}
      :focus-visible{outline:2px solid #555;outline-offset:2px}p{margin:8px 0 0}.status{color:#666;font-size:12px}.status:empty{display:none}.note{font-size:12px;color:#666;margin-top:10px}summary{cursor:pointer;width:fit-content}
      @media(max-width:640px){.fields{grid-template-columns:1fr 1fr}button{white-space:nowrap}}
      @media(max-width:360px){.fields{grid-template-columns:1fr}}
    </style><section aria-label="래빗홀 예약 선택">
      <header><h2>아래 예약 정보 변경</h2><button type="button" id="restore">원래 값으로</button></header>
      <p class="intro">선택하면 아래 예약일·테마명에 바로 반영됩니다.</p>
      <div class="fields"><label>지점<select id="branch"></select></label><label>테마<select id="theme"></select></label><label>날짜<input id="date" type="date"></label><label>시간<select id="time"></select></label></div>
      <p class="status" role="status" id="status"></p>
      <details class="note"><summary>변경 시 참고사항</summary><p>시간표는 2026년 11월 17~23일 기준이며 공휴일·잔여석은 반영하지 않습니다. 실제 예약 가능 여부는 예약 단계에서 확인해주세요.</p><p>지점·테마를 변경해도 인원·요금·안내는 처음 선택한 테마 기준입니다. 미오픈 날짜는 서버에서 거절됩니다. 선택 변경만으로 예약이 완료되지는 않습니다.</p></details>
    </section>`;
    const ui=Object.fromEntries([...keys,'status','restore'].map(k=>[k,shadow.getElementById(k)]));
    function options(select,items,preferred,keepUnknown=false){
      select.replaceChildren(...items.map(([value,label])=>new Option(label,value)));
      if(keepUnknown&&preferred&&!items.some(([v])=>v===preferred))select.add(new Option(`${preferred} (현재 값)`,preferred));
      if([...select.options].some(o=>o.value===preferred))select.value=preferred;
    }
    function themes(preferred,keepUnknown=false){
      options(ui.theme,(branches.find(b=>b.id===ui.branch.value)?.themes||[]).map(t=>[t.id,t.name]),preferred,keepUnknown);
    }
    function hours(preferred,keepUnknown=false){
      options(ui.time,times(ui.branch.value,ui.theme.value,ui.date.value).map(t=>[t,t]),preferred,keepUnknown);
    }
    function reset(){
      options(ui.branch,branches.map(b=>[b.id,b.name]),original.branch,true);
      themes(original.theme,true);ui.date.value=original.date;hours(original.time,true);
      ui.status.textContent='';root.XROpeningUI?.refresh();
    }
    function apply(){
      root.XROpeningUI?.refresh();
      if(!form.isConnected||!keys.every(k=>form.contains(inputs[k]))){ui.status.textContent='예약 폼이 바뀌었습니다. 페이지를 다시 확인해주세요.';return;}
      const selected=Object.fromEntries(keys.map(k=>[k,ui[k].value]));
      if(!times(selected.branch,selected.theme,selected.date).includes(selected.time)){
        ui.status.textContent='지점·테마·날짜·시간을 모두 선택해주세요. 기존 예약값은 유지됩니다.';return;
      }
      write(selected);lastApplied=selected;
      ui.status.textContent=selected.branch!==original.branch||selected.theme!==original.theme?'아래 예약 정보에 반영했습니다. 인원·요금은 처음 선택한 테마 기준입니다.':'아래 예약 정보에 반영했습니다.';
    }
    ui.branch.addEventListener('change',()=>{themes(ui.theme.value);hours(ui.time.value);apply();});
    ui.theme.addEventListener('change',()=>{hours(ui.time.value);apply();});
    ui.date.addEventListener('change',()=>{hours(ui.time.value);apply();});
    ui.time.addEventListener('change',apply);
    ui.restore.addEventListener('click',()=>{write(original);lastApplied=null;reset();ui.status.textContent='처음 선택한 예약 정보로 되돌렸습니다.';});
    reset();
    form.prepend(host);
    root.XROpeningUI?.refresh();
  }
  const observer=new MutationObserver(scan);
  root.XRRabbithole={getState(){return {ready:true,eligible:eligible(),active:!!host?.isConnected};},configure(config){
    const helper=XRSettings.helperState(config,location.origin);
    if(!eligible()||!helper.registered||!helper.enabled||!helper.rabbithole){stop();return;}
    if(active)return;
    active=true;observer.observe(document,{childList:true,subtree:true});scan();
  }};
})(globalThis);
