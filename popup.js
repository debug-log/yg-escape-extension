(async () => {
  const $ = id => document.getElementById(id);
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  let origin, page;
  try {
    page = new URL(tab.url);
    if (['http:', 'https:'].includes(page.protocol)) {
      origin = page.origin;
      await chrome.storage.session.set({pageContext: {url: page.href}});
    }
  } catch {}
  $('site').textContent = origin || '웹페이지에서 열어주세요.';

  const box = $('enabled');
  box.onchange = async () => {
    try {
      const result = await chrome.runtime.sendMessage({type: 'enabled', enabled: box.checked});
      if (!result.ok) throw Error(result.error);
      await refresh();
    } catch (error) {
      $('state').textContent = error.message;
    }
  };
  $('manage').onclick = () => chrome.runtime.openOptionsPage();
  $('reload').onclick = () => {
    chrome.tabs.reload(tab.id);
    window.close();
  };

  function matchesPage(rule) {
    return rule.enabled && rule.site === origin && (!rule.pageParams
      || Object.entries(rule.pageParams).every(([key, value]) => page?.searchParams.get(key) === value));
  }

  function responseStatus(registered, enabled, rules, state) {
    if (!registered) return '사이트 설정이 필요합니다';
    if (!enabled) return '응답 변경 꺼짐';
    if (!rules.length) return '설정 선택 필요';
    if (state.ready && state.enabled) return '적용 준비 완료';
    return '설정 반영 중';
  }

  function dateSettingText(eligible, registered, desired) {
    if (!eligible) return '적용 대상 아님';
    if (!registered) return '사이트 미등록';
    return desired ? '설정 켜짐' : '설정 꺼짐';
  }

  async function refresh() {
    const {config = {enabled: false, rules: [], sites: []}} = await chrome.storage.local.get('config');
    box.checked = config.enabled;
    const rules = config.rules.filter(matchesPage);
    const registered = config.sites.includes(origin);
    const dateEligible = origin === 'https://keyescape.com' && page?.pathname === '/reservation1.php';
    const dateDesired = dateEligible && registered && config.keyescapeDateUnlockEnabled !== false;
    const dateText = dateSettingText(dateEligible, registered, dateDesired);
    const antiDesired = registered && !(config.antiDebugDisabledSites || []).includes(origin);

    $('dateUnlockState').textContent = '날짜 자동 열기 · ' + dateText + (dateDesired ? ' · 새로고침 후 적용' : '');
    $('antiDebugState').textContent = '개발자도구 방해 완화 · '
      + (antiDesired ? '설정 켜짐 · 새로고침 후 적용' : '설정 꺼짐');
    $('rule').textContent = rules.length
      ? rules.map(rule => rule.name).join(' / ')
      : '이 페이지에 켜진 설정이 없습니다.';

    try {
      const state = await chrome.tabs.sendMessage(tab.id, {type: 'state'}, {frameId: 0});
      $('state').textContent = responseStatus(registered, config.enabled, rules, state);

      const anti = state.antiDebug;
      const antiReload = !!origin && (!anti?.ready || anti.reloadRequired || anti.active !== antiDesired);
      const date = state.dateUnlock;
      const dateReload = !!date?.reloadRequired || (dateDesired && !date?.ready);
      $('reload').hidden = !(antiReload || dateReload);

      let dateStatus = '';
      if (dateReload) dateStatus = ' · 새로고침 필요';
      else if (dateDesired && date?.active) dateStatus = ' · 적용 중';
      $('dateUnlockState').textContent = '날짜 자동 열기 · ' + dateText + dateStatus;

      let antiStatus = ' · 설정 반영됨';
      if (anti?.error) antiStatus = ' · 초기화 실패';
      else if (antiReload) antiStatus = ' · 새로고침 필요';
      $('antiDebugState').textContent = '개발자도구 방해 완화 · '
        + (antiDesired ? '설정 켜짐' : '설정 꺼짐') + antiStatus;

      const last = state.last;
      $('last').textContent = last
        ? `이 페이지 ${state.count}건 변경 · 마지막 ${new Date(last.at).toLocaleTimeString()}${last.items !== null ? ' · 시간대 ' + last.items + '개' : ''}`
        : '아직 변경한 응답이 없습니다. 날짜를 선택해보세요.';
    } catch {
      $('state').textContent = registered ? '새로고침하면 적용됩니다' : '사이트 설정이 필요합니다';
      $('reload').hidden = !origin;
    }
  }

  await refresh();
  setInterval(() => refresh().catch(() => {}), 1000);
})();
