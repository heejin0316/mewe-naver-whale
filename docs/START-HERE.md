# ME:WE 웨일스토어 제출 준비

앱 버전 0.3.0 · 운영팀 ewhale · 개발자 정희진 · 문의 h33jin.jeong@gmail.com.

## 준비된 자료

- [전달 폴더](../delivery/): 팀원·스토어 공용 앱 ZIP, 128px 아이콘, 1280×800 스크린샷 2장, 설치·제출 안내
- [개인정보 처리방침](../PRIVACY.md): 시행일 2026-10-12, Firestore 서울 및 Authentication 미국 처리 안내
- [운영 절차](operations.md): 공유 문서 최대 14일 보관·매주 정리, 문의 완료 후 30일 내 삭제
- [스토어 설명](store-description.md), [심사 설명](review-notes.md), [제출 체크리스트](release-checklist.md)
- 개인정보 공개 주소: https://heejin0316.github.io/mewe-naver-whale/privacy/

2026-10-12 GitHub Pages main/docs 배포 성공 및 비인증 HTTP 200·최신 정책 내용을 확인했습니다.

## 반영한 확인 결과

사용자가 Firestore 서울 설정, 두 사용자 간 공유 정상 작동, 최근 팝업 오류 해결을 확인했습니다. 공유 최초 이용 시 기본 미선택 동의 체크박스로 동의받고 이후 같은 브라우저에서는 공유하기·공유받기에 공통 적용합니다. 동의 범위 변경이나 공유 사용 중지 후에는 다시 동의받으며, 동의 전에는 인증·조회·생성 요청을 보내지 않습니다. 동의하지 않아도 개인 작업공간은 사용할 수 있습니다.

운영자가 최대 보관 기간과 수동 삭제 업무를 수락했습니다. 서버 자동 삭제나 예약 작업이 설치된 것은 아닙니다. 요청자 확인·삭제 절차와 정기 정리의 첫 실행은 운영자가 콘솔에서 점검해야 합니다.

## 제출 순서

1. delivery의 최신 앱 ZIP을 설치해 확인합니다. 이전 ZIP과 혼용하지 않습니다.
2. 개인정보 공개 주소의 로그아웃 접근과 자료 내용을 확인합니다.
3. 체크리스트의 최종 설치·업데이트·운영 점검 항목을 확인합니다.
4. 스토어에 앱 ZIP, 아이콘, 스크린샷, 설명, 개인정보 URL을 입력합니다.
5. 공개 범위와 미리보기를 확인한 뒤 담당자가 심사를 요청합니다.

GitHub 업로드·개인정보 페이지 공개와 웨일스토어 심사·출시는 별도 단계입니다.

## 재생성

개인정보 원문은 shared/privacy-content.js 한 곳에서 관리합니다.

```powershell
node scripts/build-privacy.mjs
node scripts/capture-readme.cjs
node scripts/capture-store.cjs
powershell -NoProfile -File scripts/package-delivery.ps1
```

정책이나 UI를 바꾸면 문서·이미지·ZIP을 함께 갱신합니다. 포장 도구는 압축 해제된 모든 런타임 파일을 원본과 해시 비교합니다. 코드 MIT와 [별도 브랜드 정책](brand-policy.md)은 그대로 적용됩니다.

공식 기준: [심사 가이드](https://developers.whale.naver.com/review_guides/), [등록 안내](https://developers.whale.naver.com/distribution/).
