// Opening hints are independent of local date unlocking and response editing.
(function(root){
  'use strict';
  if(root.XROpeningUI)return;
  const O=root.XROpening,widgets=new Set(),cells=new Map();
  let active=false,timer=null,keyCard=null,listCard=null,style=null,selected='',identity='';
  const css=`
    :host{display:block;clear:both;width:100%;min-width:0;margin:14px 0;color:#25352f;text-align:left;font:14px/1.55 "Pretendard","Malgun Gothic",sans-serif;color-scheme:light}
    *{box-sizing:border-box}.card{padding:18px 20px;border:1px solid #cddfd7;border-radius:10px;background:#f3f8f5}
    .card[data-phase=upcoming]{background:#fff8ed;border-color:#ead5b4}.card[data-phase=unknown],.card[data-phase=past]{background:#f5f5f5;border-color:#ddd}
    .eyebrow{font-size:11px;font-weight:700;letter-spacing:.06em;color:#64766d}h3{margin:5px 0;font-size:18px;line-height:1.4;font-weight:750;color:inherit}
    p{margin:4px 0}.count{font-size:22px;font-weight:750;font-variant-numeric:tabular-nums;letter-spacing:-.5px}.muted{color:#5b685f;font-size:12px}
    .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}button,a{font:inherit;font-size:12px;color:#324e40}button{padding:7px 10px;background:#fff;border:1px solid #bacac1;border-radius:5px;cursor:pointer}
    button:disabled{opacity:.5;cursor:default}a{align-self:center}button:focus-visible,a:focus-visible{outline:3px solid #a85513;outline-offset:2px}
    details{margin-top:9px;font-size:11px;color:#68746d}summary{cursor:pointer}.legend{margin-top:10px;font-size:11px;color:#59665f}
    @media(max-width:480px){.card{padding:14px}h3{font-size:16px}.count{font-size:20px}}
  `;
  function text(el,value){if(el.textContent!==value)el.textContent=value;}
  function create(getSelection,onDate){
    const host=document.createElement('xr-opening-card'),shadow=host.attachShadow({mode:'open'});
    shadow.innerHTML=`<style>${css}</style><section class="card" aria-label="예약 오픈 안내">
      <div class="eyebrow">예약 오픈 안내 · 한국시간</div><h3 id="headline"></h3>
      <p id="when"></p><p class="count" id="count"></p><p class="muted" id="range"></p><p class="muted" id="next"></p>
      <div class="actions"><button type="button" id="latest">최근 오픈 날짜 보기</button><button type="button" id="upcoming">다음 오픈 날짜 보기</button><a id="source" target="_blank" rel="noopener noreferrer">공식 예약 안내 ↗</a></div>
      <p class="muted">오픈 시각 기준 안내입니다. 잔여석·매진 여부는 예약 화면에서 확인하세요.</p>
      <details><summary>안내 기준</summary>2026.11.03 확인한 공식 예약 규칙 · 현재 기기 시각으로 계산하며 일정은 변경될 수 있습니다.</details>
    </section>`;
    const ui=Object.fromEntries(['headline','when','count','range','next','latest','upcoming','source'].map(id=>[id,shadow.getElementById(id)]));
    let previous=null;
    function render(){
      const s=getSelection(),now=Date.now(),r=s.rule,state=O.state(r,s.date,now),dates=O.range(r,now);
      const signature=`${s.site}/${s.branch}/${s.date}/${r?.time}/${r?.leadDays}`;
      const reached=previous?.signature===signature&&(previous.phase==='upcoming'||previous.reached)&&state.phase==='open';
      previous={signature,phase:state.phase,reached};
      shadow.querySelector('section').dataset.phase=state.phase;
      text(ui.headline,!s.date?'방문 날짜를 선택하세요':state.phase==='unknown'?'오픈 일정 확인 필요':state.phase==='past'?'지난 방문 날짜입니다':state.phase==='open'?'오픈 시각이 지났어요':`${s.date.slice(5).replace('-','/')} 방문분 · ${O.kstDate(state.opensAt)===O.kstDate(now)?'오늘':'예약'} ${r.time} 오픈`);
      text(ui.when,state.opensAt===null?'':`${s.date} 방문분 → ${O.stamp(state.opensAt)} 오픈`);
      text(ui.count,state.phase==='upcoming'?O.remaining(state.opensAt-now):reached?'오픈 예정 시각이 됐어요 · 예약 현황을 확인하세요':'');
      ui.count.hidden=!ui.count.textContent;
      text(ui.range,dates?`오픈 시각이 지난 범위: ${dates.latest<dates.today?'없음':`${dates.today} ~ ${dates.latest}`}`:'이 지점의 오픈 규칙은 공식 안내를 확인해주세요.');
      text(ui.next,dates?`다음: ${dates.next} 방문분 · ${O.stamp(O.state(r,dates.next,now).opensAt)} 오픈`:'');
      ui.latest.disabled=!onDate||!dates||dates.latest<dates.today;
      ui.upcoming.disabled=!onDate||!dates;
      ui.source.href=s.site==='keyescape'?'https://keyescape.com/reservation.php':`https://play33.kr/reservation?branch=${encodeURIComponent(s.branch||'')}`;
    }
    for(const [id,key] of [['latest','latest'],['upcoming','next']])ui[id].addEventListener('click',()=>{
      const dates=O.range(getSelection().rule);if(dates&&onDate){onDate(dates[key]);render();}
    });
    const widget={host,render,dispose(){host.remove();widgets.delete(widget);}};
    widgets.add(widget);render();return widget;
  }
  function keySelection(){
    const branch=document.querySelector('#zizum')?.value||new URLSearchParams(location.search).get('zizum_num');
    const option=document.querySelector('#theme')?.selectedOptions[0];
    const theme=option?.value||new URLSearchParams(location.search).get('theme_info_num');
    const current=`${branch}/${theme}`;
    if(current!==identity){selected='';identity=current;}
    return {site:'keyescape',branch,date:selected,rule:theme?O.rule('keyescape',branch,Number(option?.dataset.doing)):null};
  }
  function clearCells(){
    for(const [cell,before] of cells){
      cell.querySelector(':scope > .xr-opening-badge')?.remove();
      cell.removeAttribute('data-xr-opening');
      if(before.tabindex===null&&cell.getAttribute('tabindex')==='0')cell.removeAttribute('tabindex');
    }
    cells.clear();
  }
  function keyScan(){
    const calendar=document.querySelector('#datepicker');
    if(!calendar){keyCard?.dispose();keyCard=null;clearCells();return;}
    if(!keyCard?.host.isConnected){
      keyCard?.dispose();
      keyCard=create(keySelection,date=>{selected=date;tick();});
      calendar.before(keyCard.host);
      const legend=document.createElement('p');legend.className='legend';
      legend.textContent='초록: 오픈 시각 지남 · 주황: 다음 오픈 · 회색: 예정/지난 날짜 · 진한 테두리: 선택 날짜';
      keyCard.host.shadowRoot.querySelector('section').append(legend);
    }
    const s=keySelection(),dates=O.range(s.rule),now=Date.now();
    if(!style?.isConnected){
      style=document.createElement('style');style.id='xr-opening-calendar-style';
      style.textContent=`#datepicker .datepicker-ui{height:auto!important}
        #datepicker td[data-xr-opening]{position:relative;vertical-align:middle;padding-top:5px;padding-bottom:5px;opacity:1!important}
        #datepicker td[data-xr-opening=open]{background-color:#edf7f0!important;color:#195a39!important}
        #datepicker td[data-xr-opening=next]{box-shadow:inset 0 0 0 2px #c27b26!important;background-color:#fff5e6!important;color:#804807!important}
        #datepicker td[data-xr-opening=future],#datepicker td[data-xr-opening=past]{color:#777!important}
        #datepicker td[data-xr-opening].selected{outline:3px solid #233e31;outline-offset:-3px}
        #datepicker td[data-xr-opening]:focus-visible{outline:3px solid #9a5a0c;outline-offset:-3px}
        #datepicker .xr-opening-badge{display:block;pointer-events:none;font:10px/1.5 "Malgun Gothic",sans-serif;white-space:nowrap;letter-spacing:-.3px}
        @media(max-width:480px){#datepicker .xr-opening-badge{font-size:9px}}`;
      document.documentElement.append(style);
    }
    for(const [cell] of cells)if(!cell.isConnected)cells.delete(cell);
    for(const cell of calendar.querySelectorAll('td.selDate[data-date]')){
      const date=cell.dataset.date,state=O.state(s.rule,date,now);
      if(!cells.has(cell))cells.set(cell,{tabindex:cell.getAttribute('tabindex')});
      if(!cell.hasAttribute('tabindex'))cell.tabIndex=0;
      const phase=state.phase==='upcoming'?(date===dates?.next?'next':'future'):state.phase;
      if(cell.dataset.xrOpening!==phase)cell.dataset.xrOpening=phase;
      let badge=cell.querySelector(':scope > .xr-opening-badge');
      if(!badge){badge=document.createElement('span');badge.className='xr-opening-badge';cell.append(badge);}
      text(badge,state.phase==='open'?'오픈됨':state.phase==='past'?'지난 날짜':state.phase==='unknown'?'확인 필요':phase==='next'?`${O.kstDate(state.opensAt)===O.kstDate(now)?'오늘':'내일'} ${s.rule.time}`:'오픈 예정');
      badge.title=state.opensAt===null?'공식 오픈 규칙 확인 필요':`${O.stamp(state.opensAt)} 오픈 · 잔여석 미확인`;
    }
  }
  function listSelection(){
    const branch=document.querySelector('select[name=branch]')?.value;
    let r=O.rule('play33',branch);
    // Prefer this page's current branch settings when present.
    const days=Number(document.querySelector('#reservation_range_day')?.value),time=document.querySelector('#reservation_range_open_time')?.value;
    if(r&&Number.isInteger(days)&&days>=1&&days<=366&&/^\d{2}:\d{2}:\d{2}$/.test(time||''))r={leadDays:days,time:time.slice(0,5)};
    return {site:'play33',branch,date:document.querySelector('input[name=date]')?.value||'',rule:r};
  }
  function listScan(){
    const branch=document.querySelector('select[name=branch]'),form=branch?.closest('form');
    if(!form){listCard?.dispose();listCard=null;return;}
    if(!listCard?.host.isConnected){listCard?.dispose();listCard=create(listSelection,null);form.after(listCard.host);}
  }
  function tick(){
    if(!active)return;
    if(location.origin==='https://keyescape.com'&&location.pathname==='/reservation1.php')keyScan();
    if(location.origin==='https://play33.kr'&&location.pathname==='/reservation')listScan();
    for(const widget of widgets)if(widget.host.isConnected)widget.render();
  }
  function onDate(event){
    const cell=event.target.closest?.('#datepicker td.selDate[data-date]');
    if(!cell)return;
    if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;
    if(event.type==='keydown')event.preventDefault();
    keySelection();selected=cell.dataset.date;
    keyCard?.render();
  }
  root.XROpeningUI={create,configure(config){
    const enabled=window===window.top&&['https://keyescape.com','https://play33.kr'].includes(location.origin)&&config.sites.includes(location.origin);
    if(enabled===active)return;
    active=enabled;
    if(active){document.addEventListener('click',onDate,true);document.addEventListener('keydown',onDate,true);document.addEventListener('change',tick);tick();timer=setInterval(tick,1000);}
    else{clearInterval(timer);timer=null;document.removeEventListener('click',onDate,true);document.removeEventListener('keydown',onDate,true);document.removeEventListener('change',tick);for(const w of [...widgets])w.dispose();keyCard=listCard=null;clearCells();style?.remove();style=null;selected=identity='';}
  }};
})(globalThis);
