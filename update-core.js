(function (root) {
  'use strict';
  const REPO = 'debug-log/yg-escape-extension';
  const API = `https://api.github.com/repos/${REPO}/releases/latest`;
  const MAX_BYTES = 16 * 1024 * 1024;
  const decoder = new TextDecoder('utf-8', {fatal: true});

  function versionParts(version) {
    if (typeof version !== 'string' || !/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/.test(version)) throw Error('버전 형식이 올바르지 않습니다.');
    const parts = version.split('.').map(Number);
    if (parts.some(n => n > 65535)) throw Error('버전 범위를 벗어났습니다.');
    return [...parts, ...Array(4 - parts.length).fill(0)];
  }

  function compareVersions(a, b) {
    const left = versionParts(a), right = versionParts(b);
    for (let i = 0; i < 4; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
    return 0;
  }

  function selectRelease(data) {
    if (data.draft || data.prerelease) return null;
    const version = String(data.tag_name || '').replace(/^v/, '');
    versionParts(version);
    const name = `yg-escape-extension-${version}.zip`;
    const asset = data.assets?.find(item => item.name === name);
    const url = `https://github.com/${REPO}/releases/download/v${version}/${name}`;
    if (!asset || asset.browser_download_url !== url || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) {
      throw Error('검증 가능한 배포 ZIP이 없습니다. GitHub 릴리스를 확인해주세요.');
    }
    if (!(asset.size > 0 && asset.size <= MAX_BYTES)) throw Error('배포 ZIP 크기를 확인해주세요.');
    return {version, url, size: asset.size, sha256: asset.digest.slice(7), page: `https://github.com/${REPO}/releases/tag/v${version}`};
  }

  async function checkRelease({cache, fetcher = fetch, force = false, now = Date.now()}) {
    const saved = await cache.get('updateCheck');
    const ttl = saved?.error ? 10 * 60 * 1000 : 6 * 60 * 60 * 1000;
    if (!force && saved && now >= saved.checkedAt && now - saved.checkedAt < ttl) return saved;
    let result;
    try {
      const response = await fetcher(API, {headers: {Accept: 'application/vnd.github+json'}, cache: 'no-store', signal: AbortSignal.timeout(15000)});
      if (response.status === 404) result = {release: null};
      else {
        if (!response.ok) throw Error(response.status === 403 || response.status === 429 ? 'GitHub 요청 한도에 도달했습니다. 잠시 후 다시 확인하세요.' : `업데이트 확인 실패 (${response.status})`);
        result = {release: selectRelease(await response.json())};
      }
    } catch (error) {
      result = {release: saved?.release || null, error: error.message};
    }
    result.checkedAt = now;
    await cache.set('updateCheck', result);
    return result;
  }

  async function sha256(bytes) {
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function downloadRelease(release, fetcher = fetch) {
    const expected = `https://github.com/${REPO}/releases/download/v${release.version}/yg-escape-extension-${release.version}.zip`;
    versionParts(release.version);
    if (release.url !== expected || !/^[a-f0-9]{64}$/.test(release.sha256)) throw Error('배포 주소 또는 해시가 올바르지 않습니다.');
    const response = await fetcher(release.url, {cache: 'no-store', signal: AbortSignal.timeout(60000)});
    if (!response.ok) throw Error(`ZIP 다운로드 실패 (${response.status})`);
    const reader = response.body.getReader(), chunks = [];
    let length = 0;
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        length += value.length;
        if (length > MAX_BYTES) throw Error('ZIP 크기 제한을 초과했습니다.');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    if (length !== release.size) throw Error('다운로드 크기가 일치하지 않습니다.');
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    if (await sha256(bytes) !== release.sha256) throw Error('ZIP 검증에 실패했습니다. 설치 파일은 변경하지 않았습니다.');
    return bytes;
  }

  function safePath(name) {
    if (typeof name !== 'string' || name.length > 180 || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(name)) return false;
    const segments = name.split('/');
    if (segments.some(part => !part || part.startsWith('.') || part.endsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part))) return false;
    return /^icons\/icon-(16|32|48|128)\.png$/.test(name) || /\.(js|html|css|json|LICENSE)$/.test(name) || /(^|\/)LICENSE$/.test(name);
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  // Our publisher emits ZIP_STORED. Reject unsupported formats instead of
  // interpreting arbitrary source-code archives or unbounded compressed data.
  function readZip(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 22 || bytes.length > MAX_BYTES) throw Error('ZIP 크기가 올바르지 않습니다.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const end = bytes.length - 22;
    if (view.getUint32(end, true) !== 0x06054b50 || view.getUint16(end + 20, true) !== 0 || view.getUint32(end + 4, true) !== 0) throw Error('지원하지 않는 ZIP 형식입니다.');
    const count = view.getUint16(end + 10, true), central = view.getUint32(end + 16, true);
    if (!count || count > 128 || count !== view.getUint16(end + 8, true) || central + view.getUint32(end + 12, true) !== end) throw Error('ZIP 목록이 올바르지 않습니다.');
    const entries = new Map(), names = new Set(), ranges = [];
    let at = central;
    for (let i = 0; i < count; i++) {
      if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50) throw Error('ZIP 항목 오류');
      const flags = view.getUint16(at + 8, true), method = view.getUint16(at + 10, true);
      const size = view.getUint32(at + 24, true), compressed = view.getUint32(at + 20, true);
      const n = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true);
      const mode = view.getUint32(at + 38, true) >>> 16, start = view.getUint32(at + 42, true);
      if (at + 46 + n + extra + comment > end || (flags & ~0x800) || method !== 0 || size !== compressed || (mode & 0xf000) === 0xa000 || view.getUint16(at + 34, true) !== 0) throw Error('지원하지 않는 ZIP 항목입니다.');
      const name = decoder.decode(bytes.subarray(at + 46, at + 46 + n));
      if (!safePath(name) || names.has(name.toLowerCase())) throw Error('허용하지 않는 파일 경로입니다.');
      names.add(name.toLowerCase());
      if (start + 30 > central || view.getUint32(start, true) !== 0x04034b50) throw Error('ZIP 파일 헤더 오류');
      const localNameLength = view.getUint16(start + 26, true), localExtraLength = view.getUint16(start + 28, true);
      const dataStart = start + 30 + localNameLength + localExtraLength;
      if (dataStart + size > central || view.getUint16(start + 6, true) !== flags || view.getUint16(start + 8, true) !== method
          || view.getUint32(start + 18, true) !== size || view.getUint32(start + 22, true) !== size
          || decoder.decode(bytes.subarray(start + 30, start + 30 + localNameLength)) !== name) throw Error('ZIP 파일 정보가 일치하지 않습니다.');
      const data = bytes.slice(dataStart, dataStart + size), crc = crc32(data);
      if (crc !== view.getUint32(at + 16, true) || crc !== view.getUint32(start + 14, true)) throw Error('ZIP 파일이 손상되었습니다.');
      ranges.push([start, dataStart + size]);
      entries.set(name, data);
      at += 46 + n + extra + comment;
    }
    ranges.sort((a, b) => a[0] - b[0]);
    if (at !== end || ranges.some((r, i) => r[0] !== (i ? ranges[i - 1][1] : 0)) || ranges.at(-1)[1] !== central) throw Error('ZIP에 중복되거나 알 수 없는 데이터가 있습니다.');
    return entries;
  }

  async function parsePackage(bytes, expectedVersion) {
    const files = readZip(bytes);
    const json = name => { if (!files.has(name)) throw Error(`필수 파일이 없습니다: ${name}`); return JSON.parse(decoder.decode(files.get(name))); };
    const release = json('release.json'), manifest = json('manifest.json');
    versionParts(expectedVersion);
    if (release.product !== REPO || release.version !== expectedVersion || manifest.version !== expectedVersion || manifest.manifest_version !== 3) throw Error('배포 대상 또는 버전이 일치하지 않습니다.');
    if (!release.files || Array.isArray(release.files) || Object.keys(release.files).length !== files.size - 1) throw Error('파일 목록이 일치하지 않습니다.');
    for (const [name, data] of files) {
      if (name !== 'release.json' && await sha256(data) !== release.files[name]) throw Error(`파일 검증 실패: ${name}`);
    }
    for (const name of [manifest.background?.service_worker, manifest.action?.default_popup, manifest.options_page, 'update.html']) {
      if (!name || !files.has(name)) throw Error('확장 실행 파일이 빠져 있습니다.');
    }
    return {version: expectedVersion, manifest, files};
  }

  async function fileHandle(directory, name, create = false) {
    const parts = name.split('/');
    let parent = directory;
    for (const part of parts.slice(0, -1)) parent = await parent.getDirectoryHandle(part, {create});
    return {parent, name: parts.at(-1), handle: await parent.getFileHandle(parts.at(-1), {create})};
  }

  async function readFile(directory, name) {
    try { return new Uint8Array(await (await (await fileHandle(directory, name)).handle.getFile()).arrayBuffer()); }
    catch (error) { if (error.name === 'NotFoundError') return null; throw error; }
  }

  async function writeFile(directory, name, bytes) {
    const {handle} = await fileHandle(directory, name, true);
    const stream = await handle.createWritable();
    try { await stream.write(bytes); await stream.close(); }
    catch (error) { await stream.abort().catch(() => {}); throw error; }
  }

  async function verifyDirectory(directory, fetchInstalled) {
    const nonce = crypto.randomUUID(), name = `xre-install-check-${nonce}.json`;
    try {
      await writeFile(directory, name, new TextEncoder().encode(nonce));
      const response = await fetchInstalled(name);
      if (!response.ok || await response.text() !== nonce) throw Error('현재 실행 중인 확장의 설치 폴더가 아닙니다.');
    } finally { await directory.removeEntry(name).catch(() => {}); }
  }

  async function restoreBackup(directory, store, progress = () => {}) {
    const journal = await store.get('journal');
    if (!journal) return;
    const entries = [...journal.backup].sort(([a], [b]) => (a === 'manifest.json') - (b === 'manifest.json'));
    for (const [name, bytes] of entries) {
      if (!safePath(name)) throw Error('복구 파일 경로를 확인해주세요.');
      progress(`이전 파일 복구 중 · ${name}`);
      if (bytes === null) {
        try { const f = await fileHandle(directory, name); await f.parent.removeEntry(f.name); }
        catch (error) { if (error.name !== 'NotFoundError') throw error; }
      } else {
        await writeFile(directory, name, bytes);
        if (await sha256(await readFile(directory, name)) !== await sha256(bytes)) throw Error('복구 파일 검증 실패');
      }
    }
    await store.delete('journal');
  }

  async function applyPackage(directory, pkg, store, progress = () => {}) {
    if (await store.get('journal')) throw Error('이전 업데이트를 먼저 완료하거나 복구해주세요.');
    const entries = [...pkg.files].sort(([a], [b]) => (a === 'manifest.json') - (b === 'manifest.json'));
    const backup = [];
    for (const [name] of entries) backup.push([name, await readFile(directory, name)]);
    const journal = {state: 'writing', version: pkg.version, backup};
    await store.set('journal', journal);
    try {
      for (const [name, bytes] of entries) {
        progress(`업데이트 적용 중 · ${name}`);
        await writeFile(directory, name, bytes);
        if (await sha256(await readFile(directory, name)) !== await sha256(bytes)) throw Error(`기록한 파일 검증 실패: ${name}`);
      }
      await store.set('journal', {...journal, state: 'committed'});
    } catch (error) {
      try { await restoreBackup(directory, store, progress); }
      catch (recovery) { throw Error(`${error.message}\n자동 복구 실패: ${recovery.message}. 이 탭에서 복구를 다시 실행해주세요.`); }
      throw Error(`${error.message}\n이전 파일을 복구했습니다.`);
    }
  }

  const api = {REPO, API, MAX_BYTES, compareVersions, selectRelease, checkRelease, sha256, downloadRelease, safePath, parsePackage, readFile, verifyDirectory, applyPackage, restoreBackup};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.XREUpdate = api;
})(globalThis);
