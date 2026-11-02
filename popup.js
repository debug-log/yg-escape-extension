(async () => {
  const $ = id => document.getElementById(id);
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  let origin, page;
  try {
    page = new URL(tab?.url);
    if (['http:', 'https:'].includes(page.protocol)) {
      origin = page.origin;
      await chrome.storage.session.set({pageContext: {url: page.href}});
    }
  } catch {}
  const key = origin === 'https://keyescape.com', play = origin === 'https://play33.kr';
  const supported = key || play;
  $('site').textContent = key ? '키이스케이프' : play ? '플레이33' : origin ? page.host : '웹페이지를 열어주세요';
  $('siteAddress').textContent = supported ? page.host : '';
  $('helperFeatures').hidden = !supported;
  $('dateUnlockFeature').hidden = !key;
  $('timetableFeature').hidden = !key;
  $('play33Feature').hidden = !play;
  $('activity').hidden = !key;
  $('manage').onclick = () => chrome.runtime.openOptionsPage();
  $('reload').onclick = () => { chrome.tabs.reload(tab.id); window.close(); };

  let busy = false, revision = 0;
  const controls = ['helperToggle', 'openingToggle', 'dateUnlockToggle', 'timetableToggle', 'play33Toggle', 'addCurrentSite'];
  async function sendCommand(message) {
    const result = await chrome.runtime.sendMessage(message);
    if (!result || typeof result.ok !== 'boolean') {
      throw Error('확장 프로그램의 응답이 없습니다. chrome://extensions에서 이 확장 프로그램을 새로고침한 뒤 다시 시도해주세요.');
    }
    if (!result.ok) throw Error(result.error || '설정을 저장하지 못했습니다. 다시 시도해주세요.');
    return result;
  }
  async function change(setting, enabled) {
    if (busy || !supported) return;
    busy = true;
    ++revision;
    controls.forEach(id => $(id).disabled = true);
    $('popupMessage').textContent = '';
    $('popupMessage').className = '';
    try {
      if (setting === 'startHelper') {
        const granted = await chrome.permissions.request({origins: [origin + '/*']});
        if (!granted) throw Error('사이트 접근 권한이 허용되지 않아 시작하지 않았습니다. 사용 시작을 눌러 다시 허용해주세요.');
      }
      const command = {type: 'siteSetting', site: origin, setting};
      if (typeof enabled === 'boolean') command.enabled = enabled;
      await sendCommand(command);
      $('popupMessage').textContent = setting === 'startHelper'
        ? key ? '오픈 일정 안내·날짜 선택 제한 해제·기본 시간표를 켰습니다.' : '오픈 일정 안내·예약 선택 패널을 켰습니다.'
        : setting === 'helper' && !enabled ? '이 사이트의 예약 도우미를 껐습니다. 기능별 선택은 유지됩니다.' : '설정을 저장했습니다.';
    } catch (error) {
      $('popupMessage').textContent = error.message; $('popupMessage').className = 'is-error';
    } finally {
      busy = false;
      await refresh();
    }
  }
  for (const [id, setting] of [['helperToggle', 'helper'], ['openingToggle', 'opening'], ['dateUnlockToggle', 'dateUnlock'], ['timetableToggle', 'timetable'], ['play33Toggle', 'play33']]) {
    $(id).onchange = () => change(setting, $(id).checked);
  }
  $('addCurrentSite').onclick = () => { if (!$('addCurrentSite').disabled) return change('startHelper'); };

  async function refresh() {
    if (busy) return;
    const version = ++revision;
    const {config = {enabled: false, rules: [], sites: []}} = await chrome.storage.local.get('config');
    let state = null;
    if (origin && supported) {
      try { state = await chrome.tabs.sendMessage(tab.id, {type: 'state'}, {frameId: 0}); } catch {}
    }
    if (busy || version !== revision) return;
    const helper = XRSettings.helperState(config, origin);
    const active = helper.registered && helper.enabled;
    $('helperToggle').checked = helper.enabled && helper.registered;
    $('helperToggle').disabled = !supported || !helper.registered;
    $('addCurrentSite').hidden = !supported || helper.registered;
    $('addCurrentSite').disabled = !supported || helper.registered;
    for (const [id, choice] of [['openingToggle', helper.opening], ['dateUnlockToggle', helper.dateUnlock], ['timetableToggle', helper.timetable], ['play33Toggle', helper.play33]]) {
      $(id).checked = choice;
      $(id).disabled = !active;
    }
    const eligibleDate = key && page.pathname === '/reservation1.php';
    const eligiblePlay = play && page.pathname === '/reservation/create';
    const eligibleOpening = eligibleDate || play && ['/reservation', '/reservation/create'].includes(page.pathname);
    let reload = false;
    function status(chosen, eligible, actual, waiting) {
      if (!helper.registered) return '사용 시작 후 적용';
      if (!helper.enabled) return '예약 도우미 꺼짐 · 선택 유지';
      if (!chosen) return '꺼짐';
      if (!eligible) return waiting;
      if (!state || !actual?.ready || actual.reloadRequired) { reload = true; return '새로고침 필요'; }
      return actual.active ? '사용 중' : '페이지에서 대상 요소를 기다리는 중';
    }
    const openingText = status(helper.opening, eligibleOpening, state?.opening, '예약 목록·입력 페이지에서 사용');
    const dateText = status(helper.dateUnlock, eligibleDate, state?.dateUnlock, '예약 날짜 선택 페이지에서 사용');
    const playText = status(helper.play33, eligiblePlay, state?.play33, '예약 정보 입력 페이지에서 사용');
    const timetableRules = config.rules.filter(rule => XRSettings.isBundledRule(rule) && rule.enabled);
    let timetableText;
    if (!helper.registered) timetableText = '사용 시작 후 적용';
    else if (!helper.enabled) timetableText = '예약 도우미 꺼짐 · 선택 유지';
    else if (!helper.timetable) timetableText = '꺼짐';
    else if (!eligibleDate) timetableText = '예약 날짜 선택 페이지에서 사용';
    else if (!timetableRules.length) timetableText = '켜진 테마 규칙 없음 · 설정에서 선택';
    else if (!state?.ready) { timetableText = '새로고침 필요'; reload = true; }
    else timetableText = '켜짐 · 조건에 맞는 요청부터 적용';
    $('openingState').textContent = openingText;
    $('dateUnlockState').textContent = dateText;
    $('play33State').textContent = playText;
    $('state').textContent = timetableText;
    const hasFeatures = helper.opening || key && (helper.dateUnlock || helper.timetable) || play && helper.play33;
    $('helperState').textContent = !supported ? origin ? '예약 도우미를 지원하지 않는 사이트입니다.' : '이 페이지에서는 예약 도우미를 사용할 수 없습니다.'
      : !helper.registered ? '사용 전 · 사이트 접근 권한이 필요합니다.'
      : !helper.enabled ? '예약 도우미 꺼짐'
      : !hasFeatures ? '켜진 기능 없음' : reload ? '설정 저장됨 · 새로고침 필요' : '예약 도우미 켜짐';
    $('helperState').className = 'helper-state' + (active && hasFeatures ? reload ? ' is-pending' : ' is-on' : '');
    $('helperNote').textContent = !supported ? origin ? '일반 사이트의 응답 규칙은 설정 → 고급 설정에서 관리하세요.' : '키이스케이프 또는 플레이33 예약 사이트에서 열어주세요.'
      : !helper.registered ? '사용 시작을 누르면 이 사이트의 기본 기능을 함께 켭니다.'
      : !helper.enabled ? '다시 켜면 이전에 선택한 기능을 복원합니다. 사용자 응답 규칙은 고급 설정에서 별도로 관리합니다.'
      : '오픈 시각과 실제 잔여석은 다를 수 있습니다. 예약 가능 여부는 사이트에서 확인하세요.';
    $('activity').hidden = !key || !active || !helper.timetable;
    $('rule').textContent = timetableRules.length ? `켜진 테마 시간표 ${timetableRules.length}개` : '켜진 테마 규칙 없음 · 설정에서 선택';
    const last = state?.last;
    $('last').textContent = last ? `이 페이지 응답 ${state.count}건 변경 · ${new Date(last.at).toLocaleTimeString('ko-KR')}` : '';
    $('reload').hidden = !supported || !active || !reload;
  }
  try { await sendCommand({type: 'sync'}); } catch (error) { $('popupMessage').textContent = error.message; $('popupMessage').className = 'is-error'; }
  await refresh();
  setInterval(() => refresh().catch(() => {}), 1000);
})();
