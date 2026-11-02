# Reservation Helper UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 승인된 시안과 선택에 맞춰 예약 도우미의 조작·문구·디자인을 일관되게 정돈한다.

**Architecture:** 기존 서비스 워커의 직렬 저장 경로와 content script 구성을 유지한다. `settings.js`에 예약 도우미 설정 해석과 범용 규칙/기본 시간표의 적용 구분을 모아 팝업·설정·bridge가 동일한 기준을 사용하게 한다. UI는 현재 HTML/CSS/JavaScript 안에서 변경한다.

**Tech Stack:** Chrome MV3, JavaScript, HTML/CSS, node:test, 기존 Chrome CDP 검증 스크립트, Python 패키징.

**Spec:** `docs/superpowers/specs/2026-11-03-reservation-helper-ux-design.md`

## Global Constraints

- 기존 Chrome 확장 구조와 순수 HTML/CSS/JavaScript를 사용한다. 새 런타임 의존성을 추가하지 않는다.
- 최소 Chrome 111을 유지한다.
- 저장한 사이트·권한·사용자 규칙·이름·시간표·규칙 활성화와 순서를 보존한다. 업그레이드만으로 기능을 새로 켜지 않는다.
- 전체 도우미 스위치는 사이트별 별도 설정으로 저장해 개별 기능과 권한을 지우지 않는다.
- 기본 시간표만 켤 때 다른 사이트나 사용자 규칙을 함께 켜지 않는다.
- 버전 변경·릴리스·배포·원격 push는 이번 로컬 다듬기 범위에 포함하지 않는다.

## Review Focus

- 기존 설치에서 전역 응답 변경을 꺼둔 경우 업그레이드만으로 시간표를 켜지 않는다. Task 1의 legacy 테스트로 확인한다.
- 팝업과 설정 탭을 동시에 사용해도 다른 탭의 기능 선택을 덮어쓰지 않는다. Task 1의 stale-save 테스트로 확인한다.
- 플레이33 오픈 안내만 껐을 때 패널과 목록의 위젯이 모두 제거되고 예약 선택 패널은 유지된다. Task 2의 Chrome 검증으로 확인한다.
- 권한을 거부하거나 저장 응답이 없을 때 스위치와 화면을 저장된 값으로 되돌린다. Task 3의 popup 테스트로 확인한다.
- Windows 업데이트의 부분 적용·복구와 패키지 파일 목록을 유지한다. Task 4의 기존 업데이트·패키징 테스트로 확인한다.

---

### Task 1: 설정과 명령의 일관된 기준

**Files:** `settings.js`, `background.js`, `tests/settings.test.cjs`, `tests/background.test.cjs`.

**Interfaces:**
- Add `XRSettings.helperState(config, origin)` returning `{supported, registered, enabled, opening, dateUnlock, timetable, play33}`. Existing CommonJS `mergeConfig` export remains.
- Store `helperDisabledSites` and `openingDisabledSites` as origin lists; `keyescapeTimetableEnabled` is a boolean initialized once from `config.enabled` during sync when absent. Later global-switch changes do not affect this preference.
- `helperState` returns saved feature selections even when the master is off. Callers compute effective application using registration, master and feature selection together.
- Extend `siteSetting` with `helper`, `opening`, `timetable`, `startHelper`; reject unsupported origins/settings and non-boolean values before writing.
- `startHelper` registers only its permitted origin and enables that site's default features; `helper` changes only the site's master state. Existing date/play toggles remain compatible.

- [x] Add failing settings tests for legacy defaults, master off/on preserving feature choices, per-site isolation and stale saves of all new/legacy booleans and lists.
- [x] Run `node --test tests/settings.test.cjs`; confirm the new behavior fails before implementation.
- [x] Implement `helperState` and merge support for helper lists, timetable and existing `play33Enabled` without clobbering concurrent saves.
- [x] Add background tests for permission denial, unsupported origins, start defaults without enabling unrelated rules, and master off/on preserving rules and feature flags.
- [x] Implement permission-gated serialized `siteSetting` commands. Keep restoration of missing defaults a separate command.
- [x] Run `node --test tests/settings.test.cjs tests/background.test.cjs`; all must pass.

