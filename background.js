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

async function sync() {
  let {config} = await chrome.storage.local.get('config');
  if (!config) {
    config = initial;
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
    {id: 'xr-bridge', matches, js: ['date-unlock.js', 'bridge.js'], runAt: 'document_start', world: 'ISOLATED', allFrames: true},
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

chrome.runtime.onInstalled.addListener(syncSafely);
chrome.runtime.onStartup.addListener(syncSafely);
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
  if (message.type === 'save' || message.type === 'enabled') {
    enqueue(() => saveConfig(message)).then(config => reply({ok: true, config}), replyError);
    return true;
  }
});
