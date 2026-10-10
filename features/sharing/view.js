import { el, button, field, busy } from "../../shared/dom.js";
import { prepareShare, normalizeCode, displayCode, SHARE_DAYS } from "./model.js";
import { supportEmail } from "../../shared/privacy-content.js";

function pageList(pages) {
  return el("ul", { className: "share-pages" }, ...pages.map((p) => el("li", {}, el("strong", {}, p.title), el("small", {}, p.url))));
}
const accessNote = () => el("p", { className: "muted share-note" }, "로그인이 필요한 페이지는 받는 사람의 계정과 접근 권한이 필요해요.");

export function openShare(services, value) {
  const prepared = prepareShare(value);
  const sheet = services.modal.open("작업공간 공유"); if (!sheet) return;
  sheet.body.classList.add("sharing");
  let issued = null;
  sheet.body.append(el("h3", {}, prepared.name), el("h4", {}, `공유할 페이지 · ${prepared.pages.length}개`),
    prepared.pages.length ? pageList(prepared.pages) : el("p", { className: "notice" }, "공유할 수 있는 웹페이지가 없어요."));
  if (prepared.excluded.length) sheet.body.append(el("section", { className: "share-excluded" },
    el("h4", {}, `제외되는 페이지 · ${prepared.excluded.length}개`),
    el("ul", {}, ...prepared.excluded.map((p) => el("li", {}, p.title))),
    el("p", {}, "내 컴퓨터에 저장된 파일은 공유할 수 없어요. 듀얼탭 한쪽이 제외되면 남은 페이지는 일반탭으로 전달돼요.")));
  sheet.body.append(accessNote(), el("p", { className: "muted share-note" }, `코드를 아는 사람은 페이지 목록을 확인할 수 있어요. 공유 코드는 ${SHARE_DAYS}일 동안 사용할 수 있어요.`));
  sheet.body.append(el("p", { className: "share-note" }, "공유 코드 복사를 누르면 위 작업공간 이름과 웹페이지 정보, 익명 사용자 ID를 Firebase에 저장해 공유합니다. 주소에 개인정보나 비공개 문서 접근 정보가 포함되어 있는지 확인해 주세요."),
    el("p", { className: "muted share-note" }, "코드 만료와 서버 데이터 삭제는 별개입니다. 내 작업공간을 삭제해도 공유본은 남습니다. 자세한 안내는 앱 정보의 개인정보 처리방침에서 확인할 수 있어요. ", el("a", { href: `mailto:${supportEmail}` }, "삭제 요청·문의")));
  const codeInput = el("input", { readOnly: true, "aria-label": "생성된 공유 코드", className: "share-code" });
  const result = el("div", { hidden: true }, field("공유 코드", codeInput), el("p", { className: "muted", role: "status" }));
  sheet.body.append(result);
  const copy = button("공유 코드 복사", (event) => busy(event.currentTarget, async () => {
    sheet.error(""); copy.textContent = "공유 코드 준비 중…";
    try {
      if (!issued || Date.parse(issued.expiresAt) <= Date.now()) issued = await services.sharing.create(value);
      if (!sheet.body.isConnected) return;
      codeInput.value = displayCode(issued.code); result.hidden = false;
      result.querySelector("p").textContent = `${new Date(issued.expiresAt).toLocaleDateString("ko-KR")}까지 사용 가능`;
      try {
        await navigator.clipboard.writeText(codeInput.value);
        services.toast("✓ 공유 코드가 복사되었어요.", 3000);
      } catch {
        codeInput.focus(); codeInput.select();
        sheet.error("자동 복사를 완료하지 못했어요. 선택된 코드를 Ctrl+C로 복사하거나 다시 눌러 주세요.");
      }
    } finally { copy.textContent = "공유 코드 복사"; }
  }, sheet.error), "btn primary full");
  copy.disabled = !prepared.pages.length;
  sheet.footer.append(copy);
}

export function openReceive(services) {
  const sheet = services.modal.open("공유 작업공간 받기"); if (!sheet) return;
  sheet.body.classList.add("sharing");
  const input = el("input", { placeholder: "공유 코드를 입력하세요", maxLength: 40, autoComplete: "off", spellcheck: false, className: "share-code" });
  const check = button("작업공간 확인", (event) => busy(event.currentTarget, async () => {
    sheet.error("");
    const code = normalizeCode(input.value);
    check.textContent = "확인 중…";
    try {
      const result = await services.sharing.get(code);
      if (!sheet.body.isConnected) return;
      input.value = "";
      sheet.body.replaceChildren(el("h3", {}, result.workspace.name), el("h4", {}, `${result.workspace.pages.length}개 페이지`), pageList(result.workspace.pages), accessNote());
      const save = button("저장", () => act(async () => {
        await services.sharing.save(result.previewId);
        sheet.close(true); services.toast("내 작업공간에 추가했어요.");
      }), "btn full");
      const open = button("바로 열기", () => act(async () => {
        sheet.close(true); await services.sharing.launch(result.previewId);
      }), "btn primary full");
      let working = false;
      async function act(action) {
        if (working) return;
        working = true; save.disabled = true; open.disabled = true; sheet.error("");
        try { await action(); } catch (error) { sheet.error(error.message); }
        finally { working = false; save.disabled = false; open.disabled = false; }
      }
      sheet.footer.replaceChildren(el("div", { className: "share-actions" }, save, open));
      save.focus();
    } finally { check.textContent = "작업공간 확인"; }
  }, sheet.error), "btn primary full");
  input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); check.click(); } });
  sheet.body.append(field("공유 코드", input)); sheet.footer.append(check); input.focus();
}