### Task 2: 사이트 기능의 적용 범위

**Files:** `settings.js`, `bridge.js`, `date-unlock.js`, `play33.js`, `opening-ui.js`, `background.js`, `scripts/package.py`, `tests/bridge.test.cjs`, `tests/play33.test.cjs`, `tests/run-date-unlock-chrome.cjs`, `tests/run-play33-chrome.cjs`.

**Interfaces:**
- Add `XRSettings.responseConfig(config, origin)` returning effective `{enabled, rules}`. Bundled KeyEscape fallback rules follow helper master/timetable and their own enabled flags; custom rules follow `config.enabled`. Identify bundled rules using the exact set of 34 shipped rule IDs, not action type or a broad prefix.
- Load `settings.js` before isolated-world feature scripts and before UI scripts. Preserve MAIN-world engine/hook and iframe scope.
- Feature `configure(config)` uses `helperState`; opening widgets inside Play33 also honor the independent opening preference.
- Expose opening state through `bridge`'s existing `state` reply to distinguish actual application from the saved preference.

- [x] Add failing tests for basic timetable versus custom-rule gating (including a custom weekdayFallback rule), master off with custom rules preserved, opening disabled with Play33 panel enabled and the reverse on both listing and reservation-input pages.
- [x] Implement feature gating and script loading without changing reservation calculations or overwriting site form values.
- [x] Run the settings/bridge/play33 unit tests; update package allowlist and registration expectations for the shared settings script.
- [x] Extend existing Chrome fixtures to exercise feature combinations, master off/on and selected values restoration, then run both date-unlock and Play33 Chrome scripts.

### Task 3: 팝업과 설정 화면

**Files:** `popup.html`, `popup.js`, `popup.css`, `options.html`, `options.js`, `style.css`, `tests/popup.test.cjs`, `tests/run-chrome.cjs`.

**Interfaces:**
- Both screens read `helperState` and write through `siteSetting`; permission requests happen directly from user gestures.
- Popup has master plus per-feature switches, start action, status and reload action. Disabled master preserves visible feature choices.
- Settings has site cards first, theme schedule management under KeyEscape, generic rules/sites/anti-debug in advanced mode, and the existing global response switch in advanced mode labeled ‘사용자 응답 규칙 적용’.

- [x] Add popup behavior tests for master/feature independence, unsupported/internal pages, permission denial, failed replies and actual versus desired state.
- [x] Implement readable semantic HTML for site cards and the approved popup; preserve all existing editor/preview control IDs needed by the rule editor.
- [x] Route UI actions through existing commands and implement error rollback. Use consistent ‘예약 도우미’, ‘응답 변경’, ‘규칙’, ‘사용 시작’, ‘켜짐/꺼짐’, ‘새로고침 필요’ wording.
- [x] Consolidate overlapping styles and popup overrides into one shared color/type/spacing system; keep visible focus, responsive layout, Korean Windows fonts and reduced motion.
- [x] Run popup unit tests and actual Chrome settings/popup integration, including 390px width, tab navigation and failed permission paths. Inspect screenshots before accepting the result.

### Task 4: 예약 위젯·업데이트·최종 검증

**Files:** `opening-ui.js`, `play33.js`, `update.html`, `update.js`, `update-report.js`, `popup-updates.js`, `style.css`, `README.md`, relevant existing tests.

**Interfaces:** Existing updater class, journal, directory picker, package verification and restart commands remain compatible.

- [x] Align injected widget copy, semantic colors and focus with helper screens; remove internal branch/theme IDs from normal schedule display.
- [x] Tighten update instructions and consistent action labels without changing update/recovery mechanics. Update affected text assertions only where the resulting UI behavior still has meaningful coverage.
- [x] Document site start, independent feature switches, master selection preservation and advanced rules in README.
- [x] Run `npm test`, `python3 scripts/package.py --out-dir /tmp/xre-ux-package`, and relevant existing Chrome integrations. Run updater integration if the shared style/text affects its checks.
- [x] Inspect popup/settings/update and reservation-widget screenshots at desktop and narrow widths, inspect diff for accidental settings changes, and report validation plus any Windows-only verification limits.
