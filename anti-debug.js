// Inspired by Anti Anti Debug 1.0.7 (Unlicense); see vendor/anti-anti-debug.LICENSE.
(()=>{
  'use strict';
  const parser=window.__xrAntiDebugAcorn;
  delete window.__xrAntiDebugAcorn;
  if(window.__xrAntiDebugInstalled)return;
  window.__xrAntiDebugInstalled=true;
  let initialized=false,active=false,desired=false,error=false;
  const report=()=>window.postMessage({source:'xr-anti-debug',type:'state',ready:initialized,active,reloadRequired:initialized&&active!==desired,error},location.origin);

  function install(){
    if(!parser?.parse)throw Error('Parser unavailable');
    const native=Function.prototype.constructor;
    function clean(args){
      if(!args.length)return args;
      const body=args.at(-1);
      if(!body.includes('debugger'))return args;
      const prefix='(function('+args.slice(0,-1).join(',')+'\n){\n';
      try{
        const tree=parser.parse(prefix+body+'\n})',{ecmaVersion:'latest'});
        const ranges=[],stack=[tree];
        while(stack.length){
          const node=stack.pop();
          if(!node||typeof node!=='object')continue;
          if(node.type==='DebuggerStatement'&&node.start>=prefix.length&&node.end<=prefix.length+body.length)ranges.push([node.start-prefix.length,node.end-prefix.length]);
          for(const value of Object.values(node))if(Array.isArray(value))stack.push(...value);else if(value&&typeof value==='object')stack.push(value);
        }
        if(!ranges.length)return args;
        let result=body;
        // An empty statement preserves if/else and loop syntax, including ASI.
        for(const [start,end] of ranges.sort((a,b)=>b[0]-a[0]))result=result.slice(0,start)+';'+result.slice(start+1,end).replace(/[^\r\n]/g,' ')+result.slice(end);
        return [...args.slice(0,-1),result];
      }catch{return args;}
    }
    function create(args,thisArg,newTarget){
      // Native ToString semantics (including Symbols), exactly once per argument.
      const strings=args.map(arg=>`${arg}`);
      const original=Reflect.apply(native,thisArg,strings); // Preserve native syntax errors before parsing.
      const changed=clean(strings);
      if(newTarget)return Reflect.construct(native,changed,newTarget);
      return changed===strings?original:Reflect.apply(native,thisArg,changed);
    }
    const constructor=new Proxy(native,{
      apply:(_target,thisArg,args)=>create(args,thisArg),
      construct:(_target,args,newTarget)=>create(args,undefined,newTarget)
    });
    const log=console.log;
    const filteredLog=new Proxy(log,{apply(target,thisArg,args){
      const safe=args.map(value=>{
        if(typeof value==='function')return '[함수 출력 생략]';
        if(value===null||typeof value!=='object')return value;
        try{
          const descriptors=Object.getOwnPropertyDescriptors(value);
          if(Object.values(descriptors).some(d=>d.get)||Object.hasOwn(descriptors,'toString'))return '[탐지 가능 객체 출력 생략]';
          if(Array.isArray(value)&&value.length===50&&typeof descriptors['0']?.value==='object')return '[대형 객체 배열 출력 생략]';
          return value;
        }catch{return '[검사할 수 없는 객체 출력 생략]';}
      });
      return Reflect.apply(target,thisArg,safe);
    }});
    const changes=[[Function.prototype,'constructor',constructor],[console,'log',filteredLog],...['clear','table'].map(key=>[console,key,new Proxy(console[key],{apply(){}})])];
    const applied=[];
    try{
      for(const [object,key,value] of changes){
        const original=object[key];object[key]=value;applied.push([object,key,original,value]);
      }
    }catch(error){
      for(const [object,key,original,value] of applied.reverse())try{if(object[key]===value)object[key]=original;}catch{}
      throw error;
    }
  }
  window.addEventListener('message',e=>{
    if(e.source!==window||e.origin!==location.origin||e.data?.source!=='xr-editor-bridge')return;
    if(e.data.type==='ping'){report();return;}
    if(e.data.type!=='config'||typeof e.data.antiDebug?.enabled!=='boolean')return;
    desired=e.data.antiDebug.enabled;
    if(!initialized){
      initialized=true;
      if(desired)try{install();active=true;}catch{error=true;}
    }
    report();
  });
  report();
})();
