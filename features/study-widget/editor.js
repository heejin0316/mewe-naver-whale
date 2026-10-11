import { el, button, field, busy } from "../../shared/dom.js";
import { pageUrl, pageTitle, workspace } from "../../shared/validation.js";
import { groupPages, prepareRows } from "./page-groups.js";
import { icon } from "../../shared/icons.js";

export function openEditor(services, original = null, captured = null) {
  let dirty = false;
  let rows = prepareRows(original?.pages || captured || []);
  const sheet = services.modal.open(original ? "작업공간 수정" : "작업공간 만들기", { dirty: () => dirty });
  if (!sheet) return;
  const name = el("input", { value: original?.name || "", maxLength: 60, placeholder: "작업공간 이름" });
  name.addEventListener("input", () => { dirty = true; });
  const list = el("div", { className: "page-edit-list" });
  const count = el("p", { className: "muted", role: "status" });
  let openedMenu = null;
  function closeMenu(restoreFocus = false) {
    if (!openedMenu) return;
    const { menu, toggle } = openedMenu;
    menu.hidden = true; toggle.setAttribute("aria-expanded", "false"); openedMenu = null;
    if (restoreFocus) toggle.focus();
  }
  const dialog = sheet.body.closest("dialog");
  // Holding Enter must not activate Save after focus moves from the link field.
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.repeat) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  dialog.addEventListener("click", (event) => {
    if (openedMenu && !openedMenu.row.contains(event.target)) closeMenu();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && openedMenu) {
      event.preventDefault(); event.stopPropagation(); closeMenu(true);
    }
  });
  const addButton = button("＋ 링크 직접 추가", () => { addForm.hidden = false; addButton.hidden = true; urlInput.focus(); }, "btn full add-link-button");
  const urlInput = el("input", { type: "text", placeholder: "https://... 또는 C:\\자료\\강의.pdf", "aria-label": "추가할 링크 주소", "aria-describedby": "link-address-hint" });
  function addLink() {
    try {
      const url = pageUrl(urlInput.value);
      if (rows.filter((p) => p.selected).length >= 10) throw new Error("페이지는 최대 10개까지 선택할 수 있어요.");
      rows.push({ id: crypto.randomUUID(), title: pageTitle(url), url, openMode: "tab", dualGroupId: null, selected: true });
      urlInput.value = ""; addForm.hidden = true; addButton.hidden = false; dirty = true; sheet.error(""); renderRows();
      (name.value.trim() ? saveButton : name).focus();
    } catch (error) { sheet.error(error.message); urlInput.focus(); }
  }
  const addForm = el("div", { className: "add-link-form", hidden: true }, field("웹 주소 또는 파일 경로", urlInput), el("p", { id: "link-address-hint", className: "muted" }, "웹 주소나 파일의 전체 경로를 넣고 Enter로 추가하세요. 추가 후 Enter를 한 번 더 누르면 저장돼요. 파일을 옮기면 경로도 수정해야 해요."), button("추가", addLink, "btn primary full"));
  urlInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
    event.preventDefault(); addLink();
  });
  name.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (!addForm.hidden && urlInput.value.trim()) { urlInput.focus(); return; }
    saveButton.click();
  });

  function renderRows() {
    closeMenu();
    list.replaceChildren();
    const selectedCount = rows.filter((p) => p.selected).length;
    const groups = groupPages(rows);
    const dualCount = groups.filter((group) => group.dual && group.pages.every((p) => p.selected)).length;
    count.textContent = selectedCount + (original ? "개 페이지" : "개 페이지 선택") + (dualCount ? " · 듀얼탭 " + dualCount + "개" : "");
    if (!rows.length && original) list.append(el("p", { className: "muted page-list-empty" }, "페이지가 없어요. 저장하려면 링크를 추가해 주세요."));
    groups.forEach((group) => {
      group.pages.forEach((page, side) => {
        const checked = el("input", { type: "checkbox", checked: page.selected, "aria-label": page.title + " 작업공간에 넣기" });
        checked.addEventListener("change", () => {
          const otherCount = rows.filter((p) => p.selected && !group.pages.includes(p)).length;
          if (checked.checked && otherCount + group.pages.length > 10) {
            checked.checked = false;
            sheet.error(group.dual ? "듀얼탭의 두 페이지를 함께 선택하려면 2개 자리가 필요해요. 최대 10개까지 저장할 수 있어요." : "페이지는 최대 10개까지 선택할 수 있어요.");
            return;
          }
          group.pages.forEach((p) => { p.selected = checked.checked; });
          dirty = true; sheet.error(""); renderRows();
        });
        const row = el(original ? "div" : "label", { className: "page-choice" + (original ? " page-choice-edit" : "") }, original ? null : checked,
          el("span", { className: "page-choice-copy" }, el("strong", {}, page.title), el("small", {}, page.url)));
        if (group.dual) row.append(el("span", { className: "dual-badge", "data-side": side === 0 ? "a" : "b", title: (side === 0 ? "왼쪽" : "오른쪽") + " 페이지" + (original ? "" : " · 두 페이지를 함께 저장해요") }, "듀얼탭 " + (side === 0 ? "A" : "B")));
        if (original) {
          const menu = el("div", { className: "page-menu", role: "menu", "aria-label": page.title + " 메뉴", hidden: true });
          const toggle = button("⋮", () => {
            const wasOpen = !menu.hidden; closeMenu();
            if (!wasOpen) { menu.hidden = false; toggle.setAttribute("aria-expanded", "true"); openedMenu = { menu, toggle, row }; remove.focus(); }
          }, "icon-button page-menu-toggle");
          toggle.setAttribute("aria-label", page.title + " 메뉴");
          toggle.setAttribute("aria-haspopup", "menu"); toggle.setAttribute("aria-expanded", "false");
          const remove = button("작업공간에서 제거", () => {
            const index = rows.indexOf(page);
            rows = rows.filter((p) => p !== page);
            if (group.dual) group.pages.filter((p) => p !== page).forEach((p) => { p.openMode = "tab"; p.dualGroupId = null; });
            dirty = true; sheet.error(""); renderRows();
            const next = list.querySelectorAll(".page-menu-toggle");
            (next[Math.min(index, next.length - 1)] || addButton).focus();
          }, "text-button");
          remove.setAttribute("role", "menuitem"); remove.prepend(icon("trash"));
          menu.append(remove); row.append(toggle, menu);
          row.addEventListener("focusout", (event) => { if (!row.contains(event.relatedTarget)) closeMenu(); });
        }
        list.append(row);
      });
    });
  }

  sheet.body.classList.add("study-widget");
  sheet.body.append(field("작업공간 이름", name), el("h3", {}, original ? "작업공간에 담긴 페이지" : "작업공간에 넣을 페이지"), count, list, addButton, addForm);
  const saveButton = button("저장", (event) => busy(event.currentTarget, async () => {
    const value = workspace({ name: name.value, pages: rows.filter((p) => p.selected) });
    await services.workspaceStore.save({ ...value, ...(original ? { id: original.id, updatedAt: original.updatedAt } : {}) });
    dirty = false; sheet.close(true); services.toast("작업공간을 저장했어요.");
  }, sheet.error), "btn primary full");
  sheet.footer.append(saveButton);
  renderRows(); name.focus();
  if (!original && !captured) {
    services.browser.currentTabs().then((result) => {
      if (!sheet.body.isConnected || dirty) return;
      rows = prepareRows(result.pages);
      renderRows();
    }).catch((error) => sheet.error(error.message));
  }
}
