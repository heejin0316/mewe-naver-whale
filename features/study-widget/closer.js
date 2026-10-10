// Match browser-assigned identities, never URLs: pre-existing copies stay open.
export async function closeTrackedTabs(ids, browser) {
  const owned = new Set(ids.filter(Number.isInteger));
  const initial = (await browser.list()).filter((tab) => owned.has(tab.id));
  const protectedIds = new Set();
  for (const { id } of initial) {
    const current = await browser.list();
    const tab = current.find((item) => item.id === id);
    if (!tab) continue;
    // Whale can close both sides at once. A user may have joined an unrelated
    // page to this tab after opening it: leave that mixed pair untouched.
    if (tab.index < 0 || current.some((item) => item.windowId === tab.windowId && item.index === tab.index && !owned.has(item.id))) {
      protectedIds.add(id); continue;
    }
    try { await browser.remove(id); } catch { /* Keep surviving IDs for retry. */ }
  }
  const remaining = (await browser.list()).filter((tab) => owned.has(tab.id)).map((tab) => tab.id);
  return { closed: initial.length - remaining.length, remaining, protectedCount: remaining.filter((id) => protectedIds.has(id)).length };
}
