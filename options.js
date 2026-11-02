const $=id=>document.getElementById(id);
let config,baseline,editing=null,quickEditing=null,scopeCleared=false;
const message=text=>$('message').textContent=text;
const button=(label,handler)=>{const b=document.createElement('button');b.textContent=label;b.className='secondary';b.onclick=()=>Promise.resolve().then(handler).catch(e=>message(e.message));return b;};
async function persist(enable=false){const result=await chrome.runtime.sendMessage({type:'save',before:baseline,after:config,enable});if(!result.ok)throw Error(result.error);config=result.config;baseline=structuredClone(config);render();renderQuick();}
function render(){
 renderPlay33Status(config);
 const selectedSite=$('site').value;
 $('sites').replaceChildren();$('site').replaceChildren();
 for(const site of config.sites){const opt=document.createElement('option');opt.value=site;opt.textContent=site;$('site').append(opt);const row=document.createElement('div');row.className='item';row.append(document.createTextNode(site),button('삭제',async()=>{config.sites=config.sites.filter(s=>s!==site);await persist();await chrome.permissions.remove({origins:[site+'/*']});message('사이트를 해제했습니다. 방해 완화를 완전히 해제하려면 대상 페이지를 새로고침하세요.');}));const label=document.createElement('label');const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=!(config.antiDebugDisabledSites||[]).includes(site);toggle.setAttribute('aria-label',site+' 개발자도구 방해 완화');
 toggle.onchange=async()=>{toggle.disabled=true;try{const disabled=new Set(config.antiDebugDisabledSites||[]);if(toggle.checked)disabled.delete(site);else disabled.add(site);config.antiDebugDisabledSites=[...disabled];await persist();message('방해 완화 설정을 저장했습니다. 대상 페이지를 새로고침하세요.');}catch(e){message(e.message);}finally{toggle.disabled=false;}};
 label.append(toggle,document.createTextNode(' 개발자도구 방해 완화'));row.append(label);
 if(site==='https://keyescape.com'){
  const dateLabel=document.createElement('label');const dateToggle=document.createElement('input');dateToggle.type='checkbox';dateToggle.id='keyescapeDateUnlock';dateToggle.checked=config.keyescapeDateUnlockEnabled!==false;
  dateToggle.onchange=async()=>{dateToggle.disabled=true;try{config.keyescapeDateUnlockEnabled=dateToggle.checked;await persist();message('날짜 자동 열기 설정을 적용했습니다. 현재 테마를 유지하며, 끄면 확장이 열었던 날짜를 원래대로 되돌립니다.');}catch(e){message(e.message);}finally{dateToggle.disabled=false;}};
  dateLabel.append(dateToggle,document.createTextNode(' 날짜 자동 열기'));row.append(dateLabel);
 }
 $('sites').append(row);}
 if(selectedSite)$('site').value=selectedSite;
 $('rules').replaceChildren();
 config.rules.forEach((rule,i)=>{
  const row=document.createElement('div');row.className='advanced-rule';
  const info=document.createElement('div');info.className='advanced-rule-info';
  const heading=document.createElement('div');heading.className='advanced-rule-heading';
  const status=document.createElement('span');status.className='advanced-rule-status'+(rule.enabled?' is-enabled':'');status.setAttribute('aria-label',rule.enabled?'켜짐':'꺼짐');
  const name=document.createElement('strong');name.textContent=rule.name;
  heading.append(status,name);
  const site=document.createElement('small');site.textContent=rule.site;
  info.append(heading,site);
  const actions=document.createElement('div');actions.className='advanced-rule-actions';
  const toggle=button(rule.enabled?'끄기':'켜기',async()=>{rule.enabled=!rule.enabled;await persist();});
  toggle.setAttribute('aria-label',rule.name+' '+(rule.enabled?'끄기':'켜기'));toggle.setAttribute('aria-pressed',String(rule.enabled));
  const up=button('↑',async()=>{if(i>0){[config.rules[i-1],config.rules[i]]=[rule,config.rules[i-1]];await persist();}});
  const down=button('↓',async()=>{if(i<config.rules.length-1){[config.rules[i],config.rules[i+1]]=[config.rules[i+1],rule];await persist();}});
  up.disabled=i===0;down.disabled=i===config.rules.length-1;
  up.setAttribute('aria-label',rule.name+' 위로 이동');down.setAttribute('aria-label',rule.name+' 아래로 이동');
  actions.append(button('편집',()=>fill(rule)),toggle,up,down,button('삭제',async()=>{config.rules.splice(i,1);if(editing===rule.id)editing=null;await persist();}));
  row.append(info,actions);$('rules').append(row);
 });
}
function fill(r){scopeCleared=false;$('scopeBox').hidden=!r.pageParams;$('scopeText').textContent=r.pageParams?'이 규칙은 특정 지점·테마에만 적용됩니다: '+JSON.stringify(r.pageParams):'';showMode(false);editing=r.id||null;for(const k of ['name','site','url','match','method','action'])$(k).value=r[k];$('ruleEnabled').checked=r.enabled;for(const k of ['conditions','patches','replacement'])$(k).value=JSON.stringify(r[k]??(k==='replacement'?{}:[]),null,2);$('requestParams').value=JSON.stringify(r.requestParams||{},null,2);$('fallbackConfig').value=JSON.stringify({dateParam:r.dateParam||'date',allowedMessages:r.allowedMessages||[],samples:r.samples||[]},null,2);visibility();$('editorTitle').textContent=editing?'규칙 편집':'새 규칙';}
function visibility(){$('patchLabel').hidden=$('action').value!=='patch';$('replaceLabel').hidden=$('action').value!=='replace';$('fallbackLabel').hidden=$('action').value!=='weekdayFallback';}
function read(){const original=config.rules.find(r=>r.id===editing);const rule={...(original||{}),id:editing||crypto.randomUUID(),enabled:$('ruleEnabled').checked};for(const k of ['name','site','url','match','method','action'])rule[k]=$(k).value;if(scopeCleared){for(const key of ['pageParams','pageURL','template','themeName'])delete rule[key];}else if(rule.pageParams&&original.site!==rule.site)throw Error('다른 사이트로 바꾸려면 먼저 테마 범위 제한을 해제하세요.');rule.conditions=JSON.parse($('conditions').value);rule.requestParams=JSON.parse($('requestParams').value||'{}');if(rule.action==='patch')rule.patches=JSON.parse($('patches').value);else if(rule.action==='replace')rule.replacement=JSON.parse($('replacement').value);else{const f=JSON.parse($('fallbackConfig').value);for(const k of ['dateParam','allowedMessages','samples'])rule[k]=f[k];}return XREngine.validate(rule);}
$('action').onchange=visibility;
$('addSite').onclick=async()=>{try{const url=new URL($('siteInput').value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('HTTP 또는 HTTPS 사이트를 입력하세요.');const site=url.origin;const granted=await chrome.permissions.request({origins:[site+'/*']});if(!granted){message('사이트 권한이 허용되지 않았습니다.');return;}if(!config.sites.includes(site))config.sites.push(site);await persist();const result=await chrome.runtime.sendMessage({type:'sync'});if(!result.ok)throw Error(result.error);message('사이트를 등록했습니다. 대상 페이지를 새로고침하세요.');}catch(e){message(e.message);}};
$('newRule').onclick=()=>fill({name:'새 규칙',site:config.sites[0]||'',url:'',match:'contains',method:'ANY',enabled:false,action:'patch',conditions:[],patches:[{path:'data[*].enable',value:'Y'}]});
async function saveAdvanced(enable=false){try{const rule=read();if(!config.sites.includes(rule.site))throw Error('먼저 사이트를 등록하세요.');const i=config.rules.findIndex(r=>r.id===editing);if(i<0)config.rules.push(rule);else config.rules[i]=rule;if(enable)rule.enabled=true;editing=rule.id;await persist(enable);$('site').value=rule.site;message('규칙을 저장했습니다. 활성화된 규칙은 이후 완료되는 요청에 적용됩니다.');}catch(e){message(e.message);}};
$('save').onclick=()=>saveAdvanced(false);
$('saveEnable').onclick=()=>saveAdvanced(true);
$('preview').onclick=()=>{try{const rule=read();const url=new URL($('previewUrl').value);const sample=JSON.parse($('sample').value);const why=XRUX.reason(rule,url.href,$('previewMethod').value,sample,rule.pageURL);const result=why?{matched:false,value:sample}:XREngine.transform(sample,[{...rule,enabled:true}],url.href,$('previewMethod').value,rule.pageURL,$('previewBody').value);$('previewState').textContent=why||(result.matched?'조건 일치 · '+XRUX.summary(result.value)+(result.sourceDate?' · 원본 날짜 '+result.sourceDate:'')+' (저장 전 미리보기)':'적용 안 됨 · 요청 본문 조건, 오류 문구, 같은 요일의 이전 시간표를 확인하세요.');$('output').textContent=JSON.stringify(result.value,null,2);}catch(e){message(e.message);}};
chrome.runtime.sendMessage({type:'sync'}).then(result=>{if(!result.ok)throw Error(result.error);return chrome.storage.local.get('config');}).then(result=>{config=result.config||{enabled:false,sites:[],rules:[]};baseline=structuredClone(config);render();renderQuick();visibility();useCurrent(false);}).catch(error=>message(error.message));

function showMode(simple){$('quick').hidden=!simple;$('advanced').hidden=simple;$('simpleTab').setAttribute('aria-pressed',String(simple));$('advancedTab').setAttribute('aria-pressed',String(!simple));}
$('newResponseRule').onclick=()=>{$('newRule').onclick();};
$('simpleTab').onclick=()=>showMode(true);$('advancedTab').onclick=()=>showMode(false);
function quickVisibility(){$('quickReplacementLabel').hidden=$('quickAction').value!=='replace';$('quickPatchHint').hidden=$('quickAction').value!=='patch';$('quickResult').textContent='';}
$('quickAction').onchange=quickVisibility;
async function useCurrent(notify=true){const {pageContext}=await chrome.storage.session.get('pageContext');if(pageContext?.url){
 const origin=new URL(pageContext.url).origin;
 if(origin!=='https://keyescape.com'){
  if(notify){$('newRule').onclick();$('siteInput').value=origin;if(config.sites.includes(origin))$('site').value=origin;message('일반 응답 규칙 편집기를 열었습니다. 사이트를 등록하고 요청 URL과 응답 조건을 설정하세요.');}
  return;
 }
 $('quickPage').value=pageContext.url;if(notify)message('확장 팝업에서 선택한 페이지 주소를 입력했습니다.');}else if(notify)message('예약 페이지에서 확장 팝업 → 설정 변경을 눌러주세요. 또는 예약 페이지 주소를 직접 붙여넣으세요.');}
$('useCurrent').onclick=async()=>{resetQuick();await useCurrent();};
$('newQuick').onclick=async()=>{resetQuick();await useCurrent(false);};
$('clearScope').onclick=()=>{scopeCleared=true;$('scopeBox').hidden=true;message('저장하면 테마 범위 제한이 해제됩니다.');};
function resetQuick(){quickEditing=null;$('quickTitle').textContent='기본 템플릿 · 키이스케이프';$('quickPage').value='';$('quickName').value='';$('quickReplacement').value='';$('quickResult').textContent='';}
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&changes.pageContext){if(!quickEditing&&!$('quickName').value&&!$('quickReplacement').value)useCurrent(false);else message('다른 페이지에서 설정을 열었습니다. 새 설정을 만들려면 현재 페이지 사용을 누르세요. 기존 편집 내용은 유지했습니다.');}});
function quickRule(){let replacement;if($('quickAction').value==='replace'){try{replacement=JSON.parse($('quickReplacement').value);}catch{throw Error('교체할 응답에 전체 JSON을 붙여넣으세요. 중괄호와 쉼표를 확인해주세요.');}}return XRUX.preset({page:$('quickPage').value,name:$('quickName').value,action:$('quickAction').value,replacement});}
function quickPreview(){const rule=quickRule();$('quickResult').textContent=rule.action==='replace'?XRUX.summary(rule.replacement):'성공 응답의 시간대 목록을 유지하고 선택 상태만 변경합니다.';$('quickResult').className='success';return rule;}
$('quickPreview').onclick=()=>{try{quickPreview();message('');}catch(e){message(e.message);}};
$('quickSave').onclick=async()=>{try{const rule=quickPreview();const granted=await chrome.permissions.request({origins:[rule.site+'/*']});if(!granted)throw Error('사이트 권한이 허용되지 않아 저장하지 않았습니다.');if(!config.sites.includes(rule.site))config.sites.push(rule.site);rule.id=quickEditing||crypto.randomUUID();const i=config.rules.findIndex(r=>r.id===rule.id);if(i<0)config.rules.unshift(rule);else{config.rules.splice(i,1);config.rules.unshift(rule);}await persist(true);quickEditing=rule.id;$('quickTitle').textContent='편집 중: '+rule.name;message('저장하고 켰습니다. 이 설정을 우선 적용합니다. 예약 페이지를 새로고침한 뒤 날짜를 선택하세요.');}catch(e){message(e.message);}};
const openBranches=new Set(),closedSites=new Set();
$('ruleSearch').oninput=renderQuick;
$('collapseRules').onclick=()=>{openBranches.clear();for(const r of config.rules)closedSites.add(r.site||'');$('ruleSearch').value='';renderQuick();};
function renderQuick(){
 const host=$('quickRules');host.replaceChildren();
 const query=$('ruleSearch').value.trim().toLocaleLowerCase();
 const sites=new Map();
 for(const r of config.rules){const site=r.site||'';if(!sites.has(site))sites.set(site,[]);sites.get(site).push(r);}
 $('ruleCount').textContent=sites.size+'개 사이트 · '+config.rules.length+'개 설정';
 $('globalState').textContent=config.enabled?'전체 응답 교체가 켜져 있습니다.':'전체 응답 교체 OFF · 저장된 설정은 현재 적용되지 않습니다.';
 for(const [site,allRules] of sites){
  const rules=allRules.filter(r=>!query||(site+' '+r.name).toLocaleLowerCase().includes(query));if(!rules.length)continue;
  const section=document.createElement('details');section.className='site-group';section.open=!!query||!closedSites.has(site);
  section.ontoggle=()=>{if(!query&&section.isConnected){if(section.open)closedSites.delete(site);else closedSites.add(site);}};
  const summary=document.createElement('summary');const label=document.createElement('strong');label.textContent=site||'사이트 미지정';
  const meta=document.createElement('span');meta.className='site-meta';const count=document.createElement('span');count.textContent=(query?rules.length+'/'+allRules.length:allRules.length)+'개 설정';
  const status=document.createElement('span');const enabled=allRules.filter(r=>r.enabled).length;
  status.textContent=!config.sites.includes(site)?'사이트 미등록':!config.enabled?'전체 OFF':enabled?'적용 켜짐 '+enabled+'개':'모두 꺼짐';status.className='site-status';
  meta.append(count,status);summary.append(label,meta);section.append(summary);
  const groups=new Map();
  for(const r of rules){const branch=site==='https://keyescape.com'&&r.action==='weekdayFallback'?r.name.split(' · ')[0]:'';if(!groups.has(branch))groups.set(branch,[]);groups.get(branch).push(r);}
  for(const [branch,items] of groups){
   if(!branch){for(const r of items)section.append(ruleRow(r));continue;}
   const key=site+'|'+branch;const group=document.createElement('details');group.className='rule-group';group.open=!!query||openBranches.has(key);
   group.ontoggle=()=>{if(!query&&group.isConnected){if(group.open)openBranches.add(key);else openBranches.delete(key);}};
   const heading=document.createElement('summary');const name=document.createElement('strong');name.textContent=branch;const count=document.createElement('span');count.className='muted';count.textContent=items.length+'개';heading.append(name,count);group.append(heading);
   for(const r of items)group.append(ruleRow(r));section.append(group);
  }host.append(section);
 }
 if(!host.childElementCount)host.textContent=query?'검색 결과가 없습니다.':'아직 저장한 설정이 없습니다.';
}
function ruleRow(r){
   const row=document.createElement('div');row.className='rule-row';
   const info=document.createElement('div');info.className='rule-info';const title=document.createElement('strong');
   title.textContent=r.action==='weekdayFallback'?r.name.split(' · ').slice(1,-1).join(' · '):r.name;info.append(title);
   const subtitle=document.createElement('small');subtitle.textContent=r.action==='weekdayFallback'?'이전 같은 요일 시간표':'응답 변경 규칙';info.append(subtitle);
   if(r.action==='weekdayFallback'){
    const days=new Set(r.samples.map(s=>new Date(s.date+'T00:00:00Z').getUTCDay()));const week=document.createElement('div');week.className='weekdays';
    for(const [day,label] of [[1,'월'],[2,'화'],[3,'수'],[4,'목'],[5,'금'],[6,'토'],[0,'일']]){const cell=document.createElement('span');cell.textContent=label;cell.className=days.has(day)?'available':'missing';cell.title=label+'요일 '+(days.has(day)?'원본 확보':'원본 미확보');cell.setAttribute('aria-label',cell.title);week.append(cell);}info.append(week);
   }
   const actions=document.createElement('div');actions.className='rule-actions';
   const toggle=button(r.enabled?'켜짐':'꺼짐',async()=>{r.enabled=!r.enabled;await persist();message('설정을 '+(r.enabled?'켰습니다.':'껐습니다.')+(config.enabled?'':' 전체 응답 교체는 OFF입니다.'));});toggle.className='rule-toggle';toggle.setAttribute('aria-pressed',String(r.enabled));toggle.setAttribute('aria-label',title.textContent+' 활성화');
   actions.append(toggle,button('편집',()=>{fill(r);$('editorTitle').scrollIntoView({block:'start'});}));row.append(info,actions);return row;

}

