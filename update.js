(async () => {
  'use strict';
  const U = XREUpdate, store = XREUpdateStore, cache = XREUpdateCache;
  const $ = id => document.getElementById(id);
  const currentVersion = chrome.runtime.getManifest().version;
  let directory, release, journal, busy = false, target;
  const progress = text => { $('progress').textContent = text; };
  const installedFile = name => fetch(chrome.runtime.getURL(name), {cache: 'no-store'});
  $('version').textContent = `현재 버전 v${currentVersion}`;

  function controls() {
    $('choose').disabled = busy || !!journal;
    $('check').disabled = busy;
    $('install').disabled = busy || !!journal || !directory || !release || U.compareVersions(release.version, currentVersion) <= 0;
    $('recover').hidden = !journal;
    $('recover').disabled = busy;
    $('finish').hidden = journal?.state !== 'committed';
    $('finish').disabled = busy;
    $('reloadPage').disabled = busy || !target;
    $('folder').textContent = directory ? `연결된 폴더: ${directory.name}` : '연결된 폴더가 없습니다.';
  }

  async function task(action) {
    if (busy) return;
    busy = true; $('error').textContent = ''; controls();
    try {
      await navigator.locks.request('xre-update', {ifAvailable: true}, async lock => {
        if (!lock) throw Error('다른 업데이트 탭에서 작업 중입니다. 해당 탭에서 완료해주세요.');
        await action();
      });
    } catch (error) {
      $('error').textContent = error.name === 'AbortError' ? '작업을 취소했습니다.' : error.message;
    } finally {
      journal = await store.get('journal');
      busy = false; controls();
    }
  }

  async function allowDirectory() {
    if (!directory) throw Error('설치 폴더를 먼저 선택해주세요.');
    if (await directory.queryPermission({mode: 'readwrite'}) !== 'granted'
        && await directory.requestPermission({mode: 'readwrite'}) !== 'granted') throw Error('폴더 수정 권한을 허용해야 업데이트할 수 있습니다.');
    await U.verifyDirectory(directory, installedFile);
  }

  async function check(force = false) {
    const result = await U.checkRelease({cache, force});
    release = result.release;
    $('releaseStatus').textContent = result.error || (release && U.compareVersions(release.version, currentVersion) > 0
      ? `새 버전 v${release.version}을 설치할 수 있습니다.` : '현재 설치된 버전보다 새로운 배포본이 없습니다.');
    controls();
  }

  async function restart(version) {
    // Persist before reload: the background worker completes only after its
    // script registrations are ready, and only reloads the unchanged target URL.
    await chrome.storage.local.set({updatePending: {version, target: $('reloadPage').checked ? target : null}});
    progress('파일 적용을 마쳤습니다. 확장을 다시 시작합니다…');
    busy = false;
    window.removeEventListener('beforeunload', preventClose);
    chrome.runtime.reload();
  }

  $('choose').onclick = () => task(async () => {
    const selected = await showDirectoryPicker({id: 'xre-installation', mode: 'readwrite'});
    await U.verifyDirectory(selected, installedFile);
    await store.set('directory', selected);
    directory = selected;
    progress('설치 폴더를 연결했습니다. 다음부터는 업데이트 버튼을 누르면 됩니다.');
  });
  $('check').onclick = () => task(() => check(true));
  $('install').onclick = () => task(async () => {
    await allowDirectory();
    await check(true);
    if (!release || U.compareVersions(release.version, currentVersion) <= 0) throw Error('설치할 새 버전이 없습니다.');
    const chosen = release;
    const disk = JSON.parse(new TextDecoder().decode(await U.readFile(directory, 'manifest.json')));
    if (disk.version !== currentVersion) throw Error('폴더의 버전이 변경되었습니다. 확장을 먼저 새로고침해주세요.');
    progress(`v${chosen.version} 다운로드 중…`);
    const bytes = await U.downloadRelease(chosen);
    progress('다운로드한 파일을 검증하고 있습니다…');
    const pkg = await U.parsePackage(bytes, chosen.version);
    const chromeVersion = navigator.userAgent.match(/(?:Chrome|Chromium)\/([\d.]+)/)?.[1];
    if (pkg.manifest.minimum_chrome_version && chromeVersion && U.compareVersions(chromeVersion, pkg.manifest.minimum_chrome_version) < 0) throw Error('Chrome을 먼저 최신 버전으로 업데이트해주세요.');
    await U.applyPackage(directory, pkg, store, progress);
    await restart(pkg.version);
  });
  $('finish').onclick = () => task(async () => {
    await allowDirectory();
    const pending = await store.get('journal');
    const disk = JSON.parse(new TextDecoder().decode(await U.readFile(directory, 'manifest.json')));
    if (pending?.state !== 'committed' || disk.version !== pending.version) throw Error('적용한 버전을 확인할 수 없습니다. 이전 파일 복구를 실행해주세요.');
    await restart(pending.version);
  });
  $('recover').onclick = () => task(async () => {
    await allowDirectory();
    await U.restoreBackup(directory, store, progress);
    const disk = JSON.parse(new TextDecoder().decode(await U.readFile(directory, 'manifest.json')));
    await restart(disk.version);
  });

  function preventClose(event) {
    if (busy) { event.preventDefault(); event.returnValue = ''; }
  }
  window.addEventListener('beforeunload', preventClose);
  try {
    directory = await store.get('directory');
    journal = await store.get('journal');
    const data = await chrome.storage.session.get('updateTarget');
    target = new URL(location.href).searchParams.has('settings') ? null : data.updateTarget;
    if (!target) $('reloadPage').checked = false;
    const {updateResult} = await chrome.storage.local.get('updateResult');
    if (new URL(location.href).searchParams.has('complete') && updateResult) {
      if (updateResult.ok) {
        if (journal?.state === 'committed' && journal.version === currentVersion) {
          await store.delete('journal'); journal = undefined;
        }
        progress(`v${currentVersion} 적용 완료. 저장된 설정을 유지했습니다.${updateResult.pageReloaded ? ' 원래 페이지도 새로고침했습니다.' : ''}`);
      } else $('error').textContent = updateResult.error;
    }
    if (journal) progress('완료되지 않은 업데이트가 있습니다. 적용을 마치거나 이전 파일을 복구해주세요.');
    controls();
    await check();
  } catch (error) { $('error').textContent = error.message; }
})();
