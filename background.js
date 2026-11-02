importScripts('settings.js');

const initial = {
  enabled: false,
  keyescapeDateUnlockEnabled: true,
  sites: [],
  antiDebugDisabledSites: [],
  rules: [{
    id: 'example',
    name: '예제: 시간대 enable 변경',
    site: 'https://keyescape.com',
    enabled: false,
    url: 'run_proc.php',
    match: 'contains',
    method: 'ANY',
    conditions: [{path: 'status', op: 'equals', value: true}],
    action: 'patch',
    patches: [{path: 'data[*].enable', value: 'Y'}]
  }]
};
let queue = Promise.resolve();
const KEYESCAPE_DEFAULTS_VERSION = 2;

async function addDefaultRules(config) {
  const response = await fetch(chrome.runtime.getURL('keyescape-weekday-fallback-rules.json'));
  if (!response.ok) throw Error('기본 규칙 파일을 불러오지 못했습니다.');
  const {rules} = await response.json();
  if (!Array.isArray(rules) || rules.length !== 34) throw Error('기본 규칙 파일을 확인해주세요.');
  const defaultsById = new Map(rules.map(rule => [rule.id, rule]));
  const merged = config.rules.map(rule => {
    const bundled = defaultsById.get(rule.id);
    if (!bundled) return rule;
    const samples = rule.samples || [];
    const dates = new Set(samples.map(sample => sample.date));
    return {...rule, samples: [...samples,
      ...bundled.samples.filter(sample => !dates.has(sample.date))]
      .sort((a, b) => a.date.localeCompare(b.date))};
  });
  const existing = new Set(merged.map(rule => rule.id));
  return {...config, keyescapeDefaultsVersion: KEYESCAPE_DEFAULTS_VERSION,
    rules: [...merged, ...rules.filter(rule => !existing.has(rule.id))]};
}

async function sync() {
  let {config} = await chrome.storage.local.get('config');
  if (!config) {
    config = initial;
    await chrome.storage.local.set({config});
  }

  // Seed once on installation/upgrade. Subsequent user deletions stay deleted.
  if (config.keyescapeDefaultsVersion !== KEYESCAPE_DEFAULTS_VERSION) {
    config = await addDefaultRules(config);
    await chrome.storage.local.set({config});
  }

  const allowed = [];
  for (const site of config.sites) {
    if (await chrome.permissions.contains({origins: [site + '/*']})) allowed.push(site);
  }
  const exceptions = (config.antiDebugDisabledSites || []).filter(site => allowed.includes(site));
  const sitesChanged = allowed.length !== config.sites.length;
  const exceptionsChanged = JSON.stringify(exceptions) !== JSON.stringify(config.antiDebugDisabledSites);
  if (sitesChanged || exceptionsChanged) {
    config = {...config, sites: allowed, antiDebugDisabledSites: exceptions};
    await chrome.storage.local.set({config});
  }

  const current = await chrome.scripting.getRegisteredContentScripts();
  if (!allowed.length) {
    if (current.length) {
      await chrome.scripting.unregisterContentScripts({ids: current.map(script => script.id)});
    }
    return;
  }

  const matches = allowed.map(site => site + '/*');
  const scripts = [
    {id: 'xr-main', matches, js: ['engine.js', 'hook.js'], runAt: 'document_start', world: 'MAIN', allFrames: false},
    {id: 'xr-bridge', matches, js: ['date-unlock.js', 'opening.js', 'opening-ui.js', 'play33.js', 'bridge.js'], runAt: 'document_start', world: 'ISOLATED', allFrames: true},
    {id: 'xr-anti-main', matches, js: ['vendor/acorn.js', 'anti-debug.js'], runAt: 'document_start', world: 'MAIN', allFrames: true}
  ];
  const existing = new Set(current.map(script => script.id));
  const updates = scripts.filter(script => existing.has(script.id));
  const additions = scripts.filter(script => !existing.has(script.id));
  if (updates.length) await chrome.scripting.updateContentScripts(updates);
  if (additions.length) await chrome.scripting.registerContentScripts(additions);
}

function enqueue(task) {
  const job = queue.then(task);
  queue = job.catch(error => console.error('XHR editor', error));
  return job;
}

