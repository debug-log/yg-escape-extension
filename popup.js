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
  $('site').textContent = (origin ? page.host : '웹페이지를 열어주세요');

  async function sendCommand(message) {
    const result = await chrome.runtime.sendMessage(message);
    if (!result || typeof result.ok !== 'boolean') {
      throw Error('확장 프로그램의 응답이 없습니다. chrome://extensions에서 이 확장 프로그램을 새로고침한 뒤 다시 시도해주세요.');
    }
    if (!result.ok) throw Error(result.error || '설정을 처리하지 못했습니다.');
    return result;
  }

  let busy = false;
  const box = $('enabled');
  box.onchange = async () => {
    try {
      await sendCommand({type: 'enabled', enabled: box.checked});
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

  async function changeSiteSetting(setting, enabled) {
    if (busy || !origin) return;
    busy = true;
    for (const id of ['dateUnlockToggle', 'antiDebugToggle']) $(id).disabled = true;
    $('popupMessage').textContent = '';
    try {
      // Request directly from the click gesture, before any storage reads.
      const granted = await chrome.permissions.request({origins: [origin + '/*']});
      if (!granted) throw Error('사이트 접근 권한이 허용되지 않아 설정을 변경하지 않았습니다.');
      await sendCommand({type: 'siteSetting', site: origin, setting, enabled});
      $('popupMessage').textContent = '저장 완료';
    } catch (error) {
      $('popupMessage').textContent = error.message;
    } finally {
      busy = false;
      await refresh();
    }
  }
  $('dateUnlockToggle').onchange = () => changeSiteSetting('dateUnlock', $('dateUnlockToggle').checked);
  $('antiDebugToggle').onchange = () => changeSiteSetting('antiDebug', $('antiDebugToggle').checked);

  function matchesPage(rule) {
    return rule.enabled && rule.site === origin && (!rule.pageParams
      || Object.entries(rule.pageParams).every(([key, value]) => page?.searchParams.get(key) === value));
  }

  function responseStatus(registered, enabled, rules, state) {
    if (!registered) return '사이트 등록 필요';
    if (!enabled) return '꺼짐';
    if (!rules.length) return '사용 중인 규칙 없음';
    if (state.ready && state.enabled) return '사용 중';
    return '적용 중';
  }

  function dateSettingText(eligible, registered, desired) {
    if (!eligible) return '키이스케이프 예약 페이지 전용';
    if (!registered) return '사이트 미등록';
    return desired ? '새로고침 필요' : '꺼짐';
  }

  async function refresh() {
    if (busy) return;
    const {config = {enabled: false, rules: [], sites: []}} = await chrome.storage.local.get('config');
    if (busy) return;
    box.checked = config.enabled;
    const rules = config.rules.filter(matchesPage);
    const registered = config.sites.includes(origin);
    const dateEligible = origin === 'https://keyescape.com' && page?.pathname === '/reservation1.php';
    const dateDesired = dateEligible && registered && config.keyescapeDateUnlockEnabled !== false;
    const dateText = dateSettingText(dateEligible, registered, dateDesired);
    const antiDesired = registered && !(config.antiDebugDisabledSites || []).includes(origin);

    $('dateUnlockToggle').disabled = origin !== 'https://keyescape.com';
    $('dateUnlockToggle').checked = origin === 'https://keyescape.com' && registered && config.keyescapeDateUnlockEnabled !== false;
    $('antiDebugToggle').disabled = !origin;
    $('antiDebugToggle').checked = antiDesired;
    $('rule').textContent = rules.length ? `사용 중인 규칙 ${rules.length}개` : '사용 중인 규칙 없음';

    try {
      const state = await chrome.tabs.sendMessage(tab.id, {type: 'state'}, {frameId: 0});
      if (busy) return;
      $('state').textContent = responseStatus(registered, config.enabled, rules, state);

      const anti = state.antiDebug;
      const antiReload = !!origin && (!anti?.ready || anti.reloadRequired || anti.active !== antiDesired);
      const date = state.dateUnlock;
      const dateReload = !!date?.reloadRequired || (dateDesired && !date?.ready);
      $('reload').hidden = !(antiReload || dateReload);

      $('dateUnlockState').textContent = dateReload ? '새로고침 필요'
        : dateDesired && date?.active ? '적용 중' : dateText;
      $('antiDebugState').textContent = anti?.error ? '초기화 실패'
        : antiReload ? '새로고침 필요' : antiDesired ? '적용 중' : '꺼짐';

      const last = state.last;
      $('last').textContent = last
        ? `${state.count}건 변경 · ${new Date(last.at).toLocaleTimeString()}${last.items !== null ? ' · 시간대 ' + last.items + '개' : ''}`
        : '변경 기록 없음';
    } catch {
      if (busy) return;
      $('dateUnlockState').textContent = dateText;
      $('antiDebugState').textContent = antiDesired ? '새로고침 필요' : '꺼짐';
      $('state').textContent = registered ? '새로고침 필요' : '사이트 등록 필요';
      $('reload').hidden = !origin;
    }
  }

  try {
    await sendCommand({type: 'sync'});
  } catch (error) {
    $('popupMessage').textContent = error.message;
  }
  await refresh();
  setInterval(() => refresh().catch(() => {}), 1000);
})();
