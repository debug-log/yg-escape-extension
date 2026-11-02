// Keep the file report available even if the previous update controller remains.
(async () => {
  const box = document.getElementById('partialUpdate');
  let revision = 0;
  async function render() {
    const current = ++revision;
    const journal = await XREUpdateStore.get('journal');
    const {updatePartial: saved} = await chrome.storage.local.get('updatePartial');
    if (current !== revision) return;
    const report = journal?.state === 'partial'
      ? {version: journal.version, failures: journal.failures}
      : journal?.state === 'committed' ? null : saved || null;
    if (JSON.stringify(report) !== JSON.stringify(saved || null)) {
      await chrome.storage.local.set({updatePartial: report});
    }
    box.hidden = !report?.failures?.length;
    if (box.hidden) return;
    document.getElementById('partialVersion').textContent = `v${report.version}에서 아래 파일을 갱신하지 못했습니다. 나머지 적용된 파일은 유지했습니다.`;
    document.getElementById('partialFiles').textContent = report.failures.map(f => f.name).join('\n');
    document.getElementById('partialDownload').href = /^\d+(\.\d+){0,3}$/.test(report.version)
      ? `https://github.com/debug-log/yg-escape-extension/releases/tag/v${report.version}`
      : 'https://github.com/debug-log/yg-escape-extension/releases/latest';
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.updatePartial) render().catch(() => {});
  });
  await render();
})();
