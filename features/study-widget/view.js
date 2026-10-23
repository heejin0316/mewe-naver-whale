import { el, button, busy } from "../../shared/dom.js";
import { openEditor } from "./editor.js";
import { groupPages } from "./page-groups.js";
import { workspaceReorder } from "./reorder.js";
import { icon } from "../../shared/icons.js";
import { openShare, openReceive } from "../sharing/view.js";

export function mount(container, services) {
  let alive = true, revision = 0, managing = false;
  container.className = "view study-widget";
  const cards = el("div", { className: "workspace-list" });
  const reorder = workspaceReorder(container, cards, { move: (id, beforeId) => services.workspaceStore.move(id, beforeId), refresh, toast: services.toast });
  const errorBox = el("p", { className: "error", role: "alert", hidden: true });
  const total = el("span", { className: "workspace-total" }, "0");
  const listHeading = el("h2", { tabIndex: -1 }, "저장한 탭 모음", total);
  function confirmDelete(value) {
    const sheet = services.modal.open("탭 모음을 삭제할까요?");
    if (!sheet) return;
    sheet.body.append(
      el("h3", {}, value.name),
      el("p", {}, "삭제한 탭 모음은 복구할 수 없어요."),
      el("p", { className: "muted" }, "이미 열어둔 페이지와 전달한 공유본은 그대로 남아요.")
    );
    const cancel = button("취소", () => sheet.close(), "btn full");
    const remove = button("삭제", event => busy(event.currentTarget, async () => {
      await services.workspaceStore.remove(value.id);
      sheet.close(true);
      services.toast("탭 모음을 삭제했어요.");
    }, sheet.error), "btn danger full");
    sheet.footer.append(el("div", { className: "actions" }, cancel, remove));
    cancel.focus();
  }
  const capture = button("탭 저장하기", (event) => busy(event.currentTarget, async () => {
    const result = await services.browser.currentTabs();
    if (alive) openEditor(services, null, result.pages);
  }, services.toast), "btn primary full");
  capture.prepend(icon("save"));
  const manage = button("저장한 탭 관리", () => {
    managing = !managing;
    manage.textContent = managing ? "관리 완료" : "저장한 탭 관리";
    manage.setAttribute("aria-pressed", String(managing));
    listHeading.firstChild.nodeValue = managing ? "저장한 탭 관리" : "저장한 탭 모음";
    refresh();
    listHeading.scrollIntoView({ block: "start", behavior: "smooth" });
    listHeading.focus({ preventScroll: true });
  }, "btn");
  manage.setAttribute("aria-pressed", "false");
  container.replaceChildren(
    el("div", { className: "intro" }, el("span", { className: "intro-label" }, "MY TABS"), el("h1", {}, "나의 공부, 이어서."), el("p", { className: "muted" }, "필요한 탭을 저장하고, 다음에도 한 번에 열어보세요.")),
    capture,
    el("div", { className: "actions" },
      button("공유 코드 입력", () => openReceive(services), "btn"),
      manage
    ), el("div", { className: "workspace-section-head" }, listHeading, el("span", {}, "드래그로 순서 변경")), errorBox, cards
  );

  async function refresh() {
    const token = ++revision;
    try {
      const items = await services.workspaceStore.list();
      if (!alive || token !== revision) return;
      reorder.cancel(); errorBox.hidden = true; cards.replaceChildren();
      total.textContent = String(items.length);
      if (!items.length) cards.append(el("div", { className: "empty" }, icon("folder"), el("strong", {}, "첫 탭 모음을 만들어보세요"), el("p", {}, "지금 열어둔 공부 페이지를", el("br"), "한곳에 저장할 수 있어요.")));
      items.forEach((w) => {
        const groups = groupPages(w.pages);
        const dualCount = groups.filter((group) => group.dual).length;
        const card = el("article", { className: "card workspace-card", draggable: true, tabIndex: 0, "data-workspace-id": w.id, "aria-label": w.name, "aria-keyshortcuts": "Alt+ArrowUp Alt+ArrowDown" });
        const tone = [...w.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 7;
        const folder = el("span", { className: `workspace-symbol tone-${tone}`, "aria-hidden": "true" }, icon("folder"));
        const menu = el("div", { className: "workspace-menu", hidden: true });
        const toggle = button("⋮", () => { menu.hidden = !menu.hidden; }, "icon-button");
        toggle.setAttribute("aria-label", `${w.name} 메뉴`);
        toggle.hidden = managing;
        menu.append(
          button("수정", () => { menu.hidden = true; openEditor(services, w); }, "text-button"),
          button("삭제", () => { menu.hidden = true; confirmDelete(w); }, "text-button danger")
        );
        card.append(
          el("div", { className: "workspace-card-header" }, folder, el("div", { className: "workspace-heading" }, el("h3", {}, w.name), el("p", { className: "muted" }, `${w.pages.length}개 페이지${dualCount ? ` · 듀얼탭 ${dualCount}개` : ""}`)), toggle, menu),
          el("div", { className: "site-list" }, ...groups.map((group) => group.dual
            ? el("div", { className: "saved-dual-group" }, el("span", { className: "dual-badge" }, "듀얼탭"), ...group.pages.map((p, i) => el("div", { className: "saved-page", title: p.title }, el("span", { className: "page-side", "aria-label": i === 0 ? "왼쪽 페이지" : "오른쪽 페이지" }, i === 0 ? "A" : "B"), el("span", { className: "saved-page-title" }, p.title))))
            : el("div", { className: "saved-page single-page", title: group.pages[0].title }, icon("page"), el("span", { className: "saved-page-title" }, group.pages[0].title)))),
          el("div", { className: "actions workspace-actions" })
        );
        const running = w.openedCount > 0;
        const action = button("", (event) => busy(event.currentTarget, () => running ? services.closeWorkspace(w) : services.launch(w), services.toast), `btn ${running ? "workspace-close" : "primary workspace-open"}`);
        action.textContent = running ? "한 번에 닫기" : "한 번에 열기";
        action.setAttribute("aria-label", action.textContent);
        const share = button("", () => { menu.hidden = true; openShare(services, w); }, "btn workspace-share");
        share.setAttribute("aria-label", "탭 모음 공유");
        share.textContent = "탭 모음 공유";
        card.querySelector(".workspace-actions").append(action, share);
        if (managing) {
          card.querySelector(".workspace-actions").replaceChildren(
            button("수정", () => openEditor(services, w), "btn workspace-share workspace-edit"),
            button("삭제", () => confirmDelete(w), "btn workspace-delete")
          );
        }
        if (w.openedCount > 0) {
          card.querySelector(".workspace-heading").append(el("span", { className: "workspace-running" }, `${w.openedCount}개 페이지 열림`));
        }
        cards.append(card);
      });
    } catch (error) { if (alive) { errorBox.textContent = error.message; errorBox.hidden = false; } }
  }
  const unsubscribe = services.workspaceStore.subscribe(refresh); refresh();
  return () => { alive = false; revision++; reorder.destroy(); unsubscribe(); };
}
