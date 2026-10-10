import { webUrl } from "./validation.js";
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
  const win = await call(api.windows, "getCurrent", {});
  const tabs = await call(api.tabs, "query", { windowId: win.id });
  const visibleIds = new Set(tabs.map((tab) => tab.id));
  const observedTabKey = "mewe.observedTabIds";
  const area = api.storage.session || api.storage.local;
  const observed = (await call(area, "get", observedTabKey))[observedTabKey];
  const candidates = Array.isArray(observed) ? observed.filter((id) => Number.isInteger(id) && !visibleIds.has(id)).slice(-200) : [];
  const discovered = await Promise.allSettled(candidates.map((id) => call(api.tabs, "get", id)));
  const hiddenByIndex = new Map();
  for (const result of discovered) {
    if (result.status !== "fulfilled") continue;
    const tab = result.value;
    if (tab.windowId !== win.id || !Number.isInteger(tab.index)) continue;
    try {
      webUrl(tab.pendingUrl || tab.url);
      const key = `${tab.windowId}:${tab.index}`;
      hiddenByIndex.set(key, [...(hiddenByIndex.get(key) || []), tab]);
    } catch { /* Ignore non-web pages. */ }
  }
  const pages = [];
  let autoPaired = 0;
  for (const tab of tabs.sort((a, b) => a.index - b.index)) {
    try {
      const leftUrl = webUrl(tab.pendingUrl || tab.url);
      const pair = hiddenByIndex.get(`${win.id}:${tab.index}`) || [];
      const right = pair.length === 1 && autoPaired < 5 ? pair[0] : null;
      const group = right ? "ABCDE"[autoPaired++] : null;
      pages.push({ id: crypto.randomUUID(), title: (tab.title || new URL(leftUrl).hostname).slice(0, 160), url: leftUrl, openMode: group ? "dual" : "tab", dualGroupId: group });
      if (right) pages.push({ id: crypto.randomUUID(), title: (right.title || new URL(right.pendingUrl || right.url).hostname).slice(0, 160), url: webUrl(right.pendingUrl || right.url), openMode: "dual", dualGroupId: group });
    } catch { /* Internal tabs are not captured. */ }
  }
  return { pages, excluded: tabs.filter((tab) => { try { webUrl(tab.pendingUrl || tab.url); return false; } catch { return true; } }).length, autoPaired, windowId: win.id };
}
export async function openUrl(url) {
  requireWhale();
  return call(api.tabs, "create", { url: webUrl(url), active: true });
}
export async function createDual({ left, right, windowId }) {
  const config = encodeURIComponent(JSON.stringify({ left: webUrl(left), right: webUrl(right) }));
  const tab = await call(api.tabs, "create", { windowId, active: true, url: api.runtime.getURL("features/study-widget/dual-bridge.html") + "#" + config });
  const start = Date.now();
  while (Date.now() - start < 9000) {
    const current = await call(api.tabs, "get", tab.id);
    // The bridge only navigates after the native viewport has split.
    if (current.url === left || current.pendingUrl === left) return { id: tab.id, method: "whale-space-bridge" };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  try { await call(api.tabs, "remove", tab.id); } catch { /* The bridge may already be gone. */ }
  throw new Error("나란히 보기를 준비하지 못했어요.");
}
