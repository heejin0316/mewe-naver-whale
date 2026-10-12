import { el, button, busy } from "../../shared/dom.js";
import { openEditor } from "./editor.js";
import { groupPages } from "./page-groups.js";
import { workspaceReorder } from "./reorder.js";
import { icon } from "../../shared/icons.js";
import { openShare, openReceive } from "../sharing/view.js";

export function mount(container, services) {
  let alive = true, revision = 0;
  container.className = "view study-widget";
  const cards = el("div", { className: "workspace-list" });
  const reorder = workspaceReorder(container, cards, { move: (id, beforeId) => services.workspaceStore.move(id, beforeId), refresh, toast: services.toast });
  const errorBox = el("p", { className: "error", role: "alert", hidden: true });
  const total = el("span", { className: "workspace-total" }, "0");
  const capture = button("지금 작업공간 저장", (event) => busy(event.currentTarget, async () => {
    const result = await services.browser.currentTabs();
    if (alive) openEditor(services, null, result.pages);
  }, services.toast), "btn primary full");
  capture.prepend(icon("save"));
  container.replaceChildren(
    el("div", { className: "intro" }, el("span", { className: "intro-label" }, "MY WORKSPACE"), el("h1", {}, "나의 공부, 이어서."), el("p", { className: "muted" }, "열어둔 페이지를 작업공간에 저장하고, 필요할 때 다시 열어보세요.")),
    capture,
    el("div", { className: "actions" },
      button("＋ 새 작업공간", () => openEditor(services), "btn"),
      button("공유 작업공간 받기", () => openReceive(services), "btn")
    ), el("div", { className: "workspace-section-head" }, el("h2", {}, "내 작업공간", total), el("span", {}, "드래그로 순서 변경")), errorBox, cards
  );

  async function refresh() {
    const token = ++revision;
    try {
      const items = await services.workspaceStore.list();
      if (!alive || token !== revision) return;
      reorder.cancel(); errorBox.hidden = true; cards.replaceChildren();
      total.textContent = String(items.length);
      if (!items.length) cards.append(el("div", { className: "empty" }, icon("folder"), el("strong", {}, "첫 작업공간을 만들어보세요"), el("p", {}, "지금 열어둔 공부 페이지를", el("br"), "한곳에 저장할 수 있어요.")));
      items.forEach((w) => {
        const groups = groupPages(w.pages);
        const dualCount = groups.filter((group) => group.dual).length;
        const card = el("article", { className: "card workspace-card", draggable: true, tabIndex: 0, "data-workspace-id": w.id, "aria-label": w.name, "aria-keyshortcuts": "Alt+ArrowUp Alt+ArrowDown" });
        const tone = [...w.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 7;
        const folder = el("span", { className: `workspace-symbol tone-${tone}`, "aria-hidden": "true" }, icon("folder"));
        const menu = el("div", { className: "workspace-menu", hidden: true });
        const toggle = button("⋮", () => { menu.hidden = !menu.hidden; }, "icon-button");
        toggle.setAttribute("aria-label", `${w.name} 메뉴`);
        menu.append(
          button("수정", () => { menu.hidden = true; openEditor(services, w); }, "text-button"),
          button("삭제", (event) => { menu.hidden = true; busy(event.currentTarget, () => services.workspaceStore.remove(w.id), services.toast); }, "text-button danger")
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
        action.setAttribute("aria-label", running ? "작업공간 닫기" : "작업공간 열기");
        action.append(el("span", { className: "workspace-action-prefix", "aria-hidden": "true" }, "작업공간 "), running ? "닫기" : "열기");
        const share = button("", () => { menu.hidden = true; openShare(services, w); }, "btn workspace-share");
        share.setAttribute("aria-label", "작업공간 공유");
        share.append(el("span", { className: "workspace-action-prefix", "aria-hidden": "true" }, "작업공간 "), "공유");
        card.querySelector(".workspace-actions").append(action, share);
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
