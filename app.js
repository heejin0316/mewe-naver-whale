import * as browser from "./shared/browser.js";
import { workspaceStore } from "./shared/workspace-store.js";
import { request } from "./shared/messages.js";
import { modal } from "./shared/modal.js";
import { el, button } from "./shared/dom.js";
import { mount as mountWorkspaces } from "./features/study-widget/view.js";
import { openAbout } from "./features/about/view.js";

let unmount = () => {}, toastTimer;
const container = document.querySelector("#view");
function toast(message) {
  clearTimeout(toastTimer); document.querySelector("#toast")?.remove();
  const node = el("div", { id: "toast", className: "toast", role: "status" }, message);
  // A modal dialog is in the browser's top layer: its toast must live inside it.
  (document.querySelector("dialog[open]") || document.body).append(node);
  toastTimer = setTimeout(() => { node.remove(); }, 1500);
}
function navigate(route) {
  if (!modal.close()) return;
  if (route !== "workspaces") return;
  unmount();
  unmount = mountWorkspaces(container, services); container.scrollTop = 0;
}
async function launch(value, previewId = null, pageIds = null) {
  try {
    const result = await request(previewId ? "SHARE_LAUNCH" : "WORKSPACE_LAUNCH", previewId ? { previewId, pageIds } : { workspace: value });
    if (result.failed.length) {
      const sheet = modal.open("열지 못한 페이지"); if (!sheet) return;
      sheet.body.append(el("ul", {}, ...result.failed.map((f) => el("li", {}, `${f.page.title}: ${f.message}`))));
      const remaining = { id: value?.id, name: value?.name || "공유 작업공간", pages: result.failed.map((f) => ({ ...f.page, openMode: "tab", dualGroupId: null })) };
      sheet.footer.append(button("다시 열기", async () => { sheet.close(true); await launch(remaining, previewId, previewId ? remaining.pages.map((p) => p.id) : null); }, "btn primary full"));
    } else toast(result.fallbackGroups ? `${result.opened.length}개 페이지를 열었어요. 나란히 보기는 사용할 수 없어 일반 탭으로 열었어요.` : `${result.opened.length}개 페이지를 열었어요.`);
  } catch (error) { toast(error.message); }
}
async function closeWorkspace(value) {
  const result = await request("WORKSPACE_CLOSE", { id: value.id });
  if (result.protectedCount) toast("다른 페이지와 합쳐진 듀얼탭은 남겨두었어요. 듀얼탭을 분리한 뒤 다시 닫아 주세요.");
  else if (result.remaining.length) toast("아직 닫히지 않은 페이지가 있어요. 페이지를 확인한 뒤 다시 눌러 주세요.");
  else toast(result.closed ? `${result.closed}개 페이지를 닫았어요.` : "이미 모든 페이지가 닫혀 있어요.");
}
const services = { navigate, modal, toast, workspaceStore, browser, launch, closeWorkspace,
  sharing: { create: (workspace) => request("SHARE_CREATE", { workspace }), get: (code) => request("SHARE_GET", { code }), save: (previewId) => request("SHARE_SAVE", { previewId }), launch: (previewId) => launch(null, previewId) } };
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());
document.querySelector("#app-info").addEventListener("click", () => openAbout(modal));
try { browser.requireWhale(); navigate("workspaces"); }
catch (error) { container.replaceChildren(el("h1", {}, "웨일에서 만나요"), el("p", { className: "notice" }, error.message)); }
