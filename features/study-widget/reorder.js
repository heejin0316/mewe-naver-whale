export function workspaceReorder(container, list, { move, refresh, toast }) {
  const events = new AbortController();
  let dragged = null, blocked = false, saving = false, before = null, pointerY = 0, frame = 0;
  const cards = () => [...list.querySelectorAll(".workspace-card")];
  function clearMarkers() {
    cards().forEach((card) => card.classList.remove("drop-before", "drop-after"));
  }
  function cancel() {
    cancelAnimationFrame(frame); frame = 0;
    dragged?.classList.remove("is-dragging");
    dragged = null; before = null; clearMarkers();
  }
  function indicate() {
    const others = cards().filter((card) => card !== dragged);
    before = others.find((card) => {
      const rect = card.getBoundingClientRect();
      return pointerY < rect.top + rect.height / 2;
    }) || null;
    clearMarkers();
    if (before) before.classList.add("drop-before");
    else others.at(-1)?.classList.add("drop-after");
  }
  function scroll() {
    if (!dragged) return;
    const bounds = container.getBoundingClientRect();
    const distance = pointerY < bounds.top + 48 ? -8 : pointerY > bounds.bottom - 48 ? 8 : 0;
    if (distance) { container.scrollTop += distance; indicate(); }
    frame = requestAnimationFrame(scroll);
  }
  async function commit(card, target, keyboard = false) {
    if (saving || card.nextElementSibling === target) return;
    saving = true; list.setAttribute("aria-busy", "true");
    const id = card.dataset.workspaceId, beforeId = target?.dataset.workspaceId || null;
    list.insertBefore(card, target);
    try {
      await move(id, beforeId);
      await refresh();
      toast("탭 모음 순서를 저장했어요.");
    } catch (error) {
      await refresh(); toast(error.message);
    } finally {
      saving = false; list.removeAttribute("aria-busy");
      if (keyboard) cards().find((item) => item.dataset.workspaceId === id)?.focus();
    }
  }
  const on = (type, listener) => container.addEventListener(type, listener, { signal: events.signal });
  on("pointerdown", (event) => {
    blocked = !!event.target.closest("button, a, input, textarea, select");
  });
  on("dragstart", (event) => {
    const card = event.target.closest(".workspace-card");
    if (!card || blocked || saving || cards().length < 2) { event.preventDefault(); return; }
    dragged = card;
    list.querySelectorAll(".workspace-menu").forEach((menu) => { menu.hidden = true; });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", card.dataset.workspaceId);
    pointerY = event.clientY;
    // Let the browser capture the full card as the drag preview first.
    frame = requestAnimationFrame(() => { if (dragged) { dragged.classList.add("is-dragging"); scroll(); } });
  });
  on("dragover", (event) => {
    if (!dragged) return;
    event.preventDefault(); event.dataTransfer.dropEffect = "move";
    pointerY = event.clientY; indicate();
  });
  on("dragleave", (event) => {
    if (event.relatedTarget && container.contains(event.relatedTarget)) return;
    cancelAnimationFrame(frame); frame = 0; clearMarkers();
  });
  on("dragenter", () => { if (dragged && !frame) frame = requestAnimationFrame(scroll); });
  on("drop", (event) => {
    if (!dragged) return;
    event.preventDefault(); pointerY = event.clientY; indicate();
    const card = dragged, target = before;
    cancel(); void commit(card, target);
  });
  on("dragend", cancel);
  on("keydown", (event) => {
    if (!event.target.matches(".workspace-card") || !event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const card = event.target.closest(".workspace-card");
    if (event.key === "ArrowUp" && card.previousElementSibling) void commit(card, card.previousElementSibling, true);
    if (event.key === "ArrowDown" && card.nextElementSibling) void commit(card, card.nextElementSibling.nextElementSibling, true);
  });
  return { cancel, destroy() { cancel(); events.abort(); } };
}
