(function(root){
  'use strict';
  // Observed on play33.kr/reservation for 2026-11-02 through 2026-11-08.
  // These are ordinary-day schedules, not live availability or holiday overrides.
  const theme=(id,name,weekday,weekend=weekday)=>({id,name,weekday:weekday.split(' '),weekend:weekend.split(' ')});
  const branches=[
    {id:'1',name:'건대점',themes:[
      theme('47','목격자','10:30 11:45 13:00 14:15 15:30 16:45 18:00 19:20 20:40 22:00','09:45 11:00 12:15 13:30 14:45 16:00 17:15 18:30 19:45 21:05 22:25'),
      theme('46','그날','11:50 13:05 14:20 15:35 16:50 18:05 19:25 20:45 22:05','09:50 11:05 12:20 13:35 14:50 16:05 17:20 18:35 19:50 21:10 22:30'),
      theme('45','다이얼','11:40 12:55 14:10 15:25 16:40 17:55 19:15 20:35 21:55','09:40 10:55 12:10 13:25 14:40 15:55 17:10 18:25 19:40 21:00 22:20')
    ]},
    {id:'4',name:'홍대점',themes:[theme('26','피안화','10:00 10:55 11:50 12:45 13:40 14:35 15:30 16:25 17:20 18:15 19:10 20:05 21:00 21:55 22:50')]},
    {id:'5',name:'대전점',themes:[
      theme('44','우울해서 빵 샀어','10:10 11:25 12:35 13:45 14:55 16:10 17:20 18:30 19:40 20:50 22:00'),
      theme('43','자각몽(自覺夢)','09:40 10:50 12:00 13:15 14:25 15:35 16:45 18:00 19:10 20:20 21:35'),
      theme('39','I am Still Here, ELLEN','09:55 10:55 11:55 12:55 13:55 14:55 15:55 16:55 17:55 18:55 19:55 20:55 21:55'),
      theme('33','좌충우돌 꼬마마법사','10:00 11:15 12:25 13:35 14:50 16:00 17:10 18:25 19:35 20:45 21:55'),
      theme('31','강천여자고등학교','09:50 11:00 12:10 13:25 14:40 15:50 17:00 18:15 19:25 20:35 21:45','09:55 11:05 12:15 13:25 14:40 15:50 17:00 18:15 19:25 20:35 21:45')
    ]},
    {id:'7',name:'수원점',themes:[theme('40','기억 : 끝나지 않을 꿈','10:30 11:40 12:50 14:00 15:10 16:20 17:30 18:40 19:50 21:00 22:10 23:20')]}
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
  root.XRPlay33Catalog={branches,times};
  if(root.XRPlay33)return;

  const keys=['branch','theme','date','time'];
  let active=false,host=null,form=null,inputs=null,original=null,lastApplied=null,opening=null;
  const eligible=()=>window===window.top&&location.origin==='https://play33.kr'&&location.pathname==='/reservation/create';
  const read=()=>Object.fromEntries(keys.map(k=>[k,inputs[k].value]));
  function write(values){
    // Set all four before notifying listeners so they see a consistent selection.
    for(const k of keys){inputs[k].value=values[k];inputs[k].setAttribute('value',values[k]);}
    for(const k of keys)for(const type of ['input','change'])inputs[k].dispatchEvent(new Event(type,{bubbles:true}));
  }
  function stop(){
    active=false;observer.disconnect();
    opening?.dispose();opening=null;
    if(inputs&&lastApplied&&keys.every(k=>inputs[k].value===lastApplied[k]))write(original);
    host?.remove();host=form=inputs=original=lastApplied=null;
  }
  function scan(){
    if(!active||!eligible())return;
    if(host?.isConnected&&form?.isConnected&&keys.every(k=>form.contains(inputs[k])))return;
    opening?.dispose();opening=null;
    host?.remove();host=form=inputs=original=lastApplied=null;
    for(const candidate of document.forms){
      const fields=Object.fromEntries(keys.map(k=>[k,candidate.querySelector(`input[type="hidden"][name="${k}"]`)]));
      if(!keys.every(k=>fields[k]))continue;
      const action=new URL(candidate.action,location.href);
      if(action.origin!==location.origin||action.pathname!=='/reservation/create')continue;
      form=candidate;inputs=fields;break;
    }
    if(!form)return;
    original=read();
    host=document.createElement('div');host.id='xr-play33-panel';
    const shadow=host.attachShadow({mode:'open'});
    shadow.innerHTML=`<style>
      :host{display:block;position:relative;z-index:1;margin:24px auto;width:calc(100% - 32px);max-width:960px;color:#242424;text-align:left;color-scheme:light;font:14px/1.5 "Pretendard","Malgun Gothic",sans-serif}
      *{box-sizing:border-box}section{padding:16px 0;border-bottom:1px solid #ddd}
      header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px}h2{margin:0;font-size:14px;font-weight:600}button{border:0;background:transparent;padding:4px 0;color:#666;font:inherit;font-size:12px;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
      .fields{display:grid;grid-template-columns:1fr 1.5fr 1.2fr 1fr;gap:14px}label{display:flex;flex-direction:column;gap:6px;font-weight:650}
      select,input{width:100%;min-width:0;height:42px;border:1px solid #bbb;border-radius:5px;background:#fff;color:#222;padding:8px;font:inherit;font-weight:400}
      :focus-visible{outline:2px solid #555;outline-offset:2px}p{margin:8px 0 0}.status{color:#666;font-size:12px}.status:empty{display:none}.note{font-size:12px;color:#666;margin-top:10px}summary{cursor:pointer;width:fit-content}
      @media(max-width:640px){.fields{grid-template-columns:1fr 1fr}button{white-space:nowrap}}
      @media(max-width:360px){.fields{grid-template-columns:1fr}}
    </style><section aria-label="플레이33 예약 선택">
      <header><h2>예약 선택 변경</h2><button type="button" id="restore">원래 값으로</button></header>
      <div class="fields"><label>지점<select id="branch"></select></label><label>테마<select id="theme"></select></label><label>날짜<input id="date" type="date"></label><label>시간<select id="time"></select></label></div>
      <p class="status" role="status" id="status"></p>
      <details class="note"><summary>변경 시 참고사항</summary><p>시간표는 2026년 11월 2~8일 기준이며 공휴일·잔여석은 반영하지 않습니다. 실제 예약 가능 여부는 예약 단계에서 확인해주세요.</p><p>지점·테마를 변경해도 인원·요금·안내는 처음 선택한 테마 기준입니다. 선택 변경만으로 예약이 완료되지는 않습니다.</p></details>
    </section>`;
    const ui=Object.fromEntries([...keys,'status','restore'].map(k=>[k,shadow.getElementById(k)]));
    if(root.XROpeningUI){
      opening=root.XROpeningUI.create(()=>({date:ui.date.value,
        rule:root.XROpening.rule('play33',ui.branch.value)}));
      ui.date.after(opening.host);
    }
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
      ui.status.textContent='';opening?.render();
    }
    function apply(){
      opening?.render();
      if(!form.isConnected||!keys.every(k=>form.contains(inputs[k]))){ui.status.textContent='예약 폼이 바뀌었습니다. 페이지를 다시 확인해주세요.';return;}
      const selected=Object.fromEntries(keys.map(k=>[k,ui[k].value]));
      if(!times(selected.branch,selected.theme,selected.date).includes(selected.time)){
        ui.status.textContent='지점·테마·날짜·시간을 모두 선택해주세요. 기존 예약값은 유지됩니다.';return;
      }
      write(selected);lastApplied=selected;
      ui.status.textContent=selected.branch!==original.branch||selected.theme!==original.theme?'인원·요금은 처음 선택한 테마 기준입니다.':'';
    }
    ui.branch.addEventListener('change',()=>{themes(ui.theme.value);hours(ui.time.value);apply();});
    ui.theme.addEventListener('change',()=>{hours(ui.time.value);apply();});
    ui.date.addEventListener('change',()=>{hours(ui.time.value);apply();});
    ui.time.addEventListener('change',apply);
    ui.restore.addEventListener('click',()=>{write(original);lastApplied=null;reset();ui.status.textContent='처음 선택한 예약 정보로 되돌렸습니다.';});
    reset();
    form.prepend(host);
  }
  const observer=new MutationObserver(scan);
  root.XRPlay33={getState(){return {ready:true,eligible:eligible(),active:!!host?.isConnected};},configure(config){
    if(!eligible()||!config.sites.includes(location.origin)||config.play33Enabled===false){stop();return;}
    if(active)return;
    active=true;observer.observe(document,{childList:true,subtree:true});scan();
  }};
})(globalThis);
