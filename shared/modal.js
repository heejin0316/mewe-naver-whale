import { el, button } from "./dom.js";
let current = null;
export const modal = {
  get isOpen() { return !!current; },
  close(force = false) { return current ? current.close(force) : true; },
  open(title, { dirty = () => false, onClose = () => {} } = {}) {
    if (current && !current.close()) return null;
    const previousFocus = document.activeElement;
    const dialog = el("dialog", { className: "sheet", "aria-labelledby": "modal-title" });
    const body = el("div", { className: "sheet-body" });
    const footer = el("div", { className: "sheet-footer" });
    const error = el("p", { className: "error", role: "alert", hidden: true });
    let backdropPointer = null;
    let discardDialog = null;
    function dismissDiscard() {
      if (!discardDialog) return;
      discardDialog.close(); discardDialog.remove(); discardDialog = null;
    }
    function askDiscard() {
      if (discardDialog || document.hidden) return;
      const returnFocus = document.activeElement;
      const keepEditing = () => {
        dismissDiscard();
        if (returnFocus?.isConnected) returnFocus.focus();
      };
      const keep = button("계속 편집", keepEditing, "btn");
      discardDialog = el("dialog", { className: "discard-dialog", "aria-labelledby": "discard-title", "aria-describedby": "discard-description" },
        el("h2", { id: "discard-title" }, "저장하지 않고 닫을까요?"),
        el("p", { id: "discard-description" }, "변경한 내용은 저장되지 않아요."),
        el("div", { className: "discard-actions" }, keep, button("닫기", () => close(true), "btn primary")));
      discardDialog.addEventListener("cancel", (event) => { event.preventDefault(); keepEditing(); });
      document.body.append(discardDialog); discardDialog.showModal(); keep.focus();
    }
    const close = (force = false) => {
      if (!force && document.hidden) return false;
      // Browser confirm() can cross Whale's sidebar boundary; keep this in our document.
      if (!force && dirty()) { askDiscard(); return false; }
      dismissDiscard();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", resetBackdropPointer);
      dialog.close(); dialog.remove(); current = null; onClose();
      if (previousFocus?.isConnected) previousFocus.focus();
      return true;
    };
    dialog.append(el("header", { className: "sheet-header" }, el("h2", { id: "modal-title" }, title), button("×", () => close(), "icon-button")), body, error, footer);
    dialog.querySelector("button").setAttribute("aria-label", "닫기");
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
    function resetBackdropPointer() { backdropPointer = null; }
    function onVisibilityChange() {
      resetBackdropPointer();
      // Hiding Whale's sidebar suspends editing; it is not a request to discard.
      if (document.hidden) dismissDiscard();
    }
    function isBackdrop(event) {
      if (event.target !== dialog) return false;
      const r = dialog.getBoundingClientRect();
      return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
    }
    dialog.addEventListener("pointerdown", (event) => {
      backdropPointer = !document.hidden && event.button === 0 && isBackdrop(event) ? event.pointerId : null;
    });
    dialog.addEventListener("pointercancel", resetBackdropPointer);
    dialog.addEventListener("click", (event) => {
      // Ignore clicks carried over from the browser chrome or a sidebar toggle.
      const intentional = backdropPointer !== null && event.pointerId === backdropPointer && isBackdrop(event);
      resetBackdropPointer();
      if (intentional) close();
    });
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", resetBackdropPointer);
    document.body.append(dialog); dialog.showModal();
    current = { body, footer, close, error: (message) => { error.textContent = message; error.hidden = !message; } };
    return current;
  }
};
