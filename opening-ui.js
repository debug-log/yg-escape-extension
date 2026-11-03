// Opening hints supplement the site's calendar without replacing its presentation.
(function(root){
  'use strict';
  if(root.XROpeningUI)return;
  const O=root.XROpening,widgets=new Set(),cells=new Map();
  let active=false,timer=null,listHint=null,style=null;
  const calendarHints=new WeakMap();
  const calendarHintCSS=`#datepicker td[data-xr-calendar-hint]{position:relative}
    #datepicker td[data-xr-calendar-hint]:hover::after,#datepicker td[data-xr-calendar-hint]:focus-visible::after{content:attr(data-xr-calendar-hint);position:absolute;z-index:10;bottom:100%;left:50%;transform:translateX(-50%);width:max-content;max-width:260px;padding:6px 8px;border:1px solid #ddd;border-radius:4px;background:#fff;color:#555;font:11px/1.5 "Malgun Gothic",sans-serif;white-space:pre-line;text-align:center;pointer-events:none}
    #datepicker td[data-xr-calendar-hint]:first-child::after{left:0;transform:none}
    #datepicker td[data-xr-calendar-hint]:last-child::after{left:auto;right:0;transform:none}`;
  function renderCalendarHint(cell,entry){
    // Keep a site's own title, while using one tooltip for both extension features.
    if(cell.hasAttribute('title')){entry.title=cell.getAttribute('title');cell.removeAttribute('title');}
    const lines=[entry.opening,entry.unlock,entry.title].filter(Boolean);
    const label=lines.join('\n');
    if(cell.dataset.xrCalendarHint!==label)cell.dataset.xrCalendarHint=label;
  }
  function setCalendarHint(cell,kind,value){
    let entry=calendarHints.get(cell);
    if(!entry){entry={title:cell.getAttribute('title')};calendarHints.set(cell,entry);}
    entry[kind]=value;renderCalendarHint(cell,entry);
  }
  function clearCalendarHint(cell,kind){
    const entry=calendarHints.get(cell);if(!entry)return;
    delete entry[kind];
    if(entry.opening||entry.unlock){renderCalendarHint(cell,entry);return;}
    cell.removeAttribute('data-xr-calendar-hint');
    if(!cell.hasAttribute('title')&&entry.title!==null)cell.setAttribute('title',entry.title);
    calendarHints.delete(cell);
  }
  function text(el,value){if(el.textContent!==value)el.textContent=value;}
  function create(getSelection){
    const host=document.createElement('xr-opening-hint'),shadow=host.attachShadow({mode:'open'});
    shadow.innerHTML='<style>:host{display:block;margin:8px 0;color:#666;font:12px/1.5 "Malgun Gothic",sans-serif;text-align:left}:host([hidden]){display:none}p{margin:0}</style><p id="when" role="status"></p>';
    const when=shadow.getElementById('when');
    function render(){
      const s=getSelection(),state=O.state(s.rule,s.date,Date.now());
      host.hidden=!s.date||!['upcoming','unknown'].includes(state.phase);
      text(when,state.phase==='upcoming'?O.stamp(state.opensAt)+' 오픈 (한국시간)':'오픈 일정은 공식 안내를 확인해주세요.');
    }
    const widget={host,render,dispose(){host.remove();widgets.delete(widget);}};
    widgets.add(widget);render();return widget;
  }
  function keySelection(){
    const branch=document.querySelector('#zizum')?.value||new URLSearchParams(location.search).get('zizum_num');
    const option=document.querySelector('#theme')?.selectedOptions[0];
    const theme=option?.value||new URLSearchParams(location.search).get('theme_info_num');
    return {rule:theme?O.rule('keyescape',branch,Number(option?.dataset.doing)):null};
  }
  function clearCell(cell,before=cells.get(cell)){
    cell.querySelector(':scope > .xr-opening-badge')?.remove();
    cell.removeAttribute('data-xr-opening');
    cell.removeAttribute('data-xr-opening-label');
    clearCalendarHint(cell,'opening');
    if(before&&cell.getAttribute('aria-label')===before.appliedLabel){
        if(before.label===null)cell.removeAttribute('aria-label');
        else cell.setAttribute('aria-label',before.label);
    }
    cells.delete(cell);
  }
  function clearCells(){
    for(const [cell,before] of cells)clearCell(cell,before);
    cells.clear();
  }
  function observeCalendar(){
    calendarObserver.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['data-date','data-doing']});
  }
  const calendarObserver=new MutationObserver(records=>{
    if(!active)return;
    const selector='#datepicker,#theme,#zizum';
    if(records.some(record=>record.type==='attributes'||record.target.closest?.(selector)
      ||[...record.addedNodes,...record.removedNodes].some(node=>node.matches?.(selector)||node.querySelector?.(selector))))keyScan();
  });
  function keyScan(){
    // Ignore our own badges and labels so rendering cannot trigger a scan loop.
    calendarObserver.disconnect();
    try{renderKeyCalendar();}finally{if(active)observeCalendar();}
  }
  function renderKeyCalendar(){
    const calendar=document.querySelector('#datepicker');
    if(!calendar){clearCells();return;}
    const s=keySelection(),dates=O.range(s.rule),now=Date.now();
    if(!style?.isConnected){
      style=document.createElement('style');style.id='xr-opening-calendar-style';
      style.textContent=`#datepicker td[data-xr-opening]{position:relative}
        #datepicker .xr-opening-badge{position:absolute;bottom:3px;left:50%;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:currentColor;pointer-events:none}
        #datepicker .xr-opening-badge.is-today{position:absolute;bottom:3px;left:50%;transform:translateX(-50%);display:block;width:auto;height:auto;margin:0;border-radius:0;background:none;font:8px/1 "Malgun Gothic",sans-serif;letter-spacing:-.4px;white-space:nowrap}
        ${calendarHintCSS}`;
      document.documentElement.append(style);
    }
    for(const [cell] of cells)if(!cell.isConnected)cells.delete(cell);
    for(const cell of calendar.querySelectorAll('td.selDate[data-date]')){
      const date=cell.dataset.date,state=O.state(s.rule,date,now);
      if(state.phase==='past'){clearCell(cell);continue;}
      if(!cells.has(cell))cells.set(cell,{label:cell.getAttribute('aria-label')});
      const phase=state.phase==='upcoming'?(date===dates?.next?'next':'future'):state.phase;
      if(cell.dataset.xrOpening!==phase)cell.dataset.xrOpening=phase;
      const label=date+' · '+(state.opensAt===null?'오픈 일정 확인 필요':O.stamp(state.opensAt)+' 오픈');
      if(cell.getAttribute('aria-label')!==label)cell.setAttribute('aria-label',label);
      const hint=state.opensAt===null?'오픈 일정 확인 필요':O.stamp(state.opensAt)+' 오픈 (한국시간)';
      if(cell.dataset.xrOpeningLabel!==hint)cell.dataset.xrOpeningLabel=hint;
      setCalendarHint(cell,'opening',hint);
      cells.get(cell).appliedLabel=label;
      let badge=cell.querySelector(':scope > .xr-opening-badge');
      const calendarTime=(phase==='next'||O.isOpeningLaterToday(state,now))?O.stamp(state.opensAt).slice(11)+' 오픈':'';
      if(calendarTime||phase==='next'){
        if(!badge){badge=document.createElement('span');badge.className='xr-opening-badge';badge.setAttribute('aria-hidden','true');cell.append(badge);}
        badge.classList.toggle('is-today',!!calendarTime);
        text(badge,calendarTime);
      }else badge?.remove();
    }
  }
  function listSelection(){
    const branch=document.querySelector('select[name=branch]')?.value;
    let rule=O.rule('play33',branch);
    const days=Number(document.querySelector('#reservation_range_day')?.value),time=document.querySelector('#reservation_range_open_time')?.value;
    if(rule&&Number.isInteger(days)&&days>=1&&days<=366&&/^\d{2}:\d{2}:\d{2}$/.test(time||''))rule={leadDays:days,time:time.slice(0,5)};
    return {date:document.querySelector('input[name=date]')?.value||'',rule};
  }
  function listScan(){
    const field=document.querySelector('input[name=date]'),form=field?.closest('form');
    if(!form){listHint?.dispose();listHint=null;return;}
    if(!listHint?.host.isConnected){listHint?.dispose();listHint=create(listSelection);field.after(listHint.host);}
  }
  function createScan(){
    const panel=document.querySelector('#xr-play33-panel')?.shadowRoot;
    const form=[...document.forms].find(f=>['branch','theme','date'].every(k=>f.querySelector(`input[type="hidden"][name="${k}"]`)));
    const anchor=panel?.getElementById('date')||form;
    if(!anchor){listHint?.dispose();listHint=null;return;}
    const getSelection=()=>{
      const panel=document.querySelector('#xr-play33-panel')?.shadowRoot;
      const branch=panel?.getElementById('branch')?.value??form.querySelector('input[name="branch"]').value;
      const date=panel?.getElementById('date')?.value??form.querySelector('input[name="date"]').value;
      return {site:'play33',branch,date,rule:O.rule('play33',branch)};
    };
    if(!listHint){listHint=create(getSelection);}
    // Recreate when the form or panel changes so selection readers cannot retain an old form.
    if(listHint.host.previousElementSibling!==anchor){
      listHint.dispose();listHint=create(getSelection);
      anchor.after(listHint.host);
    }
  }
  function tick(){
    if(!active)return;
    if(location.origin==='https://keyescape.com'&&location.pathname==='/reservation1.php')keyScan();
    if(location.origin==='https://play33.kr'){
      if(location.pathname==='/reservation')listScan();
      if(location.pathname==='/reservation/create')createScan();
    }
    for(const widget of widgets)if(widget.host.isConnected)widget.render();
  }
  root.XROpeningUI={create,calendarHintCSS,setCalendarHint,clearCalendarHint,refresh:tick,getState(){return {ready:true,eligible:window===window.top&&((location.origin==='https://keyescape.com'&&location.pathname==='/reservation1.php')||(location.origin==='https://play33.kr'&&['/reservation','/reservation/create'].includes(location.pathname))),active:active&&(cells.size>0||[...widgets].some(w=>w.host.isConnected))};},configure(config){
    const helper=XRSettings.helperState(config,location.origin);
    const enabled=window===window.top&&helper.supported&&helper.registered&&helper.enabled&&helper.opening;
    if(enabled===active)return;
    active=enabled;
    if(active){document.addEventListener('change',tick);tick();timer=setInterval(tick,1000);}
    else{calendarObserver.disconnect();clearInterval(timer);timer=null;document.removeEventListener('change',tick);for(const w of [...widgets])w.dispose();listHint=null;clearCells();style?.remove();style=null;}
  }};
})(globalThis);
