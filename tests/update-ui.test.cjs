const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const U = require('../update-core.js');

// Only browser/IO boundaries are replaced; the shipping controller runs intact.
async function fixture(options = {}) {
  const elements = Object.fromEntries([
    'version', 'releaseStatus', 'check', 'choose', 'chooseInitial', 'install', 'finish',
    'recover', 'reloadPage', 'folder', 'progress', 'error', 'updateTitle', 'setup',
    'reloadOptions', 'reloadHint', 'folderSettings', 'steps', 'stageDownload',
    'stageVerify', 'stageApply', 'stageRestart'
  ].map(id => [id, {textContent: '', hidden: false, disabled: false, checked: id === 'reloadPage',
    open: false, dataset: {}, setAttribute(name, value) { this[name] = value; },
    removeAttribute(name) { delete this[name]; }, focus() { if (!this.disabled) this.focused = true; }}]));
  const directory = {name: 'installed', queryPermission: async () => 'granted'};
  const data = {directory: options.noDirectory ? undefined : directory, journal: options.journal};
  const local = {updateResult: options.result};
  const target = {id: 7, url: 'https://example.com/page'};
  let result = options.releaseResult || {release: {version: '1.4.5'}};
  let downloads = 0, restarts = 0;
  const context = {
    URL, TextDecoder, navigator: {userAgent: 'Chrome/140.0', locks: {request: async (name, opts, action) => action(options.locked ? null : {})}},
    document: {getElementById: id => elements[id]},
    location: {href: 'chrome-extension://test/update.html' + (options.query || '')},
    window: {addEventListener() {}, removeEventListener() {}},
    XREUpdate: {...U, checkRelease: async () => result, verifyDirectory: async () => {},
      readFile: async () => new TextEncoder().encode(JSON.stringify({version: data.journal?.state === 'partial' && options.manifestBlocked ? '1.4.4' : data.journal ? '1.4.5' : '1.4.4'})),
      downloadRelease: async () => { downloads++; await options.downloadGate; return new Uint8Array(); },
      parsePackage: async () => ({version: '1.4.5', manifest: {}}),
      applyPackage: async () => { data.journal = {state: options.partial ? 'partial' : 'committed', version: '1.4.5', failures: options.partial ? [{name:'update.js',error:'Failed to perform Safe Browsing check.'}] : []}; return data.journal; }},
    XREUpdateCache: {},
    XREUpdateStore: {get: async k => data[k], set: async (k, v) => {data[k] = v;}, delete: async k => {delete data[k];}},
    showDirectoryPicker: async () => {if (options.cancelPicker) throw new DOMException('cancel', 'AbortError'); return directory;},
    chrome: {runtime: {getManifest: () => ({version: '1.4.4'}), getURL: p => 'chrome-extension://test/' + p, reload: () => {restarts++;}},
      tabs: {get: async () => {if (options.closedTarget) throw Error('closed'); return {id: 7, url: options.movedTarget ? 'https://example.com/other' : target.url};}},
      storage: {session: {get: async () => ({updateTarget: options.noTarget ? null : target})},
        local: {get: async () => local, set: async x => Object.assign(local, x)}}}
  };
  const source = fs.readFileSync('update.js', 'utf8');
  await vm.runInNewContext(source, context);
  return {elements, data, local, setResult: value => {result = value;}, get downloads() {return downloads;}, get restarts() {return restarts;}};
}

test('latest version hides installation controls but retains recheck', async () => {
  const f = await fixture({releaseResult: {release: {version: '1.4.4'}}});
  assert.equal(f.elements.install.hidden, true);
  assert.equal(f.elements.reloadOptions.hidden, true);
  assert.equal(f.elements.check.disabled, false);
  assert.match(f.elements.updateTitle.textContent, /최신/);
});

test('available update keeps connected folder quiet and displays version transition', async () => {
  const f = await fixture();
  assert.equal(f.elements.install.hidden, false);
  assert.equal(f.elements.install.disabled, false);
  assert.match(f.elements.version.textContent, /1\.4\.4.*1\.4\.5/);
  assert.equal(f.elements.folderSettings.open, false);
  assert.equal(f.elements.setup.hidden, true);
});

test('first folder connection leads to install without downloading automatically', async () => {
  const f = await fixture({noDirectory: true});
  assert.equal(f.elements.setup.hidden, false);
  assert.equal(f.elements.install.hidden, true);
  await f.elements.chooseInitial.onclick();
  assert.equal(f.elements.setup.hidden, true);
  assert.equal(f.elements.install.hidden, false);
  assert.equal(f.elements.install.disabled, false);
  assert.equal(f.elements.install.focused, true);
  assert.equal(f.downloads, 0);
});

test('settings entry explains why page reload is unavailable despite a stored target', async () => {
  const f = await fixture({query: '?settings=1'});
  assert.equal(f.elements.reloadPage.disabled, true);
  assert.equal(f.elements.reloadPage.checked, false);
  assert.match(f.elements.reloadHint.textContent, /연결되지/);
  assert.match(f.elements.reloadHint.textContent, /확장 아이콘/);
});

