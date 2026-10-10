import { workspace } from "../../shared/validation.js";
// Open saved pairs automatically. If Whale cannot split a pair, open its URLs as regular tabs.
export async function launchWorkspace(input, browser) {
  const clean = workspace(input);
  const target = await browser.currentWindow();
  const opened = [], failed = [];
  const completedGroups = new Set();
  let dualGroupsOpened = 0, fallbackGroups = 0;
  for (const page of clean.pages) {
    if (page.openMode === "dual") {
      if (completedGroups.has(page.dualGroupId)) continue;
      completedGroups.add(page.dualGroupId);
      const pair = clean.pages.filter((p) => p.dualGroupId === page.dualGroupId);
      try {
        const tab = await browser.createDual({ windowId: target.id, left: pair[0].url, right: pair[1].url });
        opened.push(...pair.map((p, i) => ({ pageId: p.id, tabId: tab.tabIds?.[i] ?? tab.id, title: p.title })));
        dualGroupsOpened++;
      } catch {
        fallbackGroups++;
        for (const fallback of pair) {
          try { const tab = await browser.create({ windowId: target.id, url: fallback.url, active: false }); opened.push({ pageId: fallback.id, tabId: tab.id, title: fallback.title }); }
          catch (error) { failed.push({ page: fallback, message: error.message }); }
        }
      }
      continue;
    }
    try { const tab = await browser.create({ windowId: target.id, url: page.url, active: false }); opened.push({ pageId: page.id, tabId: tab.id, title: page.title }); }
    catch (error) { failed.push({ page, message: error.message }); }
  }
  let focusWarning = null;
  if (opened.length) { try { await browser.activate(opened[0].tabId); } catch (error) { focusWarning = error.message; } }
  return { opened, failed, focusWarning, dualRestored: dualGroupsOpened > 0, dualGroupsOpened, fallbackGroups };
}