$('restoreDefaults').onclick = async () => {
 const control = $('restoreDefaults');
 if (control.disabled) return;
 control.disabled = true;
 try {
  const granted = await chrome.permissions.request({origins: ['https://keyescape.com/*']});
  if (!granted) throw Error('사이트 접근 권한이 필요합니다.');
  const result = await chrome.runtime.sendMessage({type: 'siteSetting', site: 'https://keyescape.com', setting: 'restoreDefaults'});
  if (!result?.ok) throw Error(result?.error || '확장 프로그램을 새로고침한 뒤 다시 시도해주세요.');
  config = result.config;
  baseline = structuredClone(config);
  render();
  renderQuick();
  message('기본 규칙 복원 완료. 기존 규칙은 유지했습니다.');
 } catch (error) {
  message(error.message);
 } finally {
  control.disabled = false;
 }
};

// Bundled Play33 controls are a site feature, not an XHR replacement rule.
function renderPlay33Status(current){
 const registered=current.sites.includes('https://play33.kr');
 $('enablePlay33').disabled=registered;
 $('enablePlay33').textContent=registered?'플레이33 등록됨':'플레이33 사용';
 $('play33DefaultState').textContent=registered
  ? '사용 준비 완료 · 예약 정보 입력 페이지를 새로고침하세요.'
  : '4개 지점 · 10개 테마 기본 제공 · 사이트 접근 권한을 허용하면 사용할 수 있습니다.';
}
for(const branch of XRPlay33Catalog.branches){
 const group=document.createElement('div');
 const heading=document.createElement('h3');heading.textContent=branch.name;group.append(heading);
 for(const theme of branch.themes){
  const item=document.createElement('details'),summary=document.createElement('summary');
  summary.textContent=`${theme.name} · branch=${branch.id}, theme=${theme.id}`;item.append(summary);
  const weekday=document.createElement('p');weekday.textContent='월~목·금: '+theme.weekday.join(', ');
  const weekend=document.createElement('p');weekend.textContent='토·일: '+theme.weekend.join(', ');
  item.append(weekday,weekend);group.append(item);
 }
 $('play33Catalog').append(group);
}
$('enablePlay33').onclick=async()=>{
 const control=$('enablePlay33');if(control.disabled)return;control.disabled=true;
 try{
  const granted=await chrome.permissions.request({origins:['https://play33.kr/*']});
  if(!granted)throw Error('사이트 접근 권한이 허용되지 않았습니다.');
  const result=await chrome.runtime.sendMessage({type:'siteSetting',site:'https://play33.kr',setting:'register'});
  if(!result?.ok)throw Error(result?.error||'사이트 등록에 실패했습니다. 확장 프로그램을 새로고침해주세요.');
  config=result.config;baseline=structuredClone(config);render();renderQuick();
  message('플레이33을 등록했습니다. 예약 정보 입력 페이지를 새로고침하세요. 응답 규칙을 만들 필요는 없습니다.');
 }catch(error){message(error.message);control.disabled=false;}
};
chrome.storage.onChanged.addListener((changes,area)=>{
 if(area==='local'&&changes.config?.newValue)renderPlay33Status(changes.config.newValue);
});
