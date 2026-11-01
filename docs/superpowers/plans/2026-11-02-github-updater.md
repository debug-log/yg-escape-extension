# GitHub updater implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** One-click updates from debug-log/yg-escape-extension after the user grants access to the unpacked installation directory.

**Architecture:** A popup checks GitHub's latest stable release with a six-hour cache. A dedicated extension tab downloads a release ZIP, validates all bytes before writing, verifies the chosen directory is the running installation, persists a recovery journal, replaces files, and reloads the extension. Startup restores script registrations before reloading the originating tab.

**Tech Stack:** Plain JavaScript, Chrome Manifest V3, File System Access, IndexedDB, Node tests, Python standard-library ZIP packaging, GitHub Releases/Actions.

**Spec:** Approved conversation flow: update notice → update button → download/unpack/write → extension restart → original page reload. Owner debug-log; public repo yg-escape-extension. Required bundled defaults explicitly approved for publication; personal backups/research excluded.

## Constraints and decisions

- Preserve the user's completed 1.3.1 work and all existing settings. Work on a feature branch with these local changes intact.
- First updater release 1.4.0. Existing installations need one manual installation/refresh to acquire the updater.
- Only our generated ZIP format (stored entries, bounded sizes, checksummed file inventory) is accepted; GitHub source-code ZIPs are not update packages.
- The installed directory is verified with a temporary nonce file fetched through the running extension origin; similar-looking copies are rejected.
- Persist backups before writes, manifest last, read back hashes, rollback on failure; interrupted transactions offer recovery on next updater visit.
- No silent background writes. Native folder/permission UI requires user interaction. No telemetry or rule data is sent to GitHub.
- Exact GitHub repository and asset URLs only. Missing release/network failure never interrupts existing features.

## Review focus

- Permission denied/cancelled, wrong installation folder: no package writes.
- Malformed/traversal/duplicate/oversized ZIP or mismatched version/hash: reject before writes.
- Partial writes or tab closure: persistent backups and recovery, no misleading success/reload.
- Concurrent update tabs: exclusive browser lock and persistent journal.
- Newer local version, GitHub 404/rate-limit/offline, changed target tab: preserve current installation and unrelated tabs.

## Tasks

- [x] 1. Tests then update-core.js: version comparison, release selection/cache, ZIP verification, directory proof, journaled apply/recovery. Test real filesystem adapters and injected write failures.
- [x] 2. update-store.js, update.html/update.js, popup-updates.js, manifest/background integration: native permission flow, cached notices, progress/recovery, startup completion. Test isolated Chrome with real FileSystemDirectoryHandle and local release fixture.
- [x] 3. scripts/package.py and GitHub workflow: allowlisted runtime ZIP, SHA-256 inventory, version/tag consistency; include only approved default-rules JSON. Roundtrip packages in core tests.
- [x] 4. Run full Node suite, existing Chrome suites and new updater integration. Review whole change, then publish 1.4.0 and verify live GitHub metadata/download. Document the one-time bootstrap and remaining native UI coverage.

## Progress

- Baseline: 40/40 Node tests pass after other session completed. Required defaults publication approved.
- Ruling: Proceed inline without a new approval round: user already approved this flow and explicitly requested implementation. Preserve uncommitted prior-session work; do not reset it.
- Core and startup tests written before implementation; Node suite now 56/56 passing.
- Actual Chrome updater, date-unlock and anti-debug integrations pass on macOS. GitHub run 41327866982 passes Node/package/real Chrome updater tests on Windows and Ubuntu.
- Windows fix: explicitly read UTF-8 manifest in Python. Windows AppData/Temp is blocked by File System Access; browser integration uses a normal workspace directory, matching documented installation under Documents.
- Fresh reviewer found no blocking updater defects; Windows encoding finding fixed. Native picker/permission dialogs are still manual verification (automated profile pre-grants read/write). Browser termination mid-write is not explicitly simulated; durable rollback is tested with real filesystem write/lock failures.
- Other-session popup styling/icons were preserved and included in the package; package tests check HTML and manifest resource references.

- Final deployment: v1.4.0 published from 67704d6. Final suite 59/59; Windows and Ubuntu release workflow 41328432634 succeeded. Live GitHub ZIP downloaded by the production updater core and verified: 29 files, 1,279,792 bytes, SHA-256 70c4cdbd87bc23251bbad4e790c7e536e9f99453982b9ad7df03de35d98054f3. Native folder consent UI remains manual.
