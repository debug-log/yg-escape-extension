'use strict';

// The page owns UI state and explicit user actions. Package parsing, validation,
// filesystem writes and rollback remain in the separately tested update core.
class UpdatePage {
  constructor() {
    this.manifest = chrome.runtime.getManifest();
    this.directory = null;
    this.release = null;
    this.journal = null;
    this.target = null;
    this.completed = false;
    this.partial = null;
    this.ready = false;
    this.busy = false;
    this.checking = true;
    this.checkError = '';
    this.stage = '';
    this.elements = {};
    for (const id of ['version', 'releaseStatus', 'check', 'choose', 'chooseInitial',
      'install', 'finish', 'recover', 'reloadPage', 'folder', 'progress', 'error',
      'updateTitle', 'setup', 'reloadOptions', 'reloadHint', 'folderSettings', 'steps',
      'stageDownload', 'stageVerify', 'stageApply', 'stageRestart']) {
      this.elements[id] = document.getElementById(id);
    }
    this.preventClose = event => {
      if (this.busy) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
  }

  hasNewVersion() {
    return Boolean(this.release && (XREUpdate.compareVersions(this.release.version, this.manifest.version) > 0
      || (this.journal?.state === 'partial' && this.release.version === this.journal.version
        && XREUpdate.compareVersions(this.release.version, this.manifest.version) >= 0)));
  }

  render() {
    const ui = this.elements;
    const available = this.hasNewVersion();
    const offer = available && !this.checking && !this.checkError && (!this.journal || this.journal.state === 'partial') && !this.completed;
    const applying = this.stage !== '';
    ui.version.textContent = available && !this.completed && XREUpdate.compareVersions(this.release.version, this.manifest.version) > 0
      ? `현재 v${this.manifest.version} → 새 버전 v${this.release.version}`
      : `현재 버전 v${this.manifest.version}`;
    ui.updateTitle.textContent = applying ? '업데이트를 적용하고 있습니다'
      : this.journal?.state === 'partial' || this.partial ? '일부 파일 미적용'
      : this.journal ? '완료되지 않은 업데이트가 있습니다'
      : this.completed ? '업데이트를 완료했습니다'
      : this.checking ? '새 버전을 확인하고 있습니다'
      : this.checkError ? '새 버전을 확인하지 못했습니다'
      : available ? '새 버전으로 업데이트할 수 있습니다' : '최신 버전입니다';

    ui.check.disabled = !this.ready || this.busy || this.checking;
    ui.check.textContent = this.checking ? '확인 중…' : this.checkError ? '다시 시도' : '다시 확인';
    ui.setup.hidden = !offer || Boolean(this.directory) || applying;
    ui.choose.disabled = !this.ready || this.busy || Boolean(this.journal);
    ui.chooseInitial.disabled = ui.choose.disabled;
    ui.choose.textContent = this.directory ? '연결 폴더 변경' : '설치 폴더 연결';
    ui.folder.textContent = this.directory ? `${this.directory.name} · 연결됨` : '연결되지 않음';
    ui.install.hidden = !(offer && this.directory) && !applying;
    ui.install.disabled = !this.ready || this.busy || !offer || !this.directory;
    ui.install.textContent = applying ? '업데이트 중…'
      : this.journal?.state === 'partial' ? '미적용 파일 다시 적용'
      : available ? `v${this.release.version}로 업데이트` : '새 버전으로 업데이트';
    ui.finish.hidden = !['committed', 'partial'].includes(this.journal?.state);
    ui.finish.disabled = !this.ready || this.busy;
    ui.recover.hidden = !this.journal;
    ui.recover.disabled = !this.ready || this.busy;

    ui.reloadOptions.hidden = !(offer && this.directory) && !this.journal;
    ui.reloadPage.disabled = !this.ready || this.busy || !this.target;
    ui.reloadHint.textContent = this.target
      ? `대상: ${new URL(this.target.url).host} · 이 탭이 같은 주소에 열려 있을 때만 새로고침합니다.`
      : '새로고침할 웹페이지가 연결되지 않았습니다. 원하는 웹페이지에서 확장 아이콘을 눌러 업데이트를 열면 사용할 수 있습니다.';
    ui.steps.hidden = !applying;
    for (const step of ['Download', 'Verify', 'Apply', 'Restart']) {
      const element = ui['stage' + step];
      if (step === this.stage) element.setAttribute('aria-current', 'step');
      else element.removeAttribute('aria-current');
    }
  }

  showStage(stage, message) {
    this.stage = stage;
    this.elements.progress.textContent = message;
    this.render();
  }

  async run(action) {
    if (!this.ready || this.busy) return;
    this.busy = true;
    this.elements.error.textContent = '';
    this.render();
    try {
      await navigator.locks.request('xre-update', {ifAvailable: true}, async lock => {
        if (!lock) throw Error('다른 업데이트 탭에서 작업 중입니다. 해당 탭에서 완료해주세요.');
        // Another tab may have left a journal since this page was opened.
        this.journal = await XREUpdateStore.get('journal');
        await action();
      });
    } catch (error) {
      this.elements.error.textContent = error.name === 'AbortError' ? '작업을 취소했습니다.' : error.message;
      if (this.stage) this.elements.progress.textContent = '';
    } finally {
      try {
        this.journal = await XREUpdateStore.get('journal');
      } catch (error) {
        this.ready = false;
        this.elements.error.textContent = error.message;
      }
      this.busy = false;
      this.stage = '';
      this.render();
    }
  }

  async checkRelease(force) {
    this.checking = true;
    this.checkError = '';
    this.elements.releaseStatus.textContent = 'GitHub에서 새 버전을 확인하고 있습니다.';
    this.render();
    try {
      const result = await XREUpdate.checkRelease({cache: XREUpdateCache, force});
      this.release = result.release;
      this.checkError = result.error || '';
      this.elements.releaseStatus.textContent = this.checkError
        ? `${this.checkError}${this.release ? ` 이전 확인 결과: v${this.release.version}.` : ''} 다시 확인한 후 업데이트해주세요.`
        : this.journal?.state === 'partial' && this.release?.version === this.journal.version
          ? `v${this.release.version}의 미적용 파일을 다시 확인하고 적용할 수 있습니다.`
        : this.hasNewVersion() ? `새 버전 v${this.release.version}을 설치할 수 있습니다.`
          : '현재 설치된 버전보다 새로운 배포본이 없습니다.';
    } catch (error) {
      this.checkError = error.message;
      this.elements.releaseStatus.textContent = `${error.message} 다시 시도해주세요.`;
    } finally {
      this.checking = false;
      this.render();
    }
  }

  installedFile(name) {
    return fetch(chrome.runtime.getURL(name), {cache: 'no-store'});
  }

  async permitDirectory() {
    if (!this.directory) throw Error('설치 폴더를 먼저 선택해주세요.');
    const access = {mode: 'readwrite'};
    const permission = await this.directory.queryPermission(access);
    if (permission !== 'granted' && await this.directory.requestPermission(access) !== 'granted') {
      throw Error('폴더 수정 권한을 허용해야 업데이트할 수 있습니다.');
    }
    await XREUpdate.verifyDirectory(this.directory, name => this.installedFile(name));
  }

  async connectDirectory() {
    await this.run(async () => {
      if (this.journal) throw Error('이전 업데이트를 먼저 완료하거나 복구해주세요.');
      const chosen = await showDirectoryPicker({id: 'xre-installation', mode: 'readwrite'});
      await XREUpdate.verifyDirectory(chosen, name => this.installedFile(name));
      await XREUpdateStore.set('directory', chosen);
      this.directory = chosen;
      this.elements.folderSettings.open = false;
      this.elements.progress.textContent = '설치 폴더를 연결했습니다. 다음부터는 업데이트 버튼을 누르면 됩니다.';
    });
    if (!this.elements.install.hidden && !this.elements.install.disabled) this.elements.install.focus();
  }

  async diskVersion() {
    const bytes = await XREUpdate.readFile(this.directory, 'manifest.json');
    if (!bytes) throw Error('설치 폴더에 manifest.json이 없습니다.');
    return JSON.parse(new TextDecoder().decode(bytes)).version;
  }

  async restart(version) {
    // The background worker checks the running version and the exact target URL.
    const target = this.elements.reloadPage.checked ? this.target : null;
    await chrome.storage.local.set({updatePending: {version, target}});
    this.showStage('Restart', '파일 적용을 마쳤습니다. 확장을 다시 시작합니다…');
    window.removeEventListener('beforeunload', this.preventClose);
    chrome.runtime.reload();
  }

  async installRelease() {
    if (this.journal && this.journal.state !== 'partial') throw Error('이전 업데이트를 먼저 완료하거나 복구해주세요.');
    await this.permitDirectory();
    await this.checkRelease(true);
    if (this.checkError) throw Error('새 버전 확인에 실패했습니다. 다시 확인한 후 업데이트해주세요.');
    if (!this.hasNewVersion()) throw Error('설치할 새 버전이 없습니다.');
    const release = this.release;
    const diskVersion = await this.diskVersion();
    if (!this.journal && !this.partial && diskVersion === release.version) {
      await this.restart(diskVersion);
      return;
    }
    if (diskVersion !== this.manifest.version) {
      throw Error('폴더의 버전이 변경되었습니다. 확장을 먼저 새로고침해주세요.');
    }

    this.showStage('Download', `v${release.version} 다운로드 중…`);
    const bytes = await XREUpdate.downloadRelease(release);
    this.showStage('Verify', '다운로드한 파일을 검증하고 있습니다…');
    const candidate = await XREUpdate.parsePackage(bytes, release.version, this.manifest);
    const browserVersion = navigator.userAgent.match(/(?:Chrome|Chromium)\/([\d.]+)/)?.[1];
    if (candidate.manifest.minimum_chrome_version && browserVersion
        && XREUpdate.compareVersions(browserVersion, candidate.manifest.minimum_chrome_version) < 0) {
      throw Error('Chrome을 먼저 최신 버전으로 업데이트해주세요.');
    }
    this.showStage('Apply', '검증한 파일을 설치 폴더에 적용하고 있습니다…');
    const result = await XREUpdate.applyPackage(this.directory, candidate, XREUpdateStore,
      message => { this.elements.progress.textContent = message; });
    this.journal = result;
    this.partial = result.state === 'partial' ? {version: result.version, failures: result.failures} : null;
    await chrome.storage.local.set({updatePartial: this.partial});
    await this.restart(await this.diskVersion());
  }

  async finishInstallation() {
    await this.permitDirectory();
    if (!['committed', 'partial'].includes(this.journal?.state)
        || (this.journal.state === 'committed' && await this.diskVersion() !== this.journal.version)) {
      throw Error('적용한 버전을 확인할 수 없습니다. 이전 파일 복구를 실행해주세요.');
    }
    this.partial = this.journal.state === 'partial' ? {version: this.journal.version, failures: this.journal.failures} : null;
    await chrome.storage.local.set({updatePartial: this.partial});
    await this.restart(await this.diskVersion());
  }

  async recoverInstallation() {
    await this.permitDirectory();
    this.showStage('Apply', '이전 파일을 복구하고 있습니다…');
    await XREUpdate.restoreBackup(this.directory, XREUpdateStore,
      message => { this.elements.progress.textContent = message; });
    this.partial = null;
    await chrome.storage.local.set({updatePartial: null});
    await this.restart(await this.diskVersion());
  }

  async loadTarget(params) {
    if (params.has('settings') || params.has('complete')) return;
    const saved = await chrome.storage.session.get('updateTarget');
    const target = saved.updateTarget;
    if (!Number.isInteger(target?.id) || !/^https?:\/\//.test(target.url || '')) return;
    try {
      const tab = await chrome.tabs.get(target.id);
      if (tab.url === target.url) this.target = target;
    } catch { /* A closed or inaccessible page is not a reload target. */ }
  }

  async start() {
    const ui = this.elements;
    ui.choose.onclick = () => this.connectDirectory();
    ui.chooseInitial.onclick = () => this.connectDirectory();
    ui.check.onclick = () => this.run(async () => {
      this.completed = false;
      if (!this.journal) ui.progress.textContent = '';
      await this.checkRelease(true);
    });
    ui.install.onclick = () => this.run(() => this.installRelease());
    ui.finish.onclick = () => this.run(() => this.finishInstallation());
    ui.recover.onclick = () => this.run(() => this.recoverInstallation());
    window.addEventListener('beforeunload', this.preventClose);
    this.render();

    try {
      const params = new URL(location.href).searchParams;
      this.directory = await XREUpdateStore.get('directory');
      this.journal = await XREUpdateStore.get('journal');
      await this.loadTarget(params);
      if (!this.target) ui.reloadPage.checked = false;
      const {updateResult, updatePartial} = await chrome.storage.local.get(['updateResult', 'updatePartial']);
      this.partial = this.journal?.state === 'partial'
        ? {version: this.journal.version, failures: this.journal.failures} : updatePartial || null;
      if (params.has('complete') && updateResult) {
        if (updateResult.ok && !this.partial) {
          this.completed = true;
          if (this.journal?.state === 'committed' && this.journal.version === this.manifest.version) {
            await XREUpdateStore.delete('journal');
            this.journal = null;
          }
          ui.progress.textContent = `v${this.manifest.version} 적용 완료. 저장된 설정을 유지했습니다. `
            + (updateResult.pageReloaded ? '원래 페이지도 새로고침했습니다.'
              : '웹페이지는 새로고침하지 않았습니다. 필요하면 직접 새로고침해주세요.');
        } else if (!updateResult.ok) ui.error.textContent = updateResult.error;
      }
      if (this.partial) ui.progress.textContent = '갱신된 파일은 유지했습니다. 미적용 파일은 아래 목록에서 확인해주세요.';
      else if (this.journal) ui.progress.textContent = '완료되지 않은 업데이트가 있습니다. 적용을 마치거나 이전 파일을 복구해주세요.';
      this.ready = true;
      await this.checkRelease(false);
    } catch (error) {
      this.checking = false;
      this.checkError = error.message;
      ui.error.textContent = `업데이트 화면을 준비하지 못했습니다. 이 탭을 새로고침해주세요. ${error.message}`;
    }
    this.render();
  }
}

new UpdatePage().start();
