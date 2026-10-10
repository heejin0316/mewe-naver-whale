import { el, button, field, busy } from "../../shared/dom.js";
import { webUrl, workspace } from "../../shared/validation.js";
import { groupPages, prepareRows } from "./page-groups.js";

export function openEditor(services, original = null, captured = null) {
  let dirty = false;
  let rows = prepareRows(original?.pages || captured || []);
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
    list.replaceChildren();
    const selectedCount = rows.filter((p) => p.selected).length;
    const groups = groupPages(rows);
    const dualCount = groups.filter((group) => group.dual && group.pages.every((p) => p.selected)).length;
    count.textContent = `${selectedCount}개 페이지 선택${dualCount ? ` · 듀얼탭 ${dualCount}개` : ""}`;
    groups.forEach((group) => {
      const page = group.pages[0], index = rows.indexOf(page);
      if (group.dual) {
        const checked = el("input", { type: "checkbox", checked: group.pages.every((p) => p.selected), "aria-label": `${group.pages.map((p) => p.title).join(" · ")} 듀얼탭 함께 저장` });
        checked.addEventListener("change", () => {
          if (checked.checked && rows.filter((p) => p.selected && !group.pages.includes(p)).length + 2 > 10) {
            checked.checked = false; sheet.error("듀얼탭의 두 페이지를 함께 선택하려면 2개 자리가 필요해요. 최대 10개까지 저장할 수 있어요."); return;
          }
          group.pages.forEach((p) => { p.selected = checked.checked; });
          dirty = true; sheet.error(""); renderRows();
        });
        const pair = el("section", { className: "dual-page-group", "aria-label": "듀얼탭으로 저장할 페이지" },
          el("div", { className: "dual-group-header" },
            el("label", { className: "dual-group-label" }, checked, el("span", { className: "dual-badge" }, "듀얼탭"), el("small", {}, "2개 페이지")),
            button("해제", () => { unpair(page.dualGroupId); dirty = true; sheet.error(""); renderRows(); }, "text-button")
          ),
          ...group.pages.map((p) => el("div", { className: "page-choice" },
            el("span", { className: "page-choice-copy" }, el("strong", {}, p.title), el("small", {}, p.url)))));
        pair.querySelector("button").setAttribute("aria-label", `${group.pages.map((p) => p.title).join(" · ")} 듀얼탭 해제`);
        list.append(pair);
        return;
      }
      const checked = el("input", { type: "checkbox", checked: page.selected, "aria-label": `${page.title} 작업공간에 넣기` });
      checked.addEventListener("change", () => {
        if (checked.checked && rows.filter((p) => p.selected).length >= 10) { checked.checked = false; sheet.error("페이지는 최대 10개까지 선택할 수 있어요."); return; }
        page.selected = checked.checked; dirty = true; sheet.error(""); renderRows();
      });
      const row = el("div", { className: "page-choice" }, checked,
        el("span", { className: "page-choice-copy" }, el("strong", {}, page.title), el("small", {}, page.url)));
      if (page.selected && page.openMode !== "dual" && rows[index + 1]?.selected && rows[index + 1].openMode !== "dual") {
        row.append(button("다음 페이지와 듀얼탭", () => {
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
      rows = prepareRows(result.pages);
      renderRows();
    }).catch((error) => sheet.error(error.message));
  }
}