test('popup entry identifies the target and preserves opt-out through rechecks', async () => {
  const f = await fixture();
  assert.equal(f.elements.reloadPage.disabled, false);
  assert.equal(f.elements.reloadPage.checked, true);
  assert.match(f.elements.reloadHint.textContent, /example\.com/);
  f.elements.reloadPage.checked = false;
  await f.elements.check.onclick();
  assert.equal(f.elements.reloadPage.checked, false);
  await f.elements.install.onclick();
  assert.equal(f.local.updatePending.target, null);
  assert.equal(f.restarts, 1);
});

test('missing, closed and moved originating tabs do not offer reload', async () => {
  for (const opts of [{noTarget: true}, {closedTarget: true}, {movedTarget: true}]) {
    const f = await fixture(opts);
    assert.equal(f.elements.reloadPage.disabled, true);
    assert.equal(f.elements.reloadPage.checked, false);
    assert.ok(f.elements.reloadHint.textContent.length > 0);
  }
});

test('failed recheck labels cached release and prevents installing it until recheck succeeds', async () => {
  const f = await fixture({releaseResult: {release: {version: '1.4.5'}, error: 'offline'}});
  assert.match(f.elements.releaseStatus.textContent, /offline/);
  assert.match(f.elements.releaseStatus.textContent, /이전/);
  assert.equal(f.elements.install.disabled, true);
  f.setResult({release: {version: '1.4.5'}});
  await f.elements.check.onclick();
  assert.equal(f.elements.install.disabled, false);
});

test('interrupted update prioritizes recovery over a normal installation', async () => {
  const f = await fixture({journal: {state: 'committed', version: '1.4.5'}});
  assert.equal(f.elements.finish.hidden, false);
  assert.equal(f.elements.recover.hidden, false);
  assert.equal(f.elements.install.hidden, true);
  assert.match(f.elements.updateTitle.textContent, /완료되지/);
});

test('completion hides install options and reports actual page reload result', async () => {
  for (const pageReloaded of [true, false]) {
    const f = await fixture({query: '?complete=1', result: {ok: true, version: '1.4.4', pageReloaded},
      releaseResult: {release: {version: '1.4.4'}}, journal: {state: 'committed', version: '1.4.4'}});
    assert.equal(f.data.journal, undefined);
    assert.match(f.elements.updateTitle.textContent, /완료/);
    assert.match(f.elements.progress.textContent, pageReloaded ? /새로고침했습니다/ : /새로고침하지 않았습니다/);
    assert.equal(f.elements.reloadOptions.hidden, true);
  }
});

test('download stage disables all actions and a second install cannot start', async () => {
  let resume;
  const downloadGate = new Promise(resolve => {resume = resolve;});
  const f = await fixture({downloadGate});
  const running = f.elements.install.onclick();
  for (let i = 0; i < 20 && f.downloads === 0; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.elements.install.disabled, true);
  assert.equal(f.elements.choose.disabled, true);
  assert.equal(f.elements.stageDownload['aria-current'], 'step');
  await f.elements.install.onclick();
  assert.equal(f.downloads, 1);
  resume(); await running;
  assert.equal(f.local.updatePending.target.id, 7);
});

test('a lock refusal is recoverable without losing the update action', async () => {
  const f = await fixture({locked: true});
  await f.elements.install.onclick();
  assert.match(f.elements.error.textContent, /다른 업데이트 탭/);
  assert.equal(f.elements.install.disabled, false);
  assert.equal(f.downloads, 0);
});

test('cancelled initial folder picker keeps setup available', async () => {
  const f = await fixture({noDirectory: true, cancelPicker: true});
  await f.elements.chooseInitial.onclick();
  assert.equal(f.elements.setup.hidden, false);
  assert.equal(f.elements.chooseInitial.disabled, false);
  assert.equal(f.data.directory, undefined);
});

test('partial application restarts and persists only failed files for the notice',async()=>{
 const f=await fixture({partial:true});await f.elements.install.onclick();
 assert.equal(f.restarts,1);assert.equal(f.local.updatePending.version,'1.4.5');
 assert.equal(f.local.updatePartial.failures.length,1);
 assert.equal(f.local.updatePartial.failures[0].name,'update.js');
 assert.equal(f.data.journal.state,'partial');
});

test('blocked manifest restarts the actual disk version without claiming the target version loaded',async()=>{
 const f=await fixture({partial:true,manifestBlocked:true});await f.elements.install.onclick();
 assert.equal(f.restarts,1);assert.equal(f.local.updatePending.version,'1.4.4');
 assert.equal(f.local.updatePartial.version,'1.4.5');
});

test('partial completion keeps repair available and never displays complete success',async()=>{
 const f=await fixture({query:'?complete=1',result:{ok:true,version:'1.4.4'},
  journal:{state:'partial',version:'1.4.4',failures:[{name:'update.js',error:'blocked'}]},
  releaseResult:{release:{version:'1.4.4'}}});
 assert.match(f.elements.updateTitle.textContent,/일부 파일 미적용/);
 assert.equal(f.elements.install.hidden,false);assert.equal(f.elements.install.disabled,false);
 assert.equal(f.data.journal.state,'partial');
 assert.doesNotMatch(f.elements.progress.textContent,/적용 완료/);
});
