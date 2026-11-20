(function(root) {
  'use strict';
  const MAX_BYTES = 2 * 1024 * 1024;
  const clone = value => JSON.parse(JSON.stringify(value));
  function check(ok) { if (!ok) throw Error('시간표 데이터 형식이 올바르지 않습니다.'); }
  function object(value, keys, required = keys) {
    check(value && typeof value === 'object' && !Array.isArray(value));
    check(Object.keys(value).every(key => keys.includes(key)) && required.every(key => Object.hasOwn(value, key)));
  }
  const string = (value, max = 1024) => typeof value === 'string' && value.length <= max;
  const positive = value => Number.isSafeInteger(value) && value > 0;
  const keyOf = value => value.zizumNum + ':' + value.themeNum;
  function date(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  }
  function validateFeed(value, bundledRules) {
    check(new TextEncoder().encode(JSON.stringify(value)).length <= MAX_BYTES);
    object(value, ['schemaVersion','dataVersion','themes']);
    check(value.schemaVersion === 1 && positive(value.dataVersion));
    check(Array.isArray(value.themes) && value.themes.length > 0 && value.themes.length <= 35);
    const allowed = new Set(bundledRules.map(rule => keyOf(rule.requestParams))), themes = new Set();
    for (const theme of value.themes) {
      object(theme, ['zizumNum','themeNum','samples']);
      check([theme.zizumNum,theme.themeNum].every(v => typeof v === 'string' && /^\d+$/.test(v)));
      const key = keyOf(theme); check(allowed.has(key) && !themes.has(key)); themes.add(key);
      check(Array.isArray(theme.samples) && theme.samples.length > 0 && theme.samples.length <= 64);
      const dates = new Set();
      for (const sample of theme.samples) {
        object(sample, ['date','response','source'], ['date','response']);
        check(date(sample.date) && !dates.has(sample.date)); dates.add(sample.date);
        if (sample.source !== undefined) {
          object(sample.source, ['type','providedOn','dateBasis','verification'], []);
          check(Object.values(sample.source).every(v => string(v,256)));
        }
        object(sample.response, ['status','msg','data']);
        check(sample.response.status === true && string(sample.response.msg));
        const rows = sample.response.data, nums = new Set(), times = new Set();
        check(Array.isArray(rows) && rows.length > 0 && rows.length <= 64);
        for (const row of rows) {
          object(row, ['num','gubun','theme_num','hh','mm','sale_ck','sale_price','sale_doc','enable','sale_one','sale_txt']);
          check(positive(row.num) && positive(row.theme_num) && String(row.theme_num) === theme.themeNum);
          check(typeof row.hh === 'string' && /^(?:[01]\d|2[0-3])$/.test(row.hh));
          check(typeof row.mm === 'string' && /^[0-5]\d$/.test(row.mm));
          check(typeof row.gubun === 'string' && /^[A-Za-z0-9]{1,8}$/.test(row.gubun));
          check(['sale_ck','enable','sale_one'].every(k => ['Y','N'].includes(row[k])));
          check(typeof row.sale_price === 'number' && Number.isFinite(row.sale_price) && row.sale_price >= 0);
          check(string(row.sale_doc) && string(row.sale_txt));
          const time = row.hh + ':' + row.mm;
          check(!nums.has(row.num) && !times.has(time)); nums.add(row.num); times.add(time);
        }
      }
    }
    return clone(value);
  }
  function exportFeed(rules, dataVersion) {
    return validateFeed({schemaVersion:1, dataVersion, themes:rules.map(rule => ({
      zizumNum:rule.requestParams.zizumNum, themeNum:rule.requestParams.themeNum, samples:rule.samples
    }))}, rules);
  }
  function equal(a,b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b,k) && equal(a[k],b[k]));
  }
  function sameManaged(a,b) {
    if (!a || !b) return false;
    const fields = r => Object.fromEntries(Object.entries(r).filter(([k]) => !['name','enabled'].includes(k)));
    return equal(fields(a),fields(b));
  }
  function mergeFeed(config, state, input, bundledRules) {
    const feed = validateFeed(input,bundledRules);
    if (state?.dataVersion > feed.dataVersion) throw Error('이전 시간표 버전은 적용하지 않습니다.');
    if (state?.dataVersion === feed.dataVersion) return {config, state};
    const baselines = clone(state?.baselines || Object.fromEntries(bundledRules.map(r => [r.id,r])));
    const protectedIds = new Set(state?.protectedRuleIds || []);
    const themes = new Map(feed.themes.map(t => [keyOf(t),t]));
    const defaults = new Map(bundledRules.map(r => [r.id,r]));
    const rules = config.rules.map(rule => {
      const bundled = defaults.get(rule.id);
      if (!bundled) return rule;
      if (protectedIds.has(rule.id) || !sameManaged(rule, baselines[rule.id])) {
        protectedIds.add(rule.id); return rule;
      }
      const theme = themes.get(keyOf(bundled.requestParams));
      if (!theme) return rule;
      const next = {...rule, samples:clone(theme.samples)};
      baselines[rule.id] = clone(next);
      return next;
    });
    const cachedThemes = new Map((state?.feed?.themes || []).map(t => [keyOf(t),t]));
    for (const theme of feed.themes) cachedThemes.set(keyOf(theme),theme);
    const cachedFeed = validateFeed({...feed,themes:[...cachedThemes.values()]},bundledRules);
    return {config:{...config,rules}, state:{...state, schemaVersion:1, dataVersion:feed.dataVersion,
      feed:cachedFeed, baselines, protectedRuleIds:[...protectedIds]}};
  }
  const api = {MAX_BYTES, validateFeed, exportFeed, equal, sameManaged, mergeFeed};
  if (typeof module !== 'undefined') module.exports = api; else root.XRTimetableCore = api;
})(globalThis);
