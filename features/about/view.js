import { el, button, busy } from "../../shared/dom.js";
import { api } from "../../shared/browser.js";
import { request } from "../../shared/messages.js";
import { privacy, privacyUrl, supportEmail } from "../../shared/privacy-content.js";

export function privacyDetails() {
  return el("details", { className: "privacy-details about-content" }, el("summary", {}, "개인정보 처리방침"),
    el("p", { className: "notice" }, privacy.status),
    el("p", { className: "muted" }, `시행일 ${privacy.date}`),
    el("a", { href: privacyUrl, target: "_blank", rel: "noopener noreferrer" }, "개인정보 처리방침 웹페이지"),
    ...privacy.sections.map(section => el("section", {}, el("h3", {}, section.title),
      ...section.paragraphs.map(p => el("p", {}, p)),
      ...(section.links || []).map(link => el("a", { href: link.url, target: "_blank", rel: "noopener noreferrer" }, link.label)))));
}

export function openAbout(modal) {
  const sheet = modal.open("앱 정보"); if (!sheet) return;
  sheet.body.classList.add("about-content");
  const version = api?.runtime?.getManifest?.().version || "0.3.1";
  sheet.body.append(el("h3", {}, "ME:WE"), el("p", { className: "muted" }, `버전 ${version}`),
    el("p", {}, "열어둔 학습 페이지를 저장하고 다시 여는 사이드바 확장앱입니다. 운영팀 ewhale · 개발자 정희진. 네이버 또는 이화여자대학교의 공식 앱이 아닙니다."),
    el("h3", {}, "문의 및 삭제 요청"), el("a", { href: `mailto:${supportEmail}` }, supportEmail),
    el("p", {}, "공유 데이터 삭제·처리 정지 요청이나 부적절한 공유 내용 신고는 이메일로 보내 주세요. 비밀번호나 인증 토큰은 보내지 마세요."),
    el("h3", {}, "권한 사용 이유"),
    el("ul", {}, ...[
      "저장소: 탭 모음과 공유 인증 정보 저장",
      "탭: 열린 페이지의 제목·주소 확인, 한 번에 열기·닫기",
      "디버거: 듀얼탭의 양쪽 페이지 ID 확인만 사용. 디버거 연결·명령 실행 없음",
      "클립보드 쓰기: 공유 코드 복사",
      "클립보드 읽기: 공유 코드 입력 화면에서 붙여넣기 버튼을 눌렀을 때만 사용. 탭 불러오기 전에는 서버로 전송하지 않음",
      "Firebase API 접근: 익명 인증과 공유 코드 저장·조회"
    ].map(text => el("li", {}, text))), privacyDetails());
  const sharingState = el("p", { className: "muted", role: "status" }, "공유 이용 설정을 확인하고 있어요.");
  const stopSharing = button("이 기기에서 공유 사용 중지", event => busy(event.currentTarget, async () => {
    await request("SHARE_CONSENT_CLEAR");
    sharingState.textContent = "공유 사용을 중지했어요. 다시 이용할 때 동의를 받아요.";
    stopSharing.hidden = true;
  }, sheet.error), "btn full");
  stopSharing.hidden = true;
  sheet.body.append(el("h3", {}, "공유 이용 설정"), sharingState, stopSharing,
    el("p", { className: "muted" }, "사용을 중지해도 이미 생성한 공유 자료와 서버 인증 계정은 삭제되지 않아요. 서버 자료 삭제·동의 철회는 위 문의 이메일로 요청해 주세요."));
  request("SHARE_CONSENT_STATUS").then(status => {
    if (!sharingState.isConnected) return;
    sharingState.textContent = status.accepted ? "이 기기에서는 추가 동의 없이 공유 기능을 이용할 수 있어요." : "공유 기능을 처음 이용할 때 동의를 받아요.";
    stopSharing.hidden = !status.accepted;
  }).catch(error => { if (sharingState.isConnected) { sharingState.textContent = "공유 설정을 불러오지 못했어요."; sheet.error(error.message); } });
  sheet.footer.append(button("확인", () => sheet.close(), "btn primary full"));
}
