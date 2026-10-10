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
    const close = (force = false) => {
      if (!force && dirty() && !confirm("저장하지 않은 입력을 닫을까요?")) return false;
      dialog.close(); dialog.remove(); current = null; onClose();
      if (previousFocus?.isConnected) previousFocus.focus();
      return true;
    };
    dialog.append(el("header", { className: "sheet-header" }, el("h2", { id: "modal-title" }, title), button("×", () => close(), "icon-button")), body, error, footer);
    dialog.querySelector("button").setAttribute("aria-label", "닫기");
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } });
    document.body.append(dialog); dialog.showModal();
    current = { body, footer, close, error: (message) => { error.textContent = message; error.hidden = !message; } };
    return current;
  }
};
