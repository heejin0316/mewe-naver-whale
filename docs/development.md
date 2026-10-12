# 개발 및 테스트

## 로컬 실행

저장소 루트의 `manifest.json`을 웨일 개발자 모드로 불러옵니다. JavaScript와 CSS를 직접 읽으므로 앱 빌드 과정은 없습니다. 수정 후 확장앱 관리 화면에서 새로고침하고 사이드바를 다시 엽니다.

앱 실행에는 npm 패키지가 필요하지 않습니다. 기본 검증에는 Node.js 20 이상을 사용합니다.

```powershell
npm test
npm run check
```

- `test`: 저장·데이터 검증·실행 실패·공유 모델·REST 오류 처리 단위 테스트
- `check`: 버전 일치, 아이콘 크기, 문서의 로컬 링크와 런타임 참조, 개인정보 생성물 최신 여부

`check`는 스토어 승인이나 운영 Firebase 설정을 검증하지 않습니다.

## 브라우저 UI 시험

Playwright를 사용할 수 있는 Node 환경이 필요합니다. 저장소 밖에 설치된 경우 `MEWE_NODE_MODULES`에 해당 `node_modules` 경로를 지정할 수 있습니다. UI 시험의 기본 브라우저는 Windows에 설치된 Edge이며 `MEWE_BROWSER_EXE`로 변경합니다.

```powershell
node tests/ui-dual.cjs
```

이 시험은 탭 API를 모의해 페이지 선택, 듀얼탭 A/B 표시, 수정·제거, 공유 안내, Enter 입력과 좁은 화면을 확인합니다. 실제 웨일 듀얼탭 API 시험과 구분합니다.

## 실제 웨일 시험

아래 스크립트는 Windows의 기본 웨일 설치 위치에서 실행 파일을 찾고, 별도의 임시 프로필과 시험 데이터를 사용합니다. 개인 브라우저 프로필을 지정하지 마세요. 실패 시 브라우저 설치 위치와 사용 중인 버전을 먼저 확인합니다.

| 명령 | 확인 범위 |
| --- | --- |
| `node tests/native-capture.cjs` | 일반탭·듀얼탭 양쪽 수집과 순서 |
| `node tests/native-reorder.cjs` | 드래그·키보드 이동, 취소, 저장 유지 |
| `node tests/native-close.cjs` | 앱이 연 탭 닫기, 기존 탭·다른 작업공간 보존 |
| `node tests/native-files.cjs` | PDF 수집, 한글·특수문자 경로, 파일 열기 |
| `node tests/native-file-dual.cjs` | 파일/웹·파일/파일 듀얼탭 복원과 닫기 |
| `node tests/native-sharing.cjs` | 아래 에뮬레이터로 두 프로필 간 공유·받기 |

기존 검증 대상은 웨일 5.39.412.57입니다. 버전별 분할 화면 동작 차이가 있을 수 있으므로 배포 후보는 설치 환경에서 다시 확인합니다. 테스트 산출물과 임시 프로필은 배포하지 않습니다.

## Firestore 규칙 시험

운영 데이터베이스 대신 로컬 `demo-mewe` 프로젝트를 사용합니다. Java 17과 공식 Firestore 에뮬레이터 JAR 1.19.8로 검증한 구성입니다. 최신 에뮬레이터의 Java 요구사항은 [공식 설치 안내](https://firebase.google.com/docs/emulator-suite/install_and_configure)를 확인하세요.

JAR을 `tmp/firebase-emulator/firestore.jar`에 준비한 뒤 저장소 루트에서 실행합니다.

```powershell
java '-Duser.language=en' '-Duser.country=US' -jar tmp/firebase-emulator/firestore.jar --host 127.0.0.1 --port 8787 --project_id demo-mewe --rules firestore.rules --single_project_mode true
```

별도 터미널에서:

```powershell
npm run test:rules
node tests/native-sharing.cjs
```

규칙 시험은 생성·단건 조회 허용, 목록 조회·잘못된 데이터·만료·권한 없는 수정 차단을 확인합니다. 네이티브 공유 시험은 익명 인증 응답을 모의하고 실제 에뮬레이터 REST 저장·조회와 격리된 웨일 UI를 사용합니다. **운영 Firebase의 익명 인증 설정이나 게시된 규칙을 검증한 것은 아닙니다.**

## 개인정보 문서와 화면 이미지

개인정보 원문은 `shared/privacy-content.js`입니다. 앱에서도 이 원문을 사용합니다.

```powershell
node scripts/build-privacy.mjs
node scripts/build-icons.cjs
node scripts/capture-readme.cjs
```

첫 명령은 `PRIVACY.md`와 `docs/privacy/index.html`을 생성합니다. 아이콘 생성은 Playwright로 `assets/icons/mark.svg`를 16·20·24·32·40·48·64·96·128·256·512px PNG로 렌더링합니다. 마지막 명령은 실제 사이드바에 예시 데이터를 표시해 README 이미지를 만듭니다. 외부 서버에 공유 문서를 생성하지 않으며, 웨일 네이티브 기능의 검증 자료는 아닙니다.

웨일 5.39 관리 화면은 기본 48px 항목을 70 CSS px로 표시하므로 `manifest.icons[48]`에도 128px 원본을 연결합니다. 큰 아이콘 항목만 추가하면 기존 48px 파일이 계속 선택되므로 이 연결을 유지합니다. 사이드바에는 화면 배율별 실제 크기를 등록하며 스토어 업로드용 `icon128.png`는 정확히 128×128을 유지합니다.

## 제출 전

[수동 시험 목록](../tests/integration-checklist.md)과 [출시 절차](releasing.md)를 따릅니다. README 화면, 코드, 버전, 정책과 실제 ZIP이 같은 상태를 설명하는지 확인합니다.
