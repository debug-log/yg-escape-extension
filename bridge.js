(() => {
  let state = {ready: false, enabled: false, count: 0};
  let antiDebug = {ready: false, active: false, reloadRequired: false, error: false};
  let revision = 0;

  async function publish() {
    const version = ++revision;
    const {config = {enabled: false, sites: [], rules: []}} = await chrome.storage.local.get('config');
    if (version !== revision) return;

    const registered = config.sites.includes(location.origin);
    if (typeof XRDateUnlock !== 'undefined') XRDateUnlock.configure(config);
    if (typeof XRPlay33 !== 'undefined') XRPlay33.configure(config);
    window.postMessage({
      source: 'xr-editor-bridge',
      type: 'config',
      antiDebug: {
        enabled: registered && !(config.antiDebugDisabledSites || []).includes(location.origin)
      },
      config: {
        enabled: window === window.top && config.enabled && registered,
        rules: config.rules.filter(rule => rule.site === location.origin)
      }
    }, location.origin);
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'state') return;
    const data = event.data;
    if (data.source === 'xr-anti-debug') {
      antiDebug = {
        ready: data.ready === true,
        active: data.active === true,
        reloadRequired: data.reloadRequired === true,
        error: data.error === true
      };
      if (!antiDebug.ready) publish();
      return;
    }
    if (data.source !== 'xr-editor-hook') return;

    const wasNotReady = !state.ready;
    state = {
      ready: data.ready === true,
      enabled: data.enabled === true,
      count: Number.isSafeInteger(data.count) ? data.count : 0,
      last: data.last && typeof data.last === 'object' ? {
        at: Number(data.last.at),
        ruleId: String(data.last.ruleId).slice(0, 100),
        items: Number.isSafeInteger(data.last.items) ? data.last.items : null
      } : null
    };
    if (wasNotReady && !state.ready) publish();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.config) publish();
  });
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message.type === 'state') {
      reply({
        ...state,
        antiDebug,
        dateUnlock: typeof XRDateUnlock !== 'undefined' ? XRDateUnlock.getState() : null
      });
    }
  });
  window.postMessage({source: 'xr-editor-bridge', type: 'ping'}, location.origin);
  publish();
})();
