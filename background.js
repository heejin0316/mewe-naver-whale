import { api, call, requireWhale, createDual } from "./shared/browser.js";
import { read, write, serialQueue } from "./shared/storage.js";
import { mutateWorkspaces } from "./features/study-widget/controller.js";
import { launchWorkspace } from "./features/study-widget/launcher.js";

const queue = serialQueue();
const captureQueue = serialQueue();
const observedTabKey = "mewe.observedTabIds";
let launching = false;
// Whale's right dual-tab page can be absent from tabs.query but is reported by
// webNavigation. Keep only its tab ID, never browsing URLs, for later tabs.get.
api.webNavigation?.onCommitted.addListener(({ tabId, frameId }) => {
  if (frameId !== 0 || !Number.isInteger(tabId) || tabId < 0) return;
  captureQueue(async () => {
    const area = api.storage.session || api.storage.local;
    const stored = (await call(area, "get", observedTabKey))[observedTabKey];
    const ids = Array.isArray(stored) ? stored.filter(Number.isInteger) : [];
    const next = [...ids.filter((id) => id !== tabId), tabId].slice(-200);
    await call(area, "set", { [observedTabKey]: next });
  }).catch(console.error);
});
async function initialize() {
  const meta = await read("mewe.meta", {});
  if (!meta.workspaceSeeded) {
    if ((await read("mewe.workspaces", null)) === null) await write("mewe.workspaces", []);
    await write("mewe.meta", { ...meta, schemaVersion: 2, workspaceSeeded: true });
  }
}
api.runtime.onInstalled.addListener(() => { queue(initialize).catch(console.error); });
api.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== api.runtime.id || !message?.requestId) return false;
  const allowed = ["WORKSPACES_LIST", "WORKSPACE_SAVE", "WORKSPACE_DELETE", "WORKSPACE_LAUNCH"];
  if (!allowed.includes(message.type)) return false;
  const execute = async () => {
    requireWhale();
    if (message.type === "WORKSPACE_LAUNCH") {
      if (launching) throw new Error("작업공간을 여는 중이에요. 잠시 기다려 주세요.");
      launching = true;
      try {
        return await launchWorkspace(message.payload.workspace, {
          currentWindow: () => call(api.windows, "getLastFocused", { windowTypes: ["normal"] }),
          create: (props) => call(api.tabs, "create", props),
          activate: (id) => call(api.tabs, "update", id, { active: true }),
          createDual
        });
      } finally { launching = false; }
    }
    return queue(async () => {
      await initialize();
      const items = await read("mewe.workspaces", []);
      if (message.type === "WORKSPACES_LIST") return items;
      const next = mutateWorkspaces(items, message.type, message.payload);
      await write("mewe.workspaces", next);
      return next;
    });
  };
  execute().then((data) => respond({ requestId: message.requestId, ok: true, data }), (error) => respond({ requestId: message.requestId, ok: false, error: { code: "REQUEST_FAILED", message: error.message } }));
  return true;
});
