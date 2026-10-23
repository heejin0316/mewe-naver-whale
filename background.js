import { api, call, requireWhale, createDual, nativeTabs } from "./shared/browser.js";
import { read, write, serialQueue } from "./shared/storage.js";
import { mutateWorkspaces } from "./features/study-widget/controller.js";
import { launchWorkspace } from "./features/study-widget/launcher.js";
import { closeTrackedTabs } from "./features/study-widget/closer.js";
import { createShareClient } from "./features/sharing/firebase.js";
import { importedWorkspace, sharedWorkspace } from "./features/sharing/model.js";
import { CONSENT_KEY, hasSharingConsent, consentRecord } from "./features/sharing/consent.js";

const queue = serialQueue();
const sessionQueue = serialQueue();
const launchKey = "mewe.openWorkspaces";
const shares = createShareClient({ loadAuth: () => read("mewe.firebaseAuth", null), saveAuth: (auth) => write("mewe.firebaseAuth", auth) });
const previewKey = "mewe.sharePreviews";
const previewQueue = serialQueue();
const consentQueue = serialQueue();
async function getPreview(id) {
  const previews = (await call(api.storage.session, "get", previewKey))[previewKey] || {};
  const value = previews[id];
  if (!value || value.until <= Date.now()) throw new Error("미리보기가 만료됐어요. 공유 코드를 다시 확인해 주세요.");
  return sharedWorkspace(value.workspace);
}
const launchBrowser = {
  currentWindow: () => call(api.windows, "getLastFocused", { windowTypes: ["normal"] }),
  create: (props) => call(api.tabs, "create", props),
  activate: (id) => call(api.tabs, "update", id, { active: true }), createDual
};
const readLaunches = async () => (await call(api.storage.session, "get", launchKey))[launchKey] || {};
const writeLaunches = (value) => call(api.storage.session, "set", { [launchKey]: value });
let launching = false;
api.tabs.onRemoved.addListener((tabId) => {
  sessionQueue(async () => {
    const sessions = await readLaunches(); let changed = false;
    for (const [id, tabs] of Object.entries(sessions)) {
      if (!tabs.includes(tabId)) continue;
      sessions[id] = tabs.filter((tab) => tab !== tabId); changed = true;
      if (!sessions[id].length) delete sessions[id];
    }
    if (changed) await writeLaunches(sessions);
  }).catch(console.error);
});
api.tabs.onReplaced.addListener((added, removed) => {
  sessionQueue(async () => {
    const sessions = await readLaunches(); let changed = false;
    for (const [id, tabs] of Object.entries(sessions)) {
      if (tabs.includes(removed)) { sessions[id] = [...new Set(tabs.map((tab) => tab === removed ? added : tab))]; changed = true; }
    }
    if (changed) await writeLaunches(sessions);
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
  if (sender.id !== api.runtime.id || !sender.url?.startsWith(api.runtime.getURL("")) || !message?.requestId) return false;
  const allowed = ["WORKSPACES_LIST", "WORKSPACE_SAVE", "WORKSPACE_APPEND", "WORKSPACE_DELETE", "WORKSPACE_MOVE", "WORKSPACE_LAUNCH", "WORKSPACE_CLOSE", "SHARE_CREATE", "SHARE_GET", "SHARE_SAVE", "SHARE_LAUNCH", "SHARE_CONSENT_STATUS", "SHARE_CONSENT_ACCEPT", "SHARE_CONSENT_CLEAR"];
  if (!allowed.includes(message.type)) return false;
  const execute = async () => {
    requireWhale();
    if (message.type === "SHARE_CONSENT_STATUS") return { accepted: hasSharingConsent(await read(CONSENT_KEY, null)) };
    if (message.type === "SHARE_CONSENT_ACCEPT") {
      const record = consentRecord(message.payload);
      if (!hasSharingConsent(await read(CONSENT_KEY, null))) await write(CONSENT_KEY, record);
      return { accepted: true };
    }
    if (message.type === "SHARE_CONSENT_CLEAR") {
      await write(CONSENT_KEY, null);
      await call(api.storage.session, "set", { [previewKey]: {} });
      return { accepted: false };
    }
    if (["SHARE_CREATE", "SHARE_GET"].includes(message.type) && !hasSharingConsent(await read(CONSENT_KEY, null))) {
      throw new Error("공유 동의가 필요해요. 공유 화면을 다시 열어 동의해 주세요.");
    }
    if (message.type === "SHARE_CREATE") return shares.create(message.payload.workspace);
    if (message.type === "SHARE_GET") {
      const result = await shares.get(message.payload.code);
      return previewQueue(async () => {
        const previews = (await call(api.storage.session, "get", previewKey))[previewKey] || {};
        const fresh = Object.fromEntries(Object.entries(previews).filter(([, p]) => p.until > Date.now()).slice(-9));
        const previewId = crypto.randomUUID();
        fresh[previewId] = { workspace: result.workspace, until: Math.min(Date.now() + 15 * 60000, Date.parse(result.expiresAt)) };
        await call(api.storage.session, "set", { [previewKey]: fresh });
        return { previewId, workspace: result.workspace };
      });
    }
    if (message.type === "SHARE_SAVE") return queue(async () => {
      const clean = importedWorkspace(await getPreview(message.payload.previewId));
      const items = await read("mewe.workspaces", []);
      const next = mutateWorkspaces(items, "WORKSPACE_SAVE", clean);
      await write("mewe.workspaces", next); return next.at(-1);
    });
    if (message.type === "SHARE_LAUNCH") {
      if (launching) throw new Error("탭 모음을 처리하고 있어요. 잠시 기다려 주세요.");
      launching = true;
      try {
        let clean = await getPreview(message.payload.previewId);
        if (message.payload.pageIds) {
          if (!Array.isArray(message.payload.pageIds)) throw new Error("다시 열 페이지를 확인해 주세요.");
          clean = sharedWorkspace({ name: clean.name, pages: clean.pages.filter((p) => message.payload.pageIds.includes(p.id)).map((p) => ({ ...p, openMode: "tab", dualGroupId: null })) });
        }
        return await launchWorkspace(clean, launchBrowser);
      } finally { launching = false; }
    }
    if (["WORKSPACE_LAUNCH", "WORKSPACE_CLOSE"].includes(message.type)) {
      if (launching) throw new Error("탭 모음을 처리하고 있어요. 잠시 기다려 주세요.");
      launching = true;
      try {
        const id = message.type === "WORKSPACE_CLOSE" ? message.payload.id : message.payload.workspace?.id;
        if (typeof id !== "string" || !(await read("mewe.workspaces", [])).some((w) => w.id === id)) throw new Error("탭 모음을 찾을 수 없어요.");
        // Session storage expires with the browser, so IDs cannot close later sessions' tabs.
        const existing = await sessionQueue(readLaunches);
        if (message.type === "WORKSPACE_CLOSE") {
          const result = await closeTrackedTabs(existing[id] || [], { list: nativeTabs, remove: (tabId) => call(api.tabs, "remove", tabId) });
          await sessionQueue(async () => { const sessions = await readLaunches(); if (result.remaining.length) sessions[id] = result.remaining; else delete sessions[id]; await writeLaunches(sessions); });
          return result;
        }
        const result = await launchWorkspace(message.payload.workspace, launchBrowser);
        await sessionQueue(async () => {
          const sessions = await readLaunches();
          sessions[id] = [...new Set([...(sessions[id] || []), ...result.opened.map((item) => item.tabId)])];
          await writeLaunches(sessions);
        });
        return result;
      } finally { launching = false; }
    }
    return queue(async () => {
      await initialize();
      const items = await read("mewe.workspaces", []);
      if (message.type === "WORKSPACES_LIST") {
        const sessions = await sessionQueue(readLaunches);
        const live = new Set();
        await Promise.all([...new Set(Object.values(sessions).flat())].map(async (id) => { try { await call(api.tabs, "get", id); live.add(id); } catch { /* Already closed. */ } }));
        return items.map((w) => ({ ...w, openedCount: (sessions[w.id] || []).filter((id) => live.has(id)).length }));
      }
      const next = mutateWorkspaces(items, message.type, message.payload);
      await write("mewe.workspaces", next);
      return next;
    });
  };
  // Serialize consent changes with network operations, including requests from another sidebar.
  const result = ["SHARE_CREATE", "SHARE_GET", "SHARE_CONSENT_STATUS", "SHARE_CONSENT_ACCEPT", "SHARE_CONSENT_CLEAR"].includes(message.type) ? consentQueue(execute) : execute();
  result.then((data) => respond({ requestId: message.requestId, ok: true, data }), (error) => respond({ requestId: message.requestId, ok: false, error: { code: "REQUEST_FAILED", message: error.message } }));
  return true;
});
