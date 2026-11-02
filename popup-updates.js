(async () => {
  const status = document.getElementById('updateStatus');
  const button = document.getElementById('openUpdater');
  const version = chrome.runtime.getManifest().version;
  status.textContent = `v${version} · 확인 중`;
  button.onclick = async () => {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    const target = tab?.id && /^https?:\/\//.test(tab.url || '') ? {id: tab.id, url: tab.url} : null;
    await chrome.storage.session.set({updateTarget: target});
    await chrome.tabs.create({url: chrome.runtime.getURL('update.html')});
    window.close();
  };
  try {
    const {updatePartial} = await chrome.storage.local.get('updatePartial');
    if (updatePartial?.failures?.length) {
      status.textContent = `v${version} · 미적용 ${updatePartial.failures.length}개`;
      button.textContent = '미적용 파일 확인';
      button.hidden = false;
      return;
    }
    const result = await XREUpdate.checkRelease({cache: XREUpdateCache});
    if (result.release && XREUpdate.compareVersions(result.release.version, version) > 0) {
      status.textContent = `v${version} → v${result.release.version}`;
      button.textContent = '업데이트 가능';
    } else {
      status.textContent = `v${version} · ${result.error ? '확인 실패' : '최신 버전'}`;
      button.hidden = !result.error;
    }
  } catch { status.textContent = `v${version} · 확인 실패`; }
})();
