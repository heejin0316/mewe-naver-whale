import { el, button, busy } from "../../shared/dom.js";
import { openEditor } from "./editor.js";

export function mount(container, services) {
  let alive = true, revision = 0;
  container.className = "view study-widget";
  const cards = el("div", { className: "workspace-list" });
  const errorBox = el("p", { className: "error", role: "alert", hidden: true });
  const capture = button("지금 작업공간 저장", (event) => busy(event.currentTarget, async () => {
    const result = await services.browser.currentTabs();
    if (alive) openEditor(services, null, result.pages);
  }, services.toast), "btn primary full");
  container.replaceChildren(
    el("div", { className: "intro" }, el("h1", {}, "하던 공부, 그대로 이어서."), el("p", { className: "muted" }, "열어둔 페이지를 저장하고 필요할 때 다시 열어보세요.")),
    capture,
    el("div", { className: "actions" },
      button("＋ 새 작업공간", () => openEditor(services), "btn")
    ), errorBox, cards
  );

  async function refresh() {
    const token = ++revision;
    try {
      const items = await services.workspaceStore.list();
      if (!alive || token !== revision) return;
      errorBox.hidden = true; cards.replaceChildren();
      if (!items.length) cards.append(el("div", { className: "empty" }, "저장한 작업공간이 없어요."));
      items.forEach((w) => {
        const card = el("article", { className: "card workspace-card" });
        const menu = el("div", { className: "workspace-menu", hidden: true });
        const toggle = button("⋮", () => { menu.hidden = !menu.hidden; }, "icon-button");
        toggle.setAttribute("aria-label", `${w.name} 메뉴`);
        menu.append(
          button("수정", () => { menu.hidden = true; openEditor(services, w); }, "text-button"),
          button("삭제", (event) => { menu.hidden = true; busy(event.currentTarget, () => services.workspaceStore.remove(w.id), services.toast); }, "text-button danger")
        );
        card.append(
          el("div", { className: "workspace-card-header" }, el("h3", {}, w.name), toggle, menu),
          el("p", { className: "muted" }, `${w.pages.length}개 페이지`),
          el("p", { className: "site-list" }, w.pages.map((p) => p.title).join(" · ")),
          el("div", { className: "actions" },
            button("작업공간 열기", (event) => busy(event.currentTarget, () => services.launch(w), services.toast), "btn primary")
          )
        );
        cards.append(card);
      });
    } catch (error) { if (alive) { errorBox.textContent = error.message; errorBox.hidden = false; } }
  }
  const unsubscribe = services.workspaceStore.subscribe(refresh); refresh();
  return () => { alive = false; revision++; unsubscribe(); };
}
