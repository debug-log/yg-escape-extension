# 키이스케이프 시간표 갱신

확장 기능 도입 후 GitHub판과 Chrome 스토어판은 같은 파일을 사용한다.

`https://raw.githubusercontent.com/debug-log/yg-escape-extension/refs/heads/main/data/keyescape-timetable.json`

브라우저 시작 시 확인하며 최근 15분 내 요청은 생략한다. 설치·업데이트 때는 강제로 확인한다. 별도로 6시간 주기의 알람을 등록하며 절전 등으로 실행이 지연될 수 있다. 다운로드는 15초·2 MiB로 제한한다. 네트워크 오류, 잘못된 자료, 이전 버전은 현재 규칙을 바꾸지 않는다.

## 시간표 게시

1. 공식 응답과 지점·테마·날짜·슬롯 번호·시간을 대조한다. 미확인 요일은 만들지 않는다. 기존 사용자 제공 자료의 출처는 그대로 남긴다.
2. `data/keyescape-timetable.json`에서 해당 테마의 samples를 수정하고 dataVersion을 증가시킨다. 최초 데이터 버전은 1이며 확장 버전·keyescapeDefaultsVersion과 독립적이다. schemaVersion은 1을 유지한다.
3. `node scripts/export-keyescape-timetable.cjs --check`와 `npm test`를 실행한다.
4. 검증된 데이터 파일만 별도로 게시한다. 현재 작업 폴더에 섞인 미배포 기능을 함께 게시하지 않는다.
5. 고정 URL에서 게시한 dataVersion과 내용이 반환되는지 확인한다. 최초 기능 배포도 이 확인 후 진행한다.

`node scripts/export-keyescape-timetable.cjs <version>`은 기존 번들 전체를 원격 데이터 형식으로 다시 내보낸다. 이미 게시 파일을 직접 편집했다면 이를 덮어쓸 수 있으므로 최초 생성·명시적 재생성에만 사용한다. 새 테마·요일 그룹·응답 변경 동작은 이 파일로 추가하지 않는다.

잘못 게시한 자료는 더 높은 dataVersion에 이전 정상 내용을 넣어 복구한다. 같은 버전의 파일 내용만 바꾸면 이미 적용한 사용자는 재적용하지 않는다. 테마가 빠진 부분 피드는 그 테마를 삭제하지 않으며 마지막 수신 자료를 유지한다. 포함된 테마의 samples는 전체 교체본이므로 유지할 날짜도 함께 제공한다.

## 사용자 수정과 진단

이름·활성 여부만 바꾼 규칙은 시간표를 계속 갱신한다. 시간표나 적용 조건을 직접 바꾼 규칙은 보호하며, 삭제한 규칙은 자동으로 복구하지 않는다. 오래 열린 설정 창에서 이름만 저장해도 새 시간표는 유지된다. 기존 설치의 수정 여부가 확실하지 않은 규칙은 보존한다. 정확히 확인된 v5 기본 규칙의 이어도사나 주말 자료만 v6로 자동 보완한다.

기존 '기본 규칙 복구'는 삭제한 규칙을 마지막 정상 자료로 복원하며 기존 수정 규칙을 덮어쓰지 않는다. 직접 수정한 규칙을 자동 관리로 돌리려면 해당 규칙을 삭제한 후 기본 규칙 복구를 사용한다.

확장 서비스 워커 개발자 도구에서 `chrome.storage.local.get('keyescapeTimetable')`로 dataVersion, lastAttemptAt, lastSuccessAt, lastError, protectedRuleIds를 확인할 수 있다. lastSuccessAt은 정상 파일 확인 시각이며 모든 사용자 규칙이 덮어써졌다는 뜻이 아니다. 설정 화면에 별도 갱신 UI는 추가하지 않는다.

실제 Chrome 검증: `node tests/run-timetable-chrome.cjs`. 임시 프로필에서 양쪽 ZIP을 설치하고 로컬 응답 fixture로 실제 저장·알람·오프라인 보존을 확인한다. 이 테스트는 GitHub 게시 완료나 스토어 심사 통과를 검증하지 않는다.
