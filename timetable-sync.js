(function(root) {
  'use strict';
  const C = typeof module !== 'undefined' ? require('./timetable-core.js') : root.XRTimetableCore;
  const URL = 'https://raw.githubusercontent.com/debug-log/yg-escape-extension/refs/heads/main/data/keyescape-timetable.json';
  const KEY = 'keyescapeTimetable', ALARM = 'keyescape-timetable-sync';
  function createSync({chrome, fetch, enqueue, now = Date.now, bundledRules}) {
    let pending;
    async function ensureAlarm() {
      if (!await chrome.alarms.get(ALARM)) await chrome.alarms.create(ALARM,{periodInMinutes:360});
    }
    async function download() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(),15000);
      let reader;
      try {
        const response = await fetch(URL,{signal:controller.signal,credentials:'omit',redirect:'error',cache:'no-store'});
        if (!response.ok) throw Error('시간표 다운로드 실패: ' + response.status);
        if (Number(response.headers.get('content-length')) > C.MAX_BYTES) throw Error('시간표 파일이 너무 큽니다.');
        reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8',{fatal:true});
        let size = 0, text = '';
        while (true) {
          const {done,value} = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > C.MAX_BYTES) throw Error('시간표 파일이 너무 큽니다.');
          text += decoder.decode(value,{stream:true});
        }
        return JSON.parse(text + decoder.decode());
      } finally {
        clearTimeout(timer);
        controller.abort();
        if (reader) { reader.cancel().catch(() => {}); reader.releaseLock(); }
      }
    }
    async function run(force) {
      try {
        const shouldFetch = await enqueue(async () => {
          const {[KEY]:state = {}} = await chrome.storage.local.get(KEY);
          const age = now() - state.lastAttemptAt;
          if (!force && age >= 0 && age < 15 * 60 * 1000) return false;
          await chrome.storage.local.set({[KEY]:{...state,lastAttemptAt:now()}});
          return true;
        });
        if (!shouldFetch) return;
        const rules = await bundledRules();
        const feed = C.validateFeed(await download(),rules);
        await enqueue(async () => {
          const {config,[KEY]:stored} = await chrome.storage.local.get(['config',KEY]);
          if (!config) return;
          // A damaged cache must never establish a new baseline from user edits.
          let state = stored;
          if (stored?.dataVersion) {
            C.validateFeed(stored.feed,rules);
            if (stored.schemaVersion !== 1 || stored.feed.dataVersion !== stored.dataVersion
                || !stored.baselines || typeof stored.baselines !== 'object'
                || !Array.isArray(stored.protectedRuleIds)) throw Error('저장된 시간표 기준을 확인해주세요.');
          }
          const result = C.mergeFeed(config,state,feed,rules);
          await chrome.storage.local.set({config:result.config,
            [KEY]:{...result.state,lastSuccessAt:now(),lastError:null}});
        });
      } catch (error) {
        try {
          await enqueue(async () => {
            const {[KEY]:state = {}} = await chrome.storage.local.get(KEY);
            await chrome.storage.local.set({[KEY]:{...state,lastError:String(error.message).slice(0,256)}});
          });
        } catch { /* Storage failure must not interrupt extension startup. */ }
      }
    }
    function check({force = false} = {}) {
      if (!pending) pending = run(force).finally(() => { pending = null; });
      return pending;
    }
    return {ensureAlarm,check};
  }
  const api = {URL,KEY,ALARM,createSync};
  if (typeof module !== 'undefined') module.exports = api; else root.XRTimetableSync = api;
})(globalThis);
