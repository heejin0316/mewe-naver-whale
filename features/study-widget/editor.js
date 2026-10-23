import { el, button, field, busy } from "../../shared/dom.js";
import { pageUrl, pageTitle, workspace } from "../../shared/validation.js";
import { groupPages, prepareRows, selectedPages } from "./page-groups.js";
import { icon } from "../../shared/icons.js";

export function openEditor(services, original = null, captured = null) {
  let dirty = false;
  let pagesEdited = false;
  let rows = prepareRows(original?.pages || captured || []);
  const sheet = services.modal.open(original ? "탭 모음 수정" : "탭 저장하기", { dirty: () => dirty });
  if (!sheet) return;
  const name = el("input", { value: original?.name || "", maxLength: 60, placeholder: "탭 모음 이름" });
  name.addEventListener("input", () => { dirty = true; });
  const newName = field("탭 모음 이름", name);
  const newDestination = el("input", { type: "radio", name: "save-destination", value: "new", checked: true });
  const existingDestination = el("input", { type: "radio", name: "save-destination", value: "existing", disabled: true });
  const destinationSelect = el("select", {}, el("option", { value: "" }, "탭 모음을 선택해 주세요"));
  const existingField = field("추가할 탭 모음", destinationSelect);
  existingField.hidden = true;
  const destinationAvailability = el("p", { className: "muted save-destination-availability", role: "status" }, "저장한 탭 모음을 불러오고 있어요.");
  const destinationCount = el("p", { className: "muted save-destination-count", role: "status", hidden: true });
  let destinations = [];
  function updateDestinationCount() {
    const selected = destinations.find((item) => item.id === destinationSelect.value);
    destinationCount.hidden = !existingDestination.checked || !selected;
    if (!destinationCount.hidden) {
      const added = rows.filter((page) => page.selected).length;
      const total = selected.pages.length + added;
      destinationCount.textContent = `기존 ${selected.pages.length}개 + 선택한 ${added}개 = 총 ${total}개 · 최대 10개`;
      destinationCount.classList.toggle("save-destination-overflow", total > 10);
    }
  }
  function chooseDestination() {
    dirty = true; sheet.error("");
    newName.hidden = existingDestination.checked;
    existingField.hidden = !existingDestination.checked;
    updateDestinationCount();
    (existingDestination.checked ? destinationSelect : name).focus();
  }
  newDestination.addEventListener("change", chooseDestination);
  existingDestination.addEventListener("change", chooseDestination);
  destinationSelect.addEventListener("change", () => {
    dirty = true; sheet.error(""); updateDestinationCount();
    destinationSelect.scrollIntoView({ block: "nearest" });
  });
  const destinationSection = el("fieldset", { className: "save-destination" },
    el("legend", {}, "어디에 저장할까요?"),
    el("label", { className: "save-destination-choice" }, newDestination, el("span", {}, "새 탭 모음 만들기")),
    el("label", { className: "save-destination-choice" }, existingDestination, el("span", {}, "기존 탭 모음에 추가하기")),
    destinationAvailability, newName, destinationCount, existingField);
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
      urlInput.value = ""; addForm.hidden = true; addButton.hidden = false; dirty = true; pagesEdited = true; sheet.error(""); renderRows();
      (existingDestination.checked ? (destinationSelect.value ? saveButton : destinationSelect) : (name.value.trim() ? saveButton : name)).focus();
    } catch (error) { sheet.error(error.message); urlInput.focus(); }
  }
  const addForm = el("div", { className: "add-link-form", hidden: true }, field("웹 주소 또는 파일 경로", urlInput), el("p", { id: "link-address-hint", className: "muted" }, "웹 주소나 파일의 전체 경로를 넣고 Enter로 추가하세요. 추가 후 Enter를 한 번 더 누르면 저장돼요. 파일을 옮기면 경로도 수정해야 해요."), el("div", { className: "add-link-actions" }, button("추가", addLink, "btn primary add-link-submit")));
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

  function renderRows(focusId = null) {
    closeMenu();
    list.replaceChildren();
    const selectedCount = rows.filter((p) => p.selected).length;
    const groups = groupPages(rows);
    const dualCount = groups.filter((group) => group.dual && group.pages.every((p) => p.selected)).length;
    count.textContent = selectedCount + (original ? "개 페이지" : "개 페이지 선택") + (dualCount ? " · 듀얼탭 " + dualCount + "개" : "");
    updateDestinationCount();
    if (!rows.length && original) list.append(el("p", { className: "muted page-list-empty" }, "페이지가 없어요. 저장하려면 링크를 추가해 주세요."));
    let focusTarget;
    groups.forEach((group) => {
      group.pages.forEach((page, side) => {
        const checked = el("input", { type: "checkbox", checked: page.selected, "aria-label": page.title + " 탭 모음에 넣기" });
        checked.addEventListener("change", () => {
          const otherCount = rows.filter((p) => p.selected && p !== page).length;
          if (checked.checked && otherCount >= 10) {
            checked.checked = false;
            sheet.error("페이지는 최대 10개까지 선택할 수 있어요.");
            return;
          }
          page.selected = checked.checked;
          dirty = true; pagesEdited = true; sheet.error(""); renderRows(page.id);
        });
        const row = el(original ? "div" : "label", { className: "page-choice" + (original ? " page-choice-edit" : "") }, original ? null : checked,
          el("span", { className: "page-choice-copy" }, el("strong", {}, page.title), el("small", {}, page.url)));
        if (group.dual && group.pages.every((p) => p.selected)) row.append(el("span", { className: "dual-badge", "data-side": side === 0 ? "a" : "b", title: (side === 0 ? "왼쪽" : "오른쪽") + " 페이지" + (original ? "" : " · 한쪽만 선택하면 일반 페이지로 저장해요") }, "듀얼탭 " + (side === 0 ? "A" : "B")));
        if (original) {
          const menu = el("div", { className: "page-menu", role: "menu", "aria-label": page.title + " 메뉴", hidden: true });
          const toggle = button("⋮", () => {
            const wasOpen = !menu.hidden; closeMenu();
            if (!wasOpen) { menu.hidden = false; toggle.setAttribute("aria-expanded", "true"); openedMenu = { menu, toggle, row }; remove.focus(); }
          }, "icon-button page-menu-toggle");
          toggle.setAttribute("aria-label", page.title + " 메뉴");
          toggle.setAttribute("aria-haspopup", "menu"); toggle.setAttribute("aria-expanded", "false");
          const remove = button("탭 모음에서 제거", () => {
            const index = rows.indexOf(page);
            rows = rows.filter((p) => p !== page);
            if (group.dual) group.pages.filter((p) => p !== page).forEach((p) => { p.openMode = "tab"; p.dualGroupId = null; });
            dirty = true; pagesEdited = true; sheet.error(""); renderRows();
            const next = list.querySelectorAll(".page-menu-toggle");
            (next[Math.min(index, next.length - 1)] || addButton).focus();
          }, "text-button");
          remove.setAttribute("role", "menuitem"); remove.prepend(icon("trash"));
          menu.append(remove); row.append(toggle, menu);
          row.addEventListener("focusout", (event) => { if (!row.contains(event.relatedTarget)) closeMenu(); });
        }
        list.append(row);
        if (!original && page.id === focusId) focusTarget = checked;
      });
    });
    focusTarget?.focus();
  }

  sheet.body.classList.add("study-widget");
  if (original) sheet.body.append(newName);
  const pagesHeading = el("h3", { tabIndex: -1 }, original ? "탭 모음에 담긴 페이지" : "저장할 페이지");
  sheet.body.append(pagesHeading, count, list, addButton, addForm);
  if (!original) sheet.body.append(destinationSection);
  const saveButton = button("저장", (event) => busy(event.currentTarget, async () => {
    if (!addForm.hidden && urlInput.value.trim()) {
      urlInput.focus(); throw new Error("입력한 링크를 먼저 추가해 주세요.");
    }
    if (!original && existingDestination.checked) {
      if (!destinationSelect.value) { destinationSelect.focus(); throw new Error("추가할 탭 모음을 선택해 주세요."); }
      await services.workspaceStore.append(destinationSelect.value, selectedPages(rows));
    } else {
      const value = workspace({ name: name.value, pages: selectedPages(rows) });
      await services.workspaceStore.save({ ...value, ...(original ? { id: original.id, updatedAt: original.updatedAt } : {}) });
    }
    dirty = false; sheet.close(true); services.toast(existingDestination.checked ? "탭 모음에 추가했어요." : "탭 모음을 저장했어요.");
  }, sheet.error), "btn primary full");
  sheet.footer.append(saveButton);
  renderRows();
  (original ? name : (list.querySelector("input[type=checkbox]") || pagesHeading)).focus({ preventScroll: true });
  if (!original) {
    services.workspaceStore.list().then((items) => {
      if (!sheet.body.isConnected) return;
      destinations = items;
      destinationSelect.append(...items.map((item) => el("option", { value: item.id }, `${item.name} · ${item.pages.length}개 페이지`)));
      existingDestination.disabled = !items.length;
      destinationAvailability.textContent = items.length ? "" : "저장한 탭 모음이 없어요. 먼저 새 탭 모음을 만들어 주세요.";
      destinationAvailability.hidden = !!items.length;
    }).catch(() => {
      if (sheet.body.isConnected) destinationAvailability.textContent = "탭 모음 목록을 불러오지 못했어요. 다시 열거나 새 탭 모음으로 저장해 주세요.";
    });
  }
  if (!original && !captured) {
    services.browser.currentTabs().then((result) => {
      if (!sheet.body.isConnected || pagesEdited) return;
      rows = prepareRows(result.pages);
      renderRows();
    }).catch((error) => sheet.error(error.message));
  }
}
