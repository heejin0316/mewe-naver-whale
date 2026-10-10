export function webUrl(value) {
  if (typeof value !== "string" || value.length > 4096) throw new Error("주소는 4,096자 이내로 입력해 주세요.");
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error("https://로 시작하는 올바른 주소를 입력해 주세요."); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("아이디·비밀번호가 포함되지 않은 http(s) 주소만 사용할 수 있어요.");
  }
  return url.href;
}

export function workspace(input) {
  if (!input || typeof input !== "object") throw new Error("작업공간 형식이 올바르지 않아요.");
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 60) throw new Error("작업공간 이름은 1~60자로 입력해 주세요.");
  if (!Array.isArray(input.pages) || input.pages.length < 1 || input.pages.length > 10) throw new Error("페이지는 1~10개 선택해 주세요.");
  const ids = new Set();
  const pages = input.pages.map((p) => {
    if (!p || typeof p.id !== "string" || !p.id || p.id.length > 100 || ids.has(p.id)) throw new Error("페이지 ID가 중복되거나 올바르지 않아요.");
    ids.add(p.id);
    if (typeof p.title !== "string" || !p.title.trim() || p.title.length > 160) throw new Error("페이지 이름은 1~160자로 입력해 주세요.");
    if (!["tab", "dual"].includes(p.openMode)) throw new Error("열기 방식을 확인해 주세요.");
    if (p.openMode === "dual" && (typeof p.dualGroupId !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(p.dualGroupId))) throw new Error("듀얼탭 그룹을 선택해 주세요.");
    return { id: p.id, title: p.title.trim(), url: webUrl(p.url), openMode: p.openMode, dualGroupId: p.openMode === "dual" ? p.dualGroupId : null };
  });
  const groups = new Map();
  pages.forEach((p, i) => { if (p.openMode === "dual") groups.set(p.dualGroupId, [...(groups.get(p.dualGroupId) || []), i]); });
  for (const indices of groups.values()) {
    if (indices.length !== 2) throw new Error("듀얼탭 그룹마다 페이지를 정확히 2개 지정해 주세요.");
    if (indices[1] !== indices[0] + 1) throw new Error("나란히 볼 두 페이지는 목록에서 이어져 있어야 해요.");
  }
  return { name: input.name.trim(), pages };
}
