(function(root) {
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

    next.sites = mergeList(current.sites, before.sites, after.sites);
    next.antiDebugDisabledSites = mergeList(
      current.antiDebugDisabledSites || [],
      before.antiDebugDisabledSites || [],
      after.antiDebugDisabledSites || []
    ).filter(site => next.sites.includes(site));

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

  if (typeof module !== 'undefined') module.exports = {mergeConfig};
  else root.mergeConfig = mergeConfig;
})(globalThis);
