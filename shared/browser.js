import { pageUrl, pageTitle } from "./validation.js";
export const api = globalThis.whale || globalThis.chrome;
export function call(target, method, ...args) {
  return new Promise((resolve, reject) => {
    if (!target || typeof target[method] !== "function") return reject(new Error(`브라우저 기능을 사용할 수 없어요: ${method}`));
    try {
      target[method](...args, (result) => {
        const error = api?.runtime?.lastError;
        if (error) reject(new Error(error.message)); else resolve(result);
      });
    } catch (error) { reject(error); }
  });
}
export function requireWhale() {
  if (!api?.runtime?.id || !api?.sidebarAction) throw new Error("네이버 웨일에 확장앱으로 설치해서 열어 주세요.");
}
export async function currentTabs() {
  requireWhale();
  // Populated windows identify the left page; tabs.query lists the focused side.
  // Enumerate targets to find the hidden side even immediately after installation.
  // Only list IDs: never attach a debugger or send commands to users' pages.
  const win = await call(api.windows, "getCurrent", { populate: true });
  const tabs = await call(api.tabs, "query", { windowId: win.id });
  const known = new Map([...(win.tabs || []), ...tabs].map((tab) => [tab.id, tab]));
  let targets;
  try { targets = await call(api.debugger, "getTargets"); }
  catch { throw new Error("듀얼탭 목록을 읽지 못했어요. 확장앱 관리에서 ME:WE를 새로고침하고 권한을 확인해 주세요."); }
  const candidates = [...new Set(targets.filter((target) => target.type === "page" && Number.isInteger(target.tabId) && !known.has(target.tabId)).map((target) => target.tabId))];
  const discovered = await Promise.allSettled(candidates.map((id) => call(api.tabs, "get", id)));
  for (const result of discovered) {
    if (result.status === "fulfilled" && result.value?.windowId === win.id) known.set(result.value.id, result.value);
  }
  const byIndex = new Map();
  let excluded = 0;
  for (const tab of known.values()) {
    if (tab.windowId !== win.id || !Number.isInteger(tab.index) || tab.index < 0) continue;
    try {
      pageUrl(tab.pendingUrl || tab.url);
      byIndex.set(tab.index, [...(byIndex.get(tab.index) || []), tab]);
    } catch { excluded++; }
  }
  const pages = [];
  let autoPaired = 0;
  for (const [index, members] of [...byIndex].sort(([a], [b]) => a - b)) {
    const leftId = win.tabs?.find((tab) => tab.index === index)?.id;
    members.sort((a, b) => Number(b.id === leftId) - Number(a.id === leftId));
    const group = members.length === 2 && autoPaired < 5 ? "ABCDE"[autoPaired++] : null;
    for (const tab of members) {
      const url = pageUrl(tab.pendingUrl || tab.url);
      pages.push({ id: crypto.randomUUID(), title: (tab.title || pageTitle(url)).slice(0, 160), url, openMode: group ? "dual" : "tab", dualGroupId: group });
    }
  }
  return { pages, excluded, autoPaired, windowId: win.id };
}
export async function openUrl(url) {
  requireWhale();
  return call(api.tabs, "create", { url: pageUrl(url), active: true });
}
// Include both native dual-tab sides, including non-web pages, for safe closing.
export async function nativeTabs() {
  const [windows, visible, targets] = await Promise.all([
    call(api.windows, "getAll", { populate: true }), call(api.tabs, "query", {}), call(api.debugger, "getTargets")
  ]);
  const tabs = new Map([...windows.flatMap((win) => win.tabs || []), ...visible].map((tab) => [tab.id, tab]));
  const missing = [...new Set(targets.filter((t) => t.type === "page" && Number.isInteger(t.tabId) && !tabs.has(t.tabId)).map((t) => t.tabId))];
  for (const result of await Promise.allSettled(missing.map((id) => call(api.tabs, "get", id)))) {
    if (result.status === "fulfilled") tabs.set(result.value.id, result.value);
  }
  return [...tabs.values()];
}
export async function createDual({ left, right, windowId }) {
  left = pageUrl(left); right = pageUrl(right);
  const token = crypto.randomUUID();
  const config = encodeURIComponent(JSON.stringify({ token, left }));
  const bridgeUrl = api.runtime.getURL("features/study-widget/dual-bridge.html") + "#" + config;
  const peerUrl = api.runtime.getURL("features/study-widget/dual-target.html") + "#" + token;
  const hasDestination = (tab) => {
    // Accept site redirects as well as the requested URL; extension helpers are excluded.
    try { pageUrl(tab.url); return true; } catch { return false; }
  };
  const tab = await call(api.tabs, "create", { windowId, active: true, url: bridgeUrl });
  let peer;
  try {
    const start = Date.now();
    while (Date.now() - start < 9000) {
      const tabs = await nativeTabs();
      const current = tabs.find((t) => t.id === tab.id);
      peer = tabs.find((t) => t.id !== tab.id && t.windowId === current?.windowId && t.index === current?.index && (t.pendingUrl || t.url) === peerUrl);
      if (peer) {
        // A unique helper URL and matching native slot identify this launch's right side.
        // File URLs need tabs.update. Web URLs on the left use location.replace in the
        // bridge: Whale can route tabs.update(http) on the left to the linked right side.
        await call(api.tabs, "update", peer.id, { url: right });
        if (left.startsWith("file:")) await call(api.tabs, "update", tab.id, { url: left });
        while (Date.now() - start < 9000) {
          const [a, b] = await Promise.all([call(api.tabs, "get", tab.id), call(api.tabs, "get", peer.id)]);
          if (hasDestination(a) && hasDestination(b) && a.windowId === b.windowId && a.index === b.index) {
            return { id: tab.id, tabIds: [tab.id, peer.id], method: "whale-space-bridge" };
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("나란히 보기를 준비하지 못했어요.");
  } catch (error) {
    // Remove only helpers from this launch before the caller opens regular fallback tabs.
    const owned = new Set([tab.id, ...(peer ? [peer.id] : [])]);
    try {
      for (const t of await nativeTabs()) if ([bridgeUrl, peerUrl].includes(t.pendingUrl || t.url)) owned.add(t.id);
    } catch { /* Known helper IDs can still be cleaned up. */ }
    for (const id of owned) { try { await call(api.tabs, "remove", id); } catch { /* Closing one side may close both. */ } }
    throw error;
  }
}
