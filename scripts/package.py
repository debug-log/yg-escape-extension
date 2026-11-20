#!/usr/bin/env python3
"""Build direct-install or Chrome Web Store ZIPs from approved runtime files."""
import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path

FILES = (
    'popup.css', 'icons/icon-16.png', 'icons/icon-32.png',
    'icons/icon-48.png', 'icons/icon-128.png',
    'manifest.json', 'background.js', 'settings.js', 'engine.js', 'hook.js',
    'bridge.js', 'date-unlock.js', 'opening.js', 'opening-ui.js', 'play33.js', 'rabbithole.js', 'anti-debug.js', 'ux.js', 'options.js',
    'options.html', 'popup.js', 'popup.html', 'style.css', 'popup-updates.js',
    'update-core.js', 'update-store.js', 'update.js', 'update-report.js', 'update.html',
    'keyescape-weekday-fallback-rules.json', 'vendor/acorn.js',
    'timetable-core.js', 'timetable-sync.js', 'data/keyescape-timetable.json',
    'vendor/acorn.LICENSE', 'vendor/anti-anti-debug.LICENSE',
)

UPDATER_FILES = {
    'popup-updates.js', 'update-core.js', 'update-store.js',
    'update.js', 'update-report.js', 'update.html',
}


def store_payload(payload, manifest):
    payload = {name: data for name, data in payload.items() if name not in UPDATER_FILES}
    manifest = dict(manifest)
    github_hosts = {
        'https://api.github.com/*', 'https://github.com/*',
        'https://release-assets.githubusercontent.com/*',
    }
    hosts = [host for host in manifest.get('host_permissions', []) if host not in github_hosts]
    if hosts:
        manifest['host_permissions'] = hosts
    else:
        manifest.pop('host_permissions', None)
    payload['manifest.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()

    def replace(name, pattern, replacement, expected=1):
        text, count = re.subn(pattern, replacement, payload[name].decode('utf-8'))
        if count != expected:
            raise ValueError(f'Store packaging expected {expected} updater sections in {name}, found {count}')
        payload[name] = text.encode('utf-8')

    replace('popup.html', r'  <footer class="popup-footer">[^\n]*</footer>\r?\n', '')
    replace('popup.html', r'  <script src="(?:update-core|update-store|popup-updates)\.js"></script>\r?\n', '', 3)
    replace('options.html', r'<a\b[^>]*href="update\.html\?settings=1"[^>]*>[^<]*</a>', '')
    replace('background.js', r'async function finishPendingUpdate\(\) \{[\s\S]*?\r?\n\}\r?\n\r?\n(?=function startExtension)', '')
    replace('background.js', r'schedule\(\)\.then\(finishPendingUpdate\)', 'schedule()')
    return payload


def build(root, output, tag=None, store=False):
    manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
    version = manifest['version']
    if not re.fullmatch(r'(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}', version):
        raise ValueError('Invalid manifest version')
    if tag is not None and tag != f'v{version}':
        raise ValueError(f'Tag {tag} does not match manifest version {version}')
    payload = {name: (root / name).read_bytes() for name in FILES}
    if store:
        payload = store_payload(payload, manifest)
    else:
        inventory = {'product': 'debug-log/yg-escape-extension', 'version': version,
                     'files': {name: hashlib.sha256(data).hexdigest() for name, data in payload.items()}}
        payload['release.json'] = json.dumps(inventory, ensure_ascii=False, indent=2).encode()
    if sum(map(len, payload.values())) > 15 * 1024 * 1024:
        raise ValueError('Package exceeds updater size limit')
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f'yg-escape-extension-{"store-" if store else ""}{version}.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_STORED) as z:
        for name, data in payload.items():
            entry = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_STORED
            entry.external_attr = 0o100644 << 16
            z.writestr(entry, data)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix('.zip.sha256').write_text(f'{digest}  {archive.name}\n', encoding='utf-8')
    if not store:
        update = {'product': 'debug-log/yg-escape-extension', 'version': version,
                  'url': f'https://github.com/debug-log/yg-escape-extension/releases/download/v{version}/{archive.name}',
                  'size': archive.stat().st_size, 'sha256': digest}
        (output / 'update.json').write_text(json.dumps(update, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(archive)
    return archive


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--out-dir', type=Path)
    parser.add_argument('--tag')
    parser.add_argument('--store', action='store_true', help='Exclude the GitHub updater for Chrome Web Store submission')
    args = parser.parse_args()
    output = args.out_dir or Path('dist/store' if args.store else 'dist')
    build(args.root.resolve(), output.resolve(), args.tag, store=args.store)