function schedule() {
  return enqueue(sync);
}

function syncSafely() {
  schedule().catch(() => {});
}

async function saveConfig(message) {
  const {config: current = initial} = await chrome.storage.local.get('config');
  const config = message.type === 'enabled'
    ? {...current, enabled: !!message.enabled}
    : mergeConfig(current, message.before, message.after);
  if (message.enable === true) config.enabled = true;
  await chrome.storage.local.set({config});
  await sync();
  return (await chrome.storage.local.get('config')).config;
}

async function saveSiteSettings(message) {
  const url = new URL(message.site);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== message.site) {
    throw Error('올바른 사이트 주소가 필요합니다.');
  }
  if (!['dateUnlock', 'play33', 'antiDebug', 'restoreDefaults', 'register'].includes(message.setting)
      || (message.setting === 'play33' && message.site !== 'https://play33.kr')
      || (['dateUnlock', 'restoreDefaults'].includes(message.setting) && message.site !== 'https://keyescape.com')) {
    throw Error('지원하지 않는 사이트 설정입니다.');
  }
  if (['dateUnlock', 'play33', 'antiDebug'].includes(message.setting) && typeof message.enabled !== 'boolean') {
    throw Error('설정 값을 확인해주세요.');
  }
  if (!await chrome.permissions.contains({origins: [message.site + '/*']})) {
    throw Error('사이트 접근 권한을 먼저 허용해주세요.');
  }
  const {config: current = initial} = await chrome.storage.local.get('config');
  let config = {...current, sites: [...new Set([...current.sites, message.site])]};
  if (message.setting === 'dateUnlock') config.keyescapeDateUnlockEnabled = message.enabled;
  if (message.setting === 'play33') config.play33Enabled = message.enabled;
  if (message.setting === 'antiDebug') {
    const disabled = new Set(config.antiDebugDisabledSites || []);
    if (message.enabled) disabled.delete(message.site);
    else disabled.add(message.site);
    config.antiDebugDisabledSites = [...disabled];
  }
  if (message.setting === 'restoreDefaults') config = await addDefaultRules(config);
  await chrome.storage.local.set({config});
  await sync();
  return (await chrome.storage.local.get('config')).config;
}

async function finishPendingUpdate() {
  const {updatePending: pending} = await chrome.storage.local.get('updatePending');
  if (!pending) return;
  const version = chrome.runtime.getManifest().version;
  const result = {version, ok: version === pending.version, pageReloaded: false, at: Date.now()};
  if (!result.ok) result.error = '기대한 버전으로 시작하지 못했습니다. 업데이트 화면에서 복구해주세요.';
  if (result.ok && Number.isInteger(pending.target?.id) && /^https?:\/\//.test(pending.target.url || '')) {
    try {
      const tab = await chrome.tabs.get(pending.target.id);
      if (tab.url === pending.target.url) {
        await chrome.tabs.reload(tab.id);
        result.pageReloaded = true;
      }
    } catch { /* The original tab may have been closed or lost its permission. */ }
  }
  await chrome.storage.local.set({updateResult: result});
  await chrome.storage.local.remove('updatePending');
  await chrome.tabs.create({url: chrome.runtime.getURL('update.html?complete=1')});
}

function startExtension() {
  schedule().then(finishPendingUpdate).catch(error => console.error('Extension startup', error));
}

chrome.runtime.onInstalled.addListener(startExtension);
chrome.runtime.onStartup.addListener(startExtension);
chrome.permissions.onRemoved.addListener(syncSafely);
chrome.permissions.onAdded.addListener(syncSafely);
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const extensionOrigin = 'chrome-extension://' + chrome.runtime.id + '/';
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(extensionOrigin)) return;

  const replyError = error => reply({ok: false, error: error.message});
  if (message.type === 'sync') {
    schedule().then(() => reply({ok: true}), replyError);
    return true;
  }
  if (message.type === 'siteSetting') {
    enqueue(() => saveSiteSettings(message)).then(config => reply({ok: true, config}), replyError);
    return true;
  }
  if (message.type === 'save' || message.type === 'enabled') {
    enqueue(() => saveConfig(message)).then(config => reply({ok: true, config}), replyError);
    return true;
  }
});
