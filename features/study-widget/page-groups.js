// Saved and captured pairs are adjacent and share one dualGroupId.
export function groupPages(pages) {
  const groups = [];
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index], next = pages[index + 1];
    const dual = page.openMode === "dual" && page.dualGroupId && next?.openMode === "dual" && next.dualGroupId === page.dualGroupId;
    groups.push({ dual: !!dual, pages: dual ? [page, next] : [page] });
    if (dual) index++;
  }
  return groups;
}

export function prepareRows(pages, limit = 10) {
  let selectedCount = 0;
  return groupPages(pages).flatMap((group) => {
    const selected = selectedCount + group.pages.length <= limit;
    if (selected) selectedCount += group.pages.length;
    return group.pages.map((page) => ({ ...page, selected }));
  });
}

// Keep the captured pair in the draft so reselecting both restores it.
// Only complete selected pairs are persisted as dual tabs.
export function selectedPages(rows) {
  return groupPages(rows).flatMap((group) => {
    const selected = group.pages.filter((page) => page.selected);
    const dual = group.dual && selected.length === 2;
    return selected.map(({ selected: _selected, ...page }) => ({
      ...page, openMode: dual ? "dual" : "tab", dualGroupId: dual ? page.dualGroupId : null
    }));
  });
}
