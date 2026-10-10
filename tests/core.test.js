import test from "node:test";
import assert from "node:assert/strict";
import { webUrl, workspace } from "../shared/validation.js";
import { mutateWorkspaces } from "../features/study-widget/controller.js";
import { launchWorkspace } from "../features/study-widget/launcher.js";
import { serialQueue } from "../shared/storage.js";
const page = (id, extra = {}) => ({ id, title: `페이지 ${id}`, url: `https://example.com/${id}`, openMode: "tab", dualGroupId: null, ...extra });
const sample = () => ({ name: "이화의 논문 📚", pages: [page("a"), page("b")] });
test("실행 가능한 스킴·자격정보 URL 거부", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,x", "file:///a", "whale://settings", "https://user:pass@example.com"]) assert.throws(() => webUrl(url));
  assert.equal(webUrl("https://example.com"), "https://example.com/");
});
test("그룹 2개·인접 조건과 10개 제한", () => {
  assert.throws(() => workspace({ ...sample(), pages: [] }));
  assert.throws(() => workspace({ ...sample(), pages: Array.from({ length: 11 }, (_, i) => page(String(i))) }));
  assert.throws(() => workspace({ ...sample(), pages: [page("a", { openMode: "dual", dualGroupId: "A" })] }));
  const p = [page("a", { openMode: "dual", dualGroupId: "A" }), page("b", { openMode: "dual", dualGroupId: "A" })];
  assert.equal(workspace({ ...sample(), pages: p }).pages[0].dualGroupId, "A");
  assert.throws(() => workspace({ ...sample(), pages: [p[0], page("c"), p[1]] }));
  assert.throws(() => workspace({ ...sample(), pages: [page("same"), page("same")] }));
});
test("최대 5개·수정 충돌·이름 보존", () => {
  let items = [];
  for (let i = 0; i < 5; i++) items = mutateWorkspaces(items, "WORKSPACE_SAVE", sample(), i + 1);
  assert.equal(items[0].name, sample().name);
  assert.throws(() => mutateWorkspaces(items, "WORKSPACE_SAVE", sample()));
  assert.throws(() => mutateWorkspaces(items, "WORKSPACE_SAVE", { ...items[0], updatedAt: -1 }));
  const updated = mutateWorkspaces(items, "WORKSPACE_SAVE", { ...items[0], name: "수정" }, 10);
  assert.equal(updated[0].name, "수정"); assert.equal(updated.length, 5);
  assert.equal(mutateWorkspaces(items, "WORKSPACE_DELETE", { id: items[0].id }).length, 4);
});
test("정상 페이지는 순서대로 실행·실패 분리", async () => {
  const seen = [];
  const adapter = { currentWindow: async () => ({ id: 1 }), create: async (p) => { seen.push(p.url); if (p.url.endsWith("/b")) throw new Error("failed"); return { id: 3 }; }, activate: async () => {} };
  const result = await launchWorkspace(sample(), adapter);
  assert.equal(result.opened.length, 1); assert.equal(result.failed.length, 1); assert.equal(result.failed[0].page.id, "b"); assert.deepEqual(seen, sample().pages.map((p) => p.url));
});
test("저장된 나란히 보기 설정을 자동 적용하고 실패하면 일반 탭으로 연다", async () => {
  const input = { ...sample(), pages: [page("a", { openMode: "dual", dualGroupId: "A" }), page("b", { openMode: "dual", dualGroupId: "A" })] };
  let calls = 0;
  const adapter = { currentWindow: async () => ({ id: 1 }), create: async () => ({ id: ++calls }), activate: async () => {} };
  const result = await launchWorkspace(input, adapter); assert.equal(calls, 2); assert.equal(result.dualRestored, false);
});
test("직렬 저장 큐는 오류 뒤에도 다음 요청 수행", async () => {
  const q = serialQueue(), order = [];
  const a = q(async () => { await new Promise((r) => setTimeout(r, 10)); order.push(1); });
  const b = q(async () => { order.push(2); throw new Error("test"); });
  const c = q(async () => { order.push(3); });
  await Promise.allSettled([a, b, c]); assert.deepEqual(order, [1, 2, 3]);
});
test("나란히 보기는 그룹당 한 번 생성하고 좌우 URL 순서를 보존", async () => {
  const pairs = [], singles = [];
  const input = { ...sample(), pages: [page("a", { openMode: "dual", dualGroupId: "A" }), page("b", { openMode: "dual", dualGroupId: "A" }), page("c")] };
  const adapter = { currentWindow: async () => ({ id: 7 }), createDual: async (p) => { pairs.push(p); return { id: 1 }; }, create: async (p) => { singles.push(p); return { id: 2 }; }, activate: async () => {} };
  const result = await launchWorkspace(input, adapter);
  assert.equal(pairs.length, 1); assert.equal(pairs[0].left, input.pages[0].url); assert.equal(pairs[0].right, input.pages[1].url);
  assert.equal(singles.length, 1); assert.equal(result.opened.length, 3); assert.equal(result.dualGroupsOpened, 1);
});
test("나란히 보기 실패 시 양쪽을 일반 탭으로 열고 다음 페이지도 실행", async () => {
  const input = { ...sample(), pages: [page("a", { openMode: "dual", dualGroupId: "A" }), page("b", { openMode: "dual", dualGroupId: "A" }), page("c")] };
  const adapter = { currentWindow: async () => ({ id: 7 }), createDual: async () => { throw new Error("unavailable"); }, create: async () => ({ id: 2 }), activate: async () => {} };
  const result = await launchWorkspace(input, adapter);
  assert.equal(result.failed.length, 0); assert.equal(result.opened.length, 3); assert.equal(result.dualRestored, false);
});
