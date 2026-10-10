import { workspace } from "../../shared/validation.js";

export const SHARE_DAYS = 7;
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newShareCode() {
  // 32 symbols, 12 random characters = 60 bits, with no modulo bias.
  return [...crypto.getRandomValues(new Uint8Array(12))].map((n) => alphabet[n & 31]).join("");
}
export function normalizeCode(value) {
  if (typeof value !== "string" || value.length > 40) throw new Error("12자리 공유 코드를 입력해 주세요.");
  const code = value.toUpperCase().replace(/[\s-]/g, "");
  if (!/^[A-HJ-NP-Z2-9]{12}$/.test(code)) throw new Error("12자리 공유 코드를 확인해 주세요.");
  return code;
}
export function displayCode(value) { return normalizeCode(value).match(/.{4}/g).join("-"); }
export function prepareShare(input) {
  const clean = workspace(input);
  const excluded = clean.pages.filter((p) => !/^https?:/.test(p.url));
  const pages = clean.pages.filter((p) => /^https?:/.test(p.url));
  for (const p of pages) {
    if (p.openMode === "dual" && pages.filter((q) => q.dualGroupId === p.dualGroupId).length !== 2) {
      p.openMode = "tab"; p.dualGroupId = null;
    }
  }
  return { name: clean.name, pages, excluded };
}
export function sharedWorkspace(input) {
  const clean = workspace(input);
  if (clean.pages.some((p) => !/^https?:/.test(p.url))) throw new Error("공유 작업공간에는 웹 주소만 포함할 수 있어요.");
  return clean;
}
export function importedWorkspace(input) {
  const clean = sharedWorkspace(input);
  return { ...clean, pages: clean.pages.map((p) => ({ ...p, id: crypto.randomUUID() })) };
}
