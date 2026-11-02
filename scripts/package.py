#!/usr/bin/env python3
"""Build the updater's bounded, stored ZIP using only approved runtime files."""
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
    'bridge.js', 'date-unlock.js', 'play33.js', 'anti-debug.js', 'ux.js', 'options.js',
    'options.html', 'popup.js', 'popup.html', 'style.css', 'popup-updates.js',
    'update-core.js', 'update-store.js', 'update.js', 'update-report.js', 'update.html',
    'keyescape-weekday-fallback-rules.json', 'vendor/acorn.js',
    'vendor/acorn.LICENSE', 'vendor/anti-anti-debug.LICENSE',
)


def build(root, output, tag=None):
    manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
    version = manifest['version']
    if not re.fullmatch(r'(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}', version):
        raise ValueError('Invalid manifest version')
    if tag is not None and tag != f'v{version}':
        raise ValueError(f'Tag {tag} does not match manifest version {version}')
    payload = {name: (root / name).read_bytes() for name in FILES}
    inventory = {'product': 'debug-log/yg-escape-extension', 'version': version,
                 'files': {name: hashlib.sha256(data).hexdigest() for name, data in payload.items()}}
    payload['release.json'] = json.dumps(inventory, ensure_ascii=False, indent=2).encode()
    if sum(map(len, payload.values())) > 15 * 1024 * 1024:
        raise ValueError('Package exceeds updater size limit')
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f'yg-escape-extension-{version}.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_STORED) as z:
        for name, data in payload.items():
            entry = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_STORED
            entry.external_attr = 0o100644 << 16
            z.writestr(entry, data)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix('.zip.sha256').write_text(f'{digest}  {archive.name}\n', encoding='utf-8')
    print(archive)
    return archive


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--out-dir', type=Path, default=Path('dist'))
    parser.add_argument('--tag')
    args = parser.parse_args()
    build(args.root.resolve(), args.out_dir.resolve(), args.tag)
