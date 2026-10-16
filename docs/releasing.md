# 배포 절차

담당: **ewhale / 정희진**. GitHub 소스 반영, 개인정보 페이지 공개, 웨일스토어 제출은 각각 별도 작업입니다.

## 1. 배포 후보 확정

1. [제출 체크리스트](release-checklist.md)의 미결 항목을 검토하고 담당·결과를 기록합니다.
2. 앱 아이콘·색상을 확정하고 README 이미지와 스토어 스크린샷을 갱신합니다.
3. `manifest.json`과 `package.json`의 버전을 맞춥니다. 현재 첫 제출 후보는 0.3.0이며, 스토어에 배포한 뒤 업데이트할 때는 이전 배포보다 높은 버전을 사용합니다.
4. `CHANGELOG.md`에 사용자 관점의 변경점을 기록하고 개발 중 항목과 공개 버전을 구분합니다.
5. 개인정보 원문을 갱신했다면 `node scripts/build-privacy.mjs`를 실행합니다.

## 2. 검증 및 패키징

팀원 전달·스토어 자료는 저장소의 [delivery 폴더](../delivery/)에서 확인합니다. 설치용 앱 ZIP은 스토어 업로드에도 동일하게 사용하며, team-kit ZIP은 안내·아이콘·이미지를 함께 보내는 용도입니다. 스토어에는 team-kit ZIP을 올리지 않습니다.

```powershell
node scripts/capture-store.cjs
powershell -NoProfile -File scripts/package-delivery.ps1
```

첫 명령은 격리된 웨일에서 실제 앱 UI와 예시 데이터를 1280×800 설명 이미지 2장으로 촬영합니다. 두 번째 명령은 기본 시험·저장소 점검을 먼저 실행한 뒤 delivery의 앱 ZIP·아이콘·상세 설명·SHA256 목록을 갱신합니다. 압축 해제 결과를 원본과 해시 비교하고 이미지 규격·전체 전달 자료 해시를 확인합니다. 안내·이미지를 포함한 추가 전달 묶음은 Git에 올리지 않는 `release/preview-*/` 안에만 생성합니다. 최종 정책/UI가 바뀌면 두 명령을 다시 실행하세요.

이미 생성된 제출 자료는 `powershell -NoProfile -File scripts/check-delivery.ps1`로 검사합니다. 이 검사는 ZIP의 파일 목록과 바이트가 현재 소스와 정확히 같은지 확인합니다. GitHub Actions에서도 기본 시험·저장소 점검·제출 파일 검사를 실행하며 운영 Firebase에는 연결하지 않습니다.

포장만 따로 확인하려면 기존 도구를 사용할 수 있습니다.

```powershell
npm test
npm run check
powershell -NoProfile -File scripts/package-preview.ps1
```

포장 도구는 `release/preview-버전-시각/`에 다음을 만듭니다.

- `mewe-버전-preview.zip`: 루트에 manifest가 있는 설치 파일
- `store-icon128.png`: 현재 128px 앱 아이콘
- `README.txt`: 포장 상태와 ZIP의 SHA256
- `extension/`: ZIP에 포함된 파일 확인용 폴더

포함 대상은 앱 실행 파일, `assets/`, `shared/`, `features/`, MIT 고지입니다. 개발 테스트, Firebase 운영 규칙, Git 이력, 문서와 임시 파일은 제외합니다. 로고 권리 고지는 `assets/icons/LICENSE.txt`에 포함됩니다.

포장 도구의 결과물을 **심사 완료본으로 표시하지 않습니다**. 체크리스트 완료 후 최종 후보를 만들고, 그 ZIP을 직접 풀어 새 웨일 프로필에서 검증하세요. 파일명이 같다는 이유로 이전 ZIP을 재사용하지 않습니다.

## 3. 시험 결과 기록

아래 양식으로 최종 후보의 검증을 기록합니다. 현재 결과는 [최종 검토 결과](final-review.md)에 있습니다. 팀원의 이전 피드백은 참고 이력이며 최종 패키지 검증을 대신하지 않습니다.

```text
시험일:
검증자:
앱 버전 / Git 커밋:
ZIP 이름 / SHA256:
OS / 웨일 버전:
새 설치 / 기존 설치 업데이트:
일반탭·듀얼탭·PDF / 수정·정렬·닫기:
다른 사용자 공유 생성·수신·저장·열기:
만료·잘못된 코드·네트워크 오류:
개인정보 링크 / 문의 / 키보드 / 좁은 화면:
결과와 남은 문제:
```

실제 공유 코드, 사용자 URL, 파일 경로와 인증 정보는 공개 시험 기록에서 제거합니다.

## 4. GitHub와 스토어

1. 변경 파일을 검토하고 한글로 커밋 메시지를 작성합니다. 오래된 ZIP·미선정 시안·개인 자료는 올리지 않습니다.
2. [공개 개인정보 페이지](https://heejin0316.github.io/mewe-naver-whale/privacy/)의 로그아웃 접근과 최신 원문 일치를 확인합니다. GitHub Pages는 main/docs에서 공개합니다.
3. [등록 문구](store-description.md), [심사 설명](review-notes.md), [스토어 이미지](screenshots.md)를 최종 앱과 대조합니다.
4. 담당자가 웨일스토어에서 설명·개인정보 URL·ZIP·아이콘·스크린샷을 확인하고 제출합니다.
5. 실제 공개 후 README 설치 링크와 CHANGELOG 공개일을 갱신합니다. GitHub Release를 만들 경우 검증한 동일 ZIP과 버전 태그를 사용합니다.

검토 중 기능을 ‘출시됨’으로 표기하지 않으며 GitHub 업로드만으로 스토어 승인·공개가 완료되었다고 안내하지 않습니다.

## 업데이트와 문제 대응

업데이트는 기존 확장앱을 제거하지 않고 수행하며 작업공간 데이터가 유지되는지 확인합니다. 스토어 문제가 발생하면 원인을 수정한 더 높은 버전으로 다시 배포하고, 저장 형식 변경 시 이전 데이터와의 호환성을 검증합니다. 운영 규칙·정책 변경은 앱 버전과 별도로 영향을 확인합니다.
