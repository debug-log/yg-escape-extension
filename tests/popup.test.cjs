const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

async function popup(sendMessage) {
  const elements = new Map();
  let polling = false;
  const context = {
    URL,
    document: {getElementById(id) {
      if (!elements.has(id)) elements.set(id, {textContent: '', checked: false});
      return elements.get(id);
    }},
    chrome: {
      tabs: {query: async () => [{id: 1, url: 'https://keyescape.com/reservation1.php'}],
        sendMessage: async () => { throw Error('no content script'); }},
      storage: {session: {set: async () => {}}, local: {get: async () => ({config: {enabled: false, sites: [], rules: []}})}},
      runtime: {sendMessage},
      permissions: {request: async () => true}
    },
    setInterval() { polling = true; }
  };
  await vm.runInNewContext(fs.readFileSync('popup.js', 'utf8'), context);
  return {elements, polling};
}

test('missing startup reply shows reload instructions and still initializes popup', async () => {
  const {elements, polling} = await popup(async () => undefined);
  assert.match(elements.get('popupMessage').textContent, /chrome:\/\/extensions/);
  assert.match(elements.get('rule').textContent, /사용 중인 규칙 없음/);
  assert.equal(polling, true);
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
