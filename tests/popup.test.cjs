const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

async function popup(sendMessage, options = {}) {
  const elements = new Map();
  let polling = false, tick;
  const context = {
    URL,
    document: {getElementById(id) {
      if (!elements.has(id)) elements.set(id, {textContent: '', checked: false});
      return elements.get(id);
    }},
    chrome: {
      tabs: {query: async () => [{id: 1, url: options.url || 'https://keyescape.com/reservation1.php'}],
        sendMessage: options.pageState || (async () => { throw Error('no content script'); })},
      storage: {session: {set: async () => {}}, local: {get: async () => ({config: options.config || {enabled: false, sites: [], rules: []}})}},
      runtime: {sendMessage},
      permissions: {request: options.requestPermission || (async () => true)}
    },
    setInterval(callback) { polling = true; tick = callback; }
  };
  await vm.runInNewContext(fs.readFileSync('popup.js', 'utf8'), context);
  return {elements, polling, tick};
}

test('site-specific controls appear only on their own origin',async()=>{
 for(const [url,dateVisible,playVisible] of [
  ['https://www.google.com',false,false],
  ['https://keyescape.com',true,false],
  ['https://play33.kr/reservation/create',false,true],
  ['chrome://extensions',false,false]
 ]){
  const {elements}=await popup(async()=>({ok:true}),{url});
  assert.equal(elements.get('dateUnlockFeature').hidden,!dateVisible,url);
  assert.equal(elements.get('play33Feature').hidden,!playVisible,url);
 }
});

test('missing startup reply shows reload instructions and still initializes popup', async () => {
  const {elements, polling} = await popup(async () => undefined);
  assert.match(elements.get('popupMessage').textContent, /chrome:\/\/extensions/);
  assert.match(elements.get('rule').textContent, /사용 중인 규칙 없음/);
  assert.equal(polling, true);
});

test('quick add registers the exact current origin after permission, without enabling responses',async()=>{
 const calls=[],config={enabled:false,sites:[],rules:[]};
 const f=await popup(async m=>{calls.push(m);if(m.type==='siteSetting')config.sites.push(m.site);return {ok:true};},{config,url:'https://play33.kr/reservation/create#content',requestPermission:async p=>{calls.push(p);return true;}});
 await f.elements.get('addCurrentSite').onclick();
 assert.deepEqual(JSON.parse(JSON.stringify(calls.slice(1))),[{origins:['https://play33.kr/*']},{type:'siteSetting',site:'https://play33.kr',setting:'register'}]);
 assert.equal(config.enabled,false);assert.equal(f.elements.get('addCurrentSite').disabled,true);
 assert.match(f.elements.get('addCurrentSite').textContent,/등록됨/);
 assert.equal(f.elements.get('reload').hidden,false);
 assert.equal(f.elements.get('play33Feature').hidden,false);
});

test('quick add keeps config unchanged when permission is denied and excludes internal pages',async()=>{
 const messages=[];
 const denied=await popup(async m=>{messages.push(m);return {ok:true};},{requestPermission:async()=>false});
 await denied.elements.get('addCurrentSite').onclick();
 assert.equal(messages.length,1);assert.match(denied.elements.get('popupMessage').textContent,/권한/);
 const internal=await popup(async()=>({ok:true}),{url:'chrome://extensions'});
 assert.equal(internal.elements.get('addCurrentSite').disabled,true);
});

test('Play33 panel status is visible independently of response rules',async()=>{
 const f=await popup(async()=>({ok:true}),{url:'https://play33.kr/reservation/create',config:{enabled:false,sites:['https://play33.kr'],rules:[]},pageState:async()=>({ready:true,enabled:false,antiDebug:{ready:true,active:true},play33:{ready:true,active:true}})});
 assert.match(f.elements.get('play33State').textContent,/적용 중/);
 assert.equal(f.elements.get('enabled').checked,false);
});

test('missing site setting reply shows reload instructions and restores checkbox', async () => {
  const {elements} = await popup(async message => message.type === 'sync' ? {ok: true} : undefined);
  const toggle = elements.get('antiDebugToggle');
  toggle.checked = true;
  await toggle.onchange();
  assert.match(elements.get('popupMessage').textContent, /chrome:\/\/extensions/);
  assert.equal(toggle.checked, false);
  assert.equal(toggle.disabled, false);
});

test('missing global switch reply shows reload instructions', async () => {
  const {elements} = await popup(async message => message.type === 'sync' ? {ok: true} : undefined);
  await elements.get('enabled').onchange();
  assert.match(elements.get('state').textContent, /chrome:\/\/extensions/);
});

test('startup transport failure does not prevent popup initialization', async () => {
  const {elements, polling} = await popup(async () => { throw Error('connection failed'); });
  assert.equal(elements.get('popupMessage').textContent, 'connection failed');
  assert.equal(polling, true);
});

test('background setting errors are preserved', async () => {
  const {elements} = await popup(async message => message.type === 'sync' ? {ok: true} : {ok: false, error: '저장 실패'});
  await elements.get('antiDebugToggle').onchange();
  assert.equal(elements.get('popupMessage').textContent, '저장 실패');
});


test('polling retains applied labels while awaiting page state, then shows actual reload requirement', async () => {
  let pending, delayed = false;
  const applied = {ready: true, enabled: true, antiDebug: {ready: true, active: true}, dateUnlock: {ready: true, active: true}};
  const {elements, tick} = await popup(async () => ({ok: true}), {
    config: {enabled: true, sites: ['https://keyescape.com'], rules: []},
    pageState: () => delayed ? new Promise(resolve => { pending = resolve; }) : Promise.resolve(applied)
  });
  assert.equal(elements.get('dateUnlockState').textContent, '적용 중');
  assert.equal(elements.get('antiDebugState').textContent, '적용 중');
  delayed = true;
  const refresh = tick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.get('dateUnlockState').textContent, '적용 중');
  assert.equal(elements.get('antiDebugState').textContent, '적용 중');
  pending({...applied, antiDebug: {...applied.antiDebug, reloadRequired: true}});
  await refresh;
  assert.equal(elements.get('dateUnlockState').textContent, '적용 중');
  assert.equal(elements.get('antiDebugState').textContent, '새로고침 필요');
  assert.equal(elements.get('reload').hidden, false);
});
