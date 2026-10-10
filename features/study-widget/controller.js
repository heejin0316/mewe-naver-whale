import { workspace } from "../../shared/validation.js";
export function mutateWorkspaces(items, type, payload, now = Date.now()) {
  if (!Array.isArray(items)) throw new Error("작업공간 저장 형식이 손상되었습니다.");
  if (type === "WORKSPACE_MOVE") {
    const index = items.findIndex((w) => w.id === payload?.id);
    if (index < 0 || (payload.beforeId !== null && !items.some((w) => w.id === payload.beforeId))) {
      throw new Error("작업공간 목록이 바뀌었어요. 다시 이동해 주세요.");
    }
    if (payload.id === payload.beforeId) return items;
    const next = items.filter((w) => w.id !== payload.id);
    const destination = payload.beforeId === null ? next.length : next.findIndex((w) => w.id === payload.beforeId);
    next.splice(destination, 0, items[index]);
    return next;
  }
  if (type === "WORKSPACE_DELETE") {
    if (!items.some((w) => w.id === payload.id)) throw new Error("이미 삭제된 작업공간이에요.");
    return items.filter((w) => w.id !== payload.id);
  }
  if (type !== "WORKSPACE_SAVE") throw new Error("지원하지 않는 작업이에요.");
  const clean = workspace(payload);
  const old = payload.id ? items.find((w) => w.id === payload.id) : null;
  if (payload.id && !old) throw new Error("삭제되었거나 존재하지 않는 작업공간이에요.");
  if (old && payload.updatedAt !== old.updatedAt) throw new Error("다른 화면에서 수정됐어요. 편집창을 닫고 다시 열어 주세요.");
  const value = { ...clean, id: old?.id || crypto.randomUUID(), createdAt: old?.createdAt || now, updatedAt: Math.max(now, (old?.updatedAt || 0) + 1) };
  return old ? items.map((w) => w.id === old.id ? value : w) : [...items, value];
}
