(function(root) {
  const helperSites = ['https://keyescape.com', 'https://play33.kr'];
  function helperState(config, origin) {
    const key = origin === helperSites[0], play = origin === helperSites[1];
    return {
      supported: key || play,
      registered: config.sites.includes(origin),
      enabled: (key || play) && !(config.helperDisabledSites || []).includes(origin),
      opening: (key || play) && !(config.openingDisabledSites || []).includes(origin),
      dateUnlock: key && config.keyescapeDateUnlockEnabled !== false,
      timetable: key && (config.keyescapeTimetableEnabled ?? !!config.enabled),
      play33: play && config.play33Enabled !== false
    };
  }

  const bundledRuleIds = new Set([
    "keyescape-weekday-fallback-31-96",
    "keyescape-weekday-fallback-23-71",
    "keyescape-weekday-fallback-23-69",
    "keyescape-weekday-fallback-23-70",
    "keyescape-weekday-fallback-22-65",
    "keyescape-weekday-fallback-22-66",
    "keyescape-weekday-fallback-22-67",
    "keyescape-weekday-fallback-19-63",
    "keyescape-weekday-fallback-19-60",
    "keyescape-weekday-fallback-20-95",
    "keyescape-weekday-fallback-20-64",
    "keyescape-weekday-fallback-20-61",
    "keyescape-weekday-fallback-18-57",
    "keyescape-weekday-fallback-18-58",
    "keyescape-weekday-fallback-18-59",
    "keyescape-weekday-fallback-16-56",
    "keyescape-weekday-fallback-16-55",
    "keyescape-weekday-fallback-14-51",
    "keyescape-weekday-fallback-14-48",
    "keyescape-weekday-fallback-3-7",
    "keyescape-weekday-fallback-3-6",
    "keyescape-weekday-fallback-3-5",
    "keyescape-weekday-fallback-10-41",
    "keyescape-weekday-fallback-10-45",
    "keyescape-weekday-fallback-10-43",
    "keyescape-weekday-fallback-9-35",
    "keyescape-weekday-fallback-9-36",
    "keyescape-weekday-fallback-9-39",
    "keyescape-weekday-fallback-9-37",
    "keyescape-weekday-fallback-9-38",
    "keyescape-weekday-fallback-7-30",
    "keyescape-weekday-fallback-7-29",
    "keyescape-weekday-fallback-7-31",
    "keyescape-weekday-fallback-7-33"
]);
  const isBundledRule = rule => rule.site === helperSites[0] && bundledRuleIds.has(rule.id);
  function responseConfig(config, origin) {
    const helper = helperState(config, origin);
    const timetable = helper.registered && helper.enabled && helper.timetable;
    const rules = config.rules.filter(rule => rule.site === origin
      && (isBundledRule(rule) ? timetable : config.enabled));
    return {enabled: helper.registered && rules.some(rule => rule.enabled), rules};
  }

  // Apply only this editor's additions/removals, preserving other tabs' changes.
  function mergeList(current, before, after) {
    const retained = current.filter(value => !before.includes(value) || after.includes(value));
    const added = after.filter(value => !before.includes(value));
    return [...new Set([...retained, ...added])];
  }

  function mergeConfig(current, before, after) {
    const next = structuredClone(current);
    const dateUnlockChanged = (before.keyescapeDateUnlockEnabled !== false)
      !== (after.keyescapeDateUnlockEnabled !== false);
    next.keyescapeDateUnlockEnabled = dateUnlockChanged
      ? after.keyescapeDateUnlockEnabled !== false
      : current.keyescapeDateUnlockEnabled !== false;
    if (before.enabled !== after.enabled) next.enabled = after.enabled;
    for (const field of ['play33Enabled', 'keyescapeTimetableEnabled']) {
      if (before[field] !== after[field]) next[field] = after[field];
    }

    next.sites = mergeList(current.sites, before.sites, after.sites);
    next.antiDebugDisabledSites = mergeList(
      current.antiDebugDisabledSites || [],
      before.antiDebugDisabledSites || [],
      after.antiDebugDisabledSites || []
    ).filter(site => next.sites.includes(site));
    for (const field of ['helperDisabledSites', 'openingDisabledSites']) {
      next[field] = mergeList(current[field] || [], before[field] || [], after[field] || []);
    }

    const removed = new Set(
      before.rules.filter(rule => !after.rules.some(updated => updated.id === rule.id))
        .map(rule => rule.id)
    );
    const rules = new Map(
      current.rules.filter(rule => !removed.has(rule.id)).map(rule => [rule.id, rule])
    );
    for (const rule of after.rules) {
      const previous = before.rules.find(candidate => candidate.id === rule.id);
      if (JSON.stringify(previous) !== JSON.stringify(rule)) rules.set(rule.id, rule);
    }

    const beforeIds = before.rules.map(rule => rule.id);
    const afterIds = after.rules.map(rule => rule.id);
    const currentIds = current.rules.map(rule => rule.id);
    const reordered = JSON.stringify(beforeIds) !== JSON.stringify(afterIds);
    const order = reordered ? [...afterIds, ...currentIds] : [...currentIds, ...afterIds];
    next.rules = [...new Set(order)].filter(id => rules.has(id)).map(id => rules.get(id));
    return next;
  }

  const api = {mergeConfig, helperState, helperSites, responseConfig, isBundledRule};
  if (typeof module !== 'undefined') module.exports = api;
  else { root.XRSettings = api; root.mergeConfig = mergeConfig; }
})(globalThis);
