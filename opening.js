(function(root){
  'use strict';
  const DAY=86400000, KST=9*3600000;
  // Official reservation pages checked 2026-11-03. Values are opening rules, not availability.
  const rules={
    keyescape:{'31':[2,'09:30'],'14':[6,'10:00'],'16':[6,'10:00'],'19':[6,'10:00'],'20':[6,'10:00'],
      '18':[6,'10:30'],'23':[6,'11:00'],'22':[6,'11:30'],'25':[6,'13:30'],'29':[6,'18:00'],
      '3':[13,'18:00'],'9':[13,'18:00'],'7':[13,'18:00'],'10':[13,'20:00']},
    play33:{'1':[7,'20:00'],'4':[7,'20:00'],'5':[7,'10:00'],'7':[7,'22:00']}
  };
  function rule(site,branch,calendarDays){
    const entry=rules[site]?.[branch];
    if(!entry)return null;
    const leadDays=site==='keyescape'&&Number.isInteger(calendarDays)&&calendarDays>=1&&calendarDays<=366?calendarDays-1:entry[0];
    return {leadDays,time:entry[1]};
  }
  function valid(date){
    if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
    const n=Date.parse(date+'T00:00:00Z');
    return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===date;
  }
  const kstDate=now=>new Date(now+KST).toISOString().slice(0,10);
  const shift=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*DAY).toISOString().slice(0,10);
  function state(r,date,now=Date.now()){
    if(!r||!valid(date)||!Number.isFinite(now))return {phase:'unknown',opensAt:null};
    const opensAt=Date.parse(shift(date,-r.leadDays)+'T'+r.time+':00+09:00');
    return {phase:date<kstDate(now)?'past':now<opensAt?'upcoming':'open',opensAt};
  }
  function range(r,now=Date.now()){
    if(!r)return null;
    const today=kstDate(now),opened=now>=Date.parse(today+'T'+r.time+':00+09:00');
    const latest=shift(today,r.leadDays-(opened?0:1));
    return {today,latest,next:shift(latest,1)};
  }
  const stamp=instant=>new Date(instant+KST).toISOString().slice(0,16).replace('T',' ');
  const isOpeningLaterToday=(current,now=Date.now())=>current.phase==='upcoming'&&kstDate(current.opensAt)===kstDate(now);
  const api={rule,state,range,stamp,isOpeningLaterToday,valid,kstDate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.XROpening=api;
})(globalThis);
