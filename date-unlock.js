// Runs in the extension's isolated world. No page messages can enable it.
(()=>{
  const selector='td.selDate.disabled[data-date]';
  const hint='확장 프로그램으로 선택 제한을 해제한 날짜';
  const changed=new Map(),blocked=new Set();
  let active=false,ready=false,count=0,timer=null,rules=[],style=null;
  const eligible=()=>window===window.top&&location.origin==='https://keyescape.com'&&location.pathname==='/reservation1.php';
  const observe=()=>observer.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-date']});
  function selection(){
    const params=new URLSearchParams(location.search);
    const branch=document.querySelector('#zizum')?.value||params.get('zizum_num');
    const themeSelect=document.querySelector('#theme');
    const selectedTheme=themeSelect?.value;
    const selectedThemeNum=themeSelect?.selectedOptions?.[0]?.dataset.themenum;
    const pageSelection=branch===params.get('zizum_num')&&(!params.get('theme_info_num')||selectedTheme===params.get('theme_info_num'));
    const theme=selectedThemeNum||(pageSelection&&params.get('theme_num')?params.get('theme_num'):selectedTheme||params.get('theme_num'));
    return {branch,theme};
  }
  function canUnlock(date){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return false;
    const parsed=new Date(date+'T00:00:00Z');
    if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)return false;
    if(date<new Date(Date.now()+9*3600000).toISOString().slice(0,10))return false;
    const {branch,theme}=selection();
    const rule=rules.find(r=>r.enabled&&r.action==='weekdayFallback'&&r.requestParams?.zizumNum===branch&&r.requestParams?.themeNum===theme);
    if(!rule)return true;
    const days=new Set((rule.samples||[]).map(sample=>new Date(sample.date+'T00:00:00Z').getUTCDay()));
    for(const group of rule.weekdayGroups||[])if(group.some(day=>days.has(day)))for(const day of group)days.add(day);
    return days.has(parsed.getUTCDay());
  }
  function ensureStyle(){
    if(style?.isConnected)return;
    style=document.createElement('style');style.id='xr-date-unlock-style';
    style.textContent='#datepicker td.xr-date-unlock-unconfirmed{background:#ececec!important;background-image:none!important;color:#9a9a9a!important;cursor:not-allowed!important}'+XROpeningUI.calendarHintCSS;
    document.documentElement.append(style);
  }
  function restore(cell,before,classes=true){
    // A reused calendar cell may now belong to another date or theme.
    if(classes&&cell.getAttribute('data-date')===before.date&&cell.classList.contains('available')){
      cell.classList.add('disabled');
      if(!before.available)cell.classList.remove('available');
    }
    for(const [name,saved] of before.styles){
      if(cell.style.getPropertyValue(name)!==saved.applied||cell.style.getPropertyPriority(name)!=='important')continue;
      if(saved.value)cell.style.setProperty(name,saved.value,saved.priority);
      else cell.style.removeProperty(name);
    }
    XROpeningUI.clearCalendarHint(cell,'unlock');
  }
  function scan(){
    timer=null;
    if(!active)return;
    if(!eligible()){stop();return;}
    observer.disconnect();
    try{
      ensureStyle();
      for(const cell of blocked)if(cell.isConnected)cell.classList.remove('xr-date-unlock-unconfirmed');
      blocked.clear();
      for(const [cell,before] of changed){
        if(!cell.isConnected){changed.delete(cell);continue;}
        const reused=cell.getAttribute('data-date')!==before.date;
        if(reused||!canUnlock(before.date)||cell.matches(selector)){
          restore(cell,before,!reused&&!canUnlock(before.date));
          changed.delete(cell);
        }
      }
      for(const cell of document.querySelectorAll(selector)){
        if(!canUnlock(cell.getAttribute('data-date'))){
          cell.classList.add('xr-date-unlock-unconfirmed');
          blocked.add(cell);
          continue;
        }
        const before={date:cell.getAttribute('data-date'),available:cell.classList.contains('available'),styles:[]};
        cell.classList.remove('disabled');
        cell.classList.add('available');
        // Keep the calendar's selected background and date text visible.
        for(const [name,value] of [['background-image','linear-gradient(rgba(247, 50, 63, 0.06), rgba(247, 50, 63, 0.06))']]){
          const saved={value:cell.style.getPropertyValue(name),priority:cell.style.getPropertyPriority(name)};
          cell.style.setProperty(name,value,'important');
          saved.applied=cell.style.getPropertyValue(name);
          before.styles.push([name,saved]);
        }
        XROpeningUI.setCalendarHint(cell,'unlock',hint);
        changed.set(cell,before);
        count++;
      }
    }finally{if(active)observe();}
  }
  const observer=new MutationObserver(records=>{
    if(timer!==null||!active)return;
    if(records.some(r=>r.type==='childList'||r.target.matches?.(selector)||changed.has(r.target)||blocked.has(r.target)))timer=setTimeout(scan,0);
  });
  const selectionChanged=event=>{
    if(active&&event.target.matches?.('#zizum,#theme')&&timer===null)timer=setTimeout(scan,0);
  };
  function stop(){
    active=false;observer.disconnect();
    document.removeEventListener('change',selectionChanged);
    if(timer!==null){clearTimeout(timer);timer=null;}
    for(const [cell,before] of changed)if(cell.isConnected)restore(cell,before);
    changed.clear();
    for(const cell of blocked)if(cell.isConnected)cell.classList.remove('xr-date-unlock-unconfirmed');
    blocked.clear();style?.remove();style=null;
  }
  globalThis.XRDateUnlock={
    configure(config){
      ready=true;
      rules=(config.rules||[]).filter(rule=>rule.site===location.origin);
      const helper=XRSettings.helperState(config,location.origin);
      const enabled=eligible()&&helper.registered&&helper.enabled&&helper.dateUnlock;
      if(!enabled){stop();return;}
      if(!active){active=true;document.addEventListener('change',selectionChanged);}
      scan();
    },
    getState(){return {ready,eligible:eligible(),active,count,reloadRequired:false};}
  };
})();
