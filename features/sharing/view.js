import { el, button, field, busy } from "../../shared/dom.js";
import { prepareShare, normalizeCode, displayCode, SHARE_DAYS } from "./model.js";
import { supportEmail, privacyUrl } from "../../shared/privacy-content.js";
import { privacyDetails } from "../about/view.js";
import { request } from "../../shared/messages.js";
import { CONSENT_VERSION } from "./consent.js";
import { groupPages } from "../study-widget/page-groups.js";
import { icon } from "../../shared/icons.js";

function pageList(pages) {
  return el("ul", { className: "share-pages" }, ...pages.map((p) => el("li", {}, el("strong", {}, p.title), el("small", {}, p.url))));
}
const accessNote = () => el("p", { className: "muted share-note" }, "로그인·접근 권한이나 개인별 화면 상태에 따라 공유한 사람과 다른 화면이 열릴 수 있어요.");

function previewCard(value) {
  const groups = groupPages(value.pages);
  const dualCount = groups.filter((group) => group.dual).length;
  const tone = [...value.name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 7;
  return el("article", { className: "card workspace-card share-preview", "aria-label": `공유받은 탭 모음: ${value.name}` },
    el("div", { className: "workspace-card-header" },
      el("span", { className: `workspace-symbol tone-${tone}`, "aria-hidden": "true" }, icon("folder")),
      el("div", { className: "workspace-heading" }, el("h3", {}, value.name),
        el("p", { className: "muted" }, `${value.pages.length}개 페이지${dualCount ? ` · 듀얼탭 ${dualCount}개` : ""}`))),
    el("div", { className: "site-list" }, ...groups.map((group) => group.dual
      ? el("div", { className: "saved-dual-group" }, el("span", { className: "dual-badge" }, "듀얼탭"),
        ...group.pages.map((page, index) => el("div", { className: "saved-page", title: `${page.title}\n${page.url}` },
          el("span", { className: "page-side", "aria-label": index === 0 ? "왼쪽 페이지" : "오른쪽 페이지" }, index === 0 ? "A" : "B"),
          el("span", { className: "saved-page-title" }, page.title))))
      : el("div", { className: "saved-page single-page", title: `${group.pages[0].title}\n${group.pages[0].url}` },
        icon("page"), el("span", { className: "saved-page-title" }, group.pages[0].title)))));
}

function sharingConsent(sheet, onChange) {
  let accepted = false, loaded = false;
  const inputs = [el("input", { type: "checkbox" }), el("input", { type: "checkbox" })];
  for (const input of inputs) input.addEventListener("change", onChange);
  const area = el("section", { className: "sharing-consent-area" }, el("p", { className: "muted share-note" }, "공유 이용 설정을 확인하고 있어요."));
  sheet.body.append(area);
  function render() {
    area.replaceChildren(...(accepted ? [el("p", { className: "muted share-note" }, el("a", { href: privacyUrl, target: "_blank", rel: "noopener noreferrer" }, "개인정보 처리방침"))] : [
      el("p", { className: "muted share-note" }, "처음 한 번만 동의해 주세요. 공유 인증 정보는 미국에서 처리돼요. 동의하지 않아도 개인 탭 모음은 사용할 수 있어요."),
      privacyDetails(),
      el("label", { className: "check-line share-consent" }, inputs[0], el("span", {}, "공유 기능의 개인정보 수집·이용에 동의해요.")),
      el("label", { className: "check-line share-consent" }, inputs[1], el("span", {}, "공유 인증 정보의 국외 이전에 동의해요."))
    ]));
  }
  request("SHARE_CONSENT_STATUS").then(status => {
    if (!area.isConnected) return;
    accepted = status.accepted === true; loaded = true; render(); onChange();
  }).catch(error => {
    if (!area.isConnected) return;
    area.replaceChildren(el("p", { className: "notice" }, "공유 설정을 불러오지 못했어요. 화면을 닫았다가 다시 열어 주세요."));
    sheet.error(error.message);
  });
  return {
    get checked() { return loaded && (accepted || inputs.every(input => input.checked)); },
    set disabled(value) { for (const input of inputs) input.disabled = value; },
    async remember() {
      if (!this.checked) throw new Error("공유 기능에 필요한 정보 처리에 동의해 주세요.");
      if (!accepted) {
        await request("SHARE_CONSENT_ACCEPT", { version: CONSENT_VERSION, processing: inputs[0].checked, overseas: inputs[1].checked });
        accepted = true; render();
      }
    }
  };
}

export function openShare(services, value) {
  const prepared = prepareShare(value);
  const sheet = services.modal.open("탭 모음 공유"); if (!sheet) return;
  sheet.body.classList.add("sharing");
  let issued = null;
  sheet.body.append(el("h3", {}, prepared.name), el("h4", {}, `공유할 페이지 · ${prepared.pages.length}개`),
    prepared.pages.length ? pageList(prepared.pages) : el("p", { className: "notice" }, "공유할 수 있는 웹페이지가 없어요."));
  if (prepared.excluded.length) sheet.body.append(el("section", { className: "share-excluded" },
    el("h4", {}, `제외되는 페이지 · ${prepared.excluded.length}개`),
    el("ul", {}, ...prepared.excluded.map((p) => el("li", {}, p.title))),
    el("p", {}, "내 컴퓨터에 저장된 파일은 공유할 수 없어요. 듀얼탭 한쪽이 제외되면 남은 페이지는 일반탭으로 전달돼요.")));
  sheet.body.append(el("ul", { className: "share-guidance" },
    el("li", {}, "내 컴퓨터의 파일은 공유에서 제외돼요."),
    el("li", {}, "로그인·접근 권한이 필요하거나 개인별 화면 상태에 따라 달라지는 페이지는 받는 사람에게 같은 화면으로 열리지 않을 수 있어요."),
    el("li", {}, `코드를 아는 사람은 ${SHARE_DAYS}일 동안 페이지 목록을 볼 수 있어요.`),
    el("li", {}, "주소에 개인정보나 비공개 문서 접근 정보가 없는지 확인해 주세요."),
    el("li", {}, "공유 데이터는 생성 후 최대 14일 이내 삭제돼요. ", el("a", { href: `mailto:${supportEmail}` }, "삭제 요청"))),
    el("p", { className: "muted share-note" }, "공유 코드 복사를 누르면 위 이름과 페이지 정보를 저장해 공유해요."));
  const codeInput = el("input", { readOnly: true, "aria-label": "생성된 공유 코드", className: "share-code" });
  const result = el("div", { hidden: true }, field("공유 코드", codeInput), el("p", { className: "muted", role: "status" }));
  sheet.body.append(result);
  const copy = button("공유 코드 복사", (event) => busy(event.currentTarget, async () => {
    if (!consent.checked) throw new Error("공유 기능에 필요한 정보 처리에 동의해 주세요.");
    consent.disabled = true;
    sheet.error(""); copy.textContent = "공유 코드 준비 중…";
    try {
      await consent.remember();
      if (!sheet.body.isConnected) return;
      if (!issued || Date.parse(issued.expiresAt) <= Date.now()) issued = await services.sharing.create(value);
      if (!sheet.body.isConnected) return;
      codeInput.value = displayCode(issued.code); result.hidden = false;
      result.querySelector("p").textContent = `${new Date(issued.expiresAt).toLocaleDateString("ko-KR")}까지 사용 가능`;
      try {
        await navigator.clipboard.writeText(codeInput.value);
        services.toast("이후 수정사항은 자동으로 반영되지 않아요.", { title: "공유된 탭 모음은 독립적인 복사본입니다.", duration: 3500, fade: true });
      } catch {
        codeInput.focus(); codeInput.select();
        sheet.error("자동 복사를 완료하지 못했어요. 선택된 코드를 Ctrl+C로 복사하거나 다시 눌러 주세요.");
      }
    } finally { copy.textContent = "공유 코드 복사"; consent.disabled = false; }
  }, sheet.error), "btn primary full");
  const consent = sharingConsent(sheet, () => { copy.disabled = !prepared.pages.length || !consent.checked; });
  copy.disabled = true;
  sheet.footer.append(copy);
}

export function openReceive(services) {
  const sheet = services.modal.open("공유 코드 입력"); if (!sheet) return;
  sheet.body.classList.add("sharing", "study-widget");
  let loading = false, pasting = false;
  const input = el("input", { id: "receive-share-code", placeholder: "XXXX-XXXX-XXXX", maxLength: 40, autoComplete: "off", spellcheck: false, className: "share-code", "aria-label": "공유 코드" });
  function syncControls() {
    check.disabled = loading || pasting || !consent.checked;
    paste.disabled = loading || pasting;
    input.readOnly = loading || pasting;
    consent.disabled = loading;
  }
  const paste = button("붙여넣기", async () => {
    if (loading || pasting) return;
    sheet.error(""); pasting = true; syncControls();
    try {
      let text;
      try {
        if (!navigator.clipboard?.readText) throw new Error("Clipboard reading unavailable");
        text = await navigator.clipboard.readText();
      } catch {
        throw new Error("클립보드를 읽지 못했어요. 입력란에서 Ctrl+V로 코드를 붙여넣어 주세요.");
      }
      if (!sheet.body.isConnected) return;
      if (!text.trim()) throw new Error("복사된 내용이 없어요. 공유 코드를 먼저 복사해 주세요.");
      try { input.value = displayCode(text); }
      catch { throw new Error("복사한 내용이 공유 코드 형식과 달라요. 12자리 공유 코드를 다시 복사해 주세요."); }
    } catch (error) { if (sheet.body.isConnected) sheet.error(error.message); }
    finally {
      pasting = false; syncControls();
      if (sheet.body.isConnected) input.focus();
    }
  }, "btn share-paste");
  const check = button("탭 불러오기", async () => {
    if (loading || pasting) return;
    sheet.error("");
    try {
      const code = normalizeCode(input.value);
      if (!consent.checked) throw new Error("공유 기능에 필요한 정보 처리에 동의해 주세요.");
      loading = true; syncControls(); check.textContent = "불러오는 중…";
      await consent.remember();
      if (!sheet.body.isConnected) return;
      const result = await services.sharing.get(code);
      if (!sheet.body.isConnected) return;
      input.value = "";
      sheet.body.replaceChildren(previewCard(result.workspace), accessNote());
      const save = button("저장", () => act(async () => {
        await services.sharing.save(result.previewId);
        sheet.close(true); services.toast("저장한 탭 모음에 추가했어요.");
      }), "btn full");
      const open = button("바로 열기", () => act(async () => {
        const saved = await services.sharing.save(result.previewId);
        if (sheet.body.isConnected) sheet.close(true);
        await services.launch(saved);
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
    } catch (error) { if (sheet.body.isConnected) sheet.error(error.message); }
    finally { loading = false; check.textContent = "탭 불러오기"; syncControls(); }
  }, "btn primary full");
  input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); check.click(); } });
  sheet.body.append(el("div", { className: "field" }, el("label", { htmlFor: input.id }, "공유 코드"), el("div", { className: "share-code-entry" }, input, paste)));
  const consent = sharingConsent(sheet, syncControls);
  syncControls();
  sheet.footer.append(check); input.focus();
}
