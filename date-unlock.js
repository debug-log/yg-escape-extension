// Runs in the extension's isolated world. No page messages can enable it.
(()=>{
  const selector='td.selDate.disabled[data-date]';
  let active=false,ready=false,count=0,timer=null;
  const eligible=()=>window===window.top&&location.origin==='https://keyescape.com'&&location.pathname==='/reservation1.php';
  const observe=()=>observer.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-date']});
  function scan(){
    timer=null;
    if(!active)return;
    if(!eligible()){stop();return;}
    // Disconnect during our own synchronous writes to avoid observing ourselves.
    observer.disconnect();
    try{
      for(const cell of document.querySelectorAll(selector)){
        cell.classList.remove('disabled');
        cell.classList.add('available');
        count++;
      }
    }finally{if(active)observe();}
  }
  const observer=new MutationObserver(records=>{
    if(timer!==null||!active)return;
    if(records.some(r=>r.type==='childList'||r.target.matches?.(selector)))timer=setTimeout(scan,0);
  });
  function stop(){active=false;observer.disconnect();if(timer!==null){clearTimeout(timer);timer=null;}}
  globalThis.XRDateUnlock={
    configure(config){
      ready=true;
      const enabled=eligible()&&config.sites.includes(location.origin)&&config.keyescapeDateUnlockEnabled!==false;
      if(!enabled){stop();return;}
      if(!active){active=true;scan();}
    },
    getState(){return {ready,eligible:eligible(),active,count,reloadRequired:!active&&count>0};}
  };
})();
