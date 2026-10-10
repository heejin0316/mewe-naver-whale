import { el, button, field, busy } from "../../shared/dom.js";
import { webUrl, workspace } from "../../shared/validation.js";

export function openEditor(services, original = null, captured = null) {
  let dirty = false;
  let rows = (original?.pages || captured || []).map((page, index) => ({ ...page, selected: !original && index >= 10 ? false : true }));
  const sheet = services.modal.open(original ? "작업공간 수정" : "작업공간 만들기", { dirty: () => dirty });
  if (!sheet) return;
  const name = el("input", { value: original?.name || "", maxLength: 60, placeholder: "작업공간 이름" });
  name.addEventListener("input", () => { dirty = true; });
  const list = el("div", { className: "page-edit-list" });
  const count = el("p", { className: "muted", role: "status" });
  const addButton = button("＋ 링크 직접 추가", () => { addForm.hidden = false; addButton.hidden = true; urlInput.focus(); }, "btn full");
  const urlInput = el("input", { type: "url", placeholder: "https://example.com", "aria-label": "추가할 링크 주소" });
  const addForm = el("div", { className: "add-link-form", hidden: true }, field("링크 주소", urlInput), button("추가", () => {
    try {
      const url = webUrl(urlInput.value);
      if (rows.filter((p) => p.selected).length >= 10) throw new Error("페이지는 최대 10개까지 선택할 수 있어요.");
      rows.push({ id: crypto.randomUUID(), title: new URL(url).hostname, url, openMode: "tab", dualGroupId: null, selected: true });
      urlInput.value = ""; addForm.hidden = true; addButton.hidden = false; dirty = true; sheet.error(""); renderRows();
    } catch (error) { sheet.error(error.message); }
  }, "btn primary full"));

  function unpair(group) {
    rows.forEach((p) => { if (p.dualGroupId === group) { p.openMode = "tab"; p.dualGroupId = null; } });
  }
  function renderRows() {
    for (const page of rows) {
      if (page.openMode === "dual" && page.selected && !rows.some((other) => other !== page && other.selected && other.dualGroupId === page.dualGroupId)) unpair(page.dualGroupId);
    }
    list.replaceChildren();
    const selectedCount = rows.filter((p) => p.selected).length;
    count.textContent = `${selectedCount}개 선택`;
    rows.forEach((page, index) => {
      const checked = el("input", { type: "checkbox", checked: page.selected, "aria-label": `${page.title} 작업공간에 넣기` });
      checked.addEventListener("change", () => {
        if (checked.checked && rows.filter((p) => p.selected).length >= 10) { checked.checked = false; sheet.error("페이지는 최대 10개까지 선택할 수 있어요."); return; }
        if (!checked.checked && page.openMode === "dual") unpair(page.dualGroupId);
        page.selected = checked.checked; dirty = true; sheet.error(""); renderRows();
      });
      const row = el("div", { className: "page-choice" }, checked,
        el("span", { className: "page-choice-copy" }, el("strong", {}, page.title), el("small", {}, page.url)));
      if (page.selected && page.openMode === "dual") {
        const partner = rows.find((p) => p !== page && p.dualGroupId === page.dualGroupId);
        if (partner && rows.indexOf(partner) > index) row.append(button("나란히 보기 해제", () => { unpair(page.dualGroupId); dirty = true; renderRows(); }, "text-button"));
      } else if (page.selected && page.openMode !== "dual" && rows[index + 1]?.selected && rows[index + 1].openMode !== "dual") {
        row.append(button("다음 페이지와 나란히 보기", () => {
          const group = [..."ABCDE"].find((id) => !rows.some((p) => p.dualGroupId === id));
          if (!group) { sheet.error("나란히 보는 묶음은 최대 5개예요."); return; }
          for (const p of [page, rows[index + 1]]) { p.openMode = "dual"; p.dualGroupId = group; }
          dirty = true; sheet.error(""); renderRows();
        }, "text-button"));
      }
      list.append(row);
    });
  }

  sheet.body.classList.add("study-widget");
  sheet.body.append(field("작업공간 이름", name), el("h3", {}, "작업공간에 넣을 페이지"), count, list, addButton, addForm);
  sheet.footer.append(button("저장", (event) => busy(event.currentTarget, async () => {
    const value = workspace({ name: name.value, pages: rows.filter((p) => p.selected) });
    await services.workspaceStore.save({ ...value, ...(original ? { id: original.id, updatedAt: original.updatedAt } : {}) });
    dirty = false; sheet.close(true); services.toast("작업공간을 저장했어요.");
  }, sheet.error), "btn primary full"));
  renderRows(); name.focus();
  if (!original && !captured) {
    services.browser.currentTabs().then((result) => {
      if (!sheet.body.isConnected || dirty) return;
      rows = result.pages.map((page, index) => ({ ...page, selected: index < 10 }));
      renderRows();
    }).catch((error) => sheet.error(error.message));
  }
}
