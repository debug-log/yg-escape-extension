// Runs in the extension's isolated world. No page messages can enable it.
(()=>{
  const selector='td.selDate.disabled[data-date]';
  const hint='확장 프로그램으로 선택 제한을 해제한 날짜';
  const changed=new Map();
  let active=false,ready=false,count=0,timer=null;
  const eligible=()=>window===window.top&&location.origin==='https://keyescape.com'&&location.pathname==='/reservation1.php';
  const observe=()=>observer.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-date']});
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
    if(cell.getAttribute('title')===before.appliedTitle){
      if(before.title===null)cell.removeAttribute('title');
      else cell.setAttribute('title',before.title);
    }
  }
  function scan(){
    timer=null;
    if(!active)return;
    if(!eligible()){stop();return;}
    observer.disconnect();
    try{
      for(const [cell,before] of changed){
        if(!cell.isConnected){changed.delete(cell);continue;}
        if(cell.getAttribute('data-date')!==before.date||cell.matches(selector)){
          restore(cell,before,false);
          changed.delete(cell);
        }
      }
      for(const cell of document.querySelectorAll(selector)){
        const before={date:cell.getAttribute('data-date'),available:cell.classList.contains('available'),title:cell.getAttribute('title'),styles:[]};
        cell.classList.remove('disabled');
        cell.classList.add('available');
        // Keep the calendar's selected background and date text visible.
        for(const [name,value] of [['outline','2px dashed #b45309'],['outline-offset','-3px']]){
          const saved={value:cell.style.getPropertyValue(name),priority:cell.style.getPropertyPriority(name)};
          cell.style.setProperty(name,value,'important');
          saved.applied=cell.style.getPropertyValue(name);
          before.styles.push([name,saved]);
        }
        cell.title=cell.title?cell.title+' · '+hint:hint;
        before.appliedTitle=cell.title;
        changed.set(cell,before);
        count++;
      }
    }finally{if(active)observe();}
  }
  const observer=new MutationObserver(records=>{
    if(timer!==null||!active)return;
    if(records.some(r=>r.type==='childList'||r.target.matches?.(selector)||changed.has(r.target)))timer=setTimeout(scan,0);
  });
  function stop(){
    active=false;observer.disconnect();
    if(timer!==null){clearTimeout(timer);timer=null;}
    for(const [cell,before] of changed)if(cell.isConnected)restore(cell,before);
    changed.clear();
  }
  globalThis.XRDateUnlock={
    configure(config){
      ready=true;
      const enabled=eligible()&&config.sites.includes(location.origin)&&config.keyescapeDateUnlockEnabled!==false;
      if(!enabled){stop();return;}
      if(!active){active=true;scan();}
    },
    getState(){return {ready,eligible:eligible(),active,count,reloadRequired:false};}
  };
})();
