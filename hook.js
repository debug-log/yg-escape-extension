(()=>{
  'use strict';
  if(window.__xrEditorInstalled)return;
  window.__xrEditorInstalled=true;
  const engine=window.XREngine;
  const proto=XMLHttpRequest.prototype;
  const open=proto.open,send=proto.send;
  const response=Object.getOwnPropertyDescriptor(proto,'response');
  const text=Object.getOwnPropertyDescriptor(proto,'responseText');
  const states=new WeakMap();
  let config={enabled:false,rules:[]},ready=false,count=0,last=null;
  const report=()=>window.postMessage({source:'xr-editor-hook',type:'state',ready,enabled:config.enabled,count,last},location.origin);
  window.addEventListener('message',e=>{
    if(e.source!==window||e.origin!==location.origin||e.data?.source!=='xr-editor-bridge')return;
    if(e.data.type==='config'){
      try{const c=e.data.config;if(typeof c.enabled!=='boolean'||!Array.isArray(c.rules))return;c.rules.forEach(engine.validate);config=c;ready=true;report();}catch{/* Invalid configuration leaves prior state intact. */}
    }else if(e.data.type==='ping')report();
  });
  function converted(xhr){
    const state=states.get(xhr);
    if(!state||xhr.readyState!==4||xhr.status===0||!['','text','json'].includes(xhr.responseType))return null;
    if(state.done)return state.result;
    state.done=true;
    if(!ready||!config.enabled)return null;
    try{
      const raw=response.get.call(xhr);
      const value=xhr.responseType==='json'?raw:JSON.parse(raw);
      const out=engine.transform(value,config.rules,state.url,state.method,location.href,state.body);
      if(out.matched){state.result={value:out.value,text:JSON.stringify(out.value)};count++;last={at:Date.now(),ruleId:out.ruleId,sourceDate:out.sourceDate,items:Array.isArray(out.value?.data)?out.value.data.length:null};report();}
    }catch{/* Preserve native response on parsing or transformation errors. */}
    return state.result;
  }
  proto.open=function(method,url,...rest){
    const result=open.call(this,method,url,...rest);
    states.set(this,{method:String(method).toUpperCase(),url:new URL(String(url),location.href).href,done:false,result:null});
    return result;
  };
  proto.send=function(...args){const state=states.get(this);if(state){state.done=false;state.result=null;state.body=engine.parseRequestBody(args[0]);}return send.apply(this,args);};
  Object.defineProperty(proto,'response',{...response,get(){const original=response.get.call(this);const out=converted(this);return out?(this.responseType==='json'?out.value:out.text):original;}});
  Object.defineProperty(proto,'responseText',{...text,get(){const original=text.get.call(this);const out=converted(this);return out?out.text:original;}});
  report();
})();
