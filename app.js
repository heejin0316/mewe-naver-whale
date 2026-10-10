import * as browser from "./shared/browser.js";
import { workspaceStore } from "./shared/workspace-store.js";
import { request } from "./shared/messages.js";
import { modal } from "./shared/modal.js";
import { el, button } from "./shared/dom.js";
import { mount as mountWorkspaces } from "./features/study-widget/view.js";

let unmount = () => {}, toastTimer;
const container = document.querySelector("#view");
function toast(message) {
  const node = document.querySelector("#toast"); clearTimeout(toastTimer); node.textContent = message; node.hidden = false;
  toastTimer = setTimeout(() => { node.hidden = true; }, 5000);
}
function navigate(route) {
  if (!modal.close()) return;
  if (route !== "workspaces") return;
  unmount();
  unmount = mountWorkspaces(container, services); container.scrollTop = 0;
}
async function launch(value) {
  try {
    const result = await request("WORKSPACE_LAUNCH", { workspace: value });
    if (result.failed.length) {
      const sheet = modal.open("열지 못한 페이지"); if (!sheet) return;
      sheet.body.append(el("ul", {}, ...result.failed.map((f) => el("li", {}, `${f.page.title}: ${f.message}`))));
      const remaining = { name: value.name, pages: result.failed.map((f) => ({ ...f.page, openMode: "tab", dualGroupId: null })) };
      sheet.footer.append(button("다시 열기", async () => { sheet.close(true); await launch(remaining); }, "btn primary full"));
    } else toast(result.fallbackGroups ? `${result.opened.length}개 페이지를 열었어요. 나란히 보기는 사용할 수 없어 일반 탭으로 열었어요.` : `${result.opened.length}개 페이지를 열었어요.`);
  } catch (error) { toast(error.message); }
}
const services = { navigate, modal, toast, workspaceStore, browser, launch };
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());
try { browser.requireWhale(); navigate("workspaces"); }
catch (error) { container.replaceChildren(el("h1", {}, "웨일에서 만나요"), el("p", { className: "notice" }, error.message)); }
