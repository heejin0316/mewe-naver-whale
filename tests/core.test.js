import test from "node:test";
import assert from "node:assert/strict";
import { pageUrl, pageTitle, workspace } from "../shared/validation.js";
import { mutateWorkspaces } from "../features/study-widget/controller.js";
import { launchWorkspace } from "../features/study-widget/launcher.js";
import { serialQueue } from "../shared/storage.js";
import { groupPages, prepareRows, selectedPages } from "../features/study-widget/page-groups.js";
import { closeTrackedTabs } from "../features/study-widget/closer.js";
const page = (id, extra = {}) => ({ id, title: `페이지 ${id}`, url: `https://example.com/${id}`, openMode: "tab", dualGroupId: null, ...extra });
const sample = () => ({ name: "이화의 논문 📚", pages: [page("a"), page("b")] });

test("기존 탭 모음에 추가하면 이름·ID·생성시각·기존 페이지·목록 순서가 보존된다", () => {
  const [target] = mutateWorkspaces([], "WORKSPACE_SAVE", sample(), 100);
  const items = mutateWorkspaces([target], "WORKSPACE_SAVE", { name: "다른 모음", pages: [page("other")] }, 200);
  const before = structuredClone(items);
  const next = mutateWorkspaces(items, "WORKSPACE_APPEND", { id: target.id, pages: [page("new")] }, 300);
  assert.deepEqual(items, before, "입력 배열과 기존 페이지를 변경하지 않는다");
  assert.deepEqual(next.map((item) => item.id), items.map((item) => item.id));
  assert.equal(next[0].name, target.name);
  assert.equal(next[0].createdAt, 100);
  assert.equal(next[0].updatedAt, 300);
  assert.deepEqual(next[0].pages.slice(0, 2), target.pages);
  assert.equal(next[0].pages[2].url, page("new").url);
  assert.notEqual(next[0].pages[2].id, "new");
  assert.deepEqual(next[1], items[1]);
});

test("같은 주소와 캡처 ID가 있어도 독립적인 새 페이지로 추가한다", () => {
  const [target] = mutateWorkspaces([], "WORKSPACE_SAVE", sample(), 100);
  const [added] = mutateWorkspaces([target], "WORKSPACE_APPEND", { id: target.id, pages: [target.pages[0]] }, 100);
  assert.equal(added.pages.length, 3);
  assert.equal(added.pages[2].url, target.pages[0].url);
  assert.notEqual(added.pages[2].id, target.pages[0].id);
  assert.equal(new Set(added.pages.map((item) => item.id)).size, 3);
  assert.equal(added.updatedAt, 101);
});

test("기존·추가 듀얼탭의 그룹 이름이 같아도 별도 쌍으로 보존한다", () => {
  const pair = [page("a", { openMode: "dual", dualGroupId: "A" }), page("b", { openMode: "dual", dualGroupId: "A" })];
  const [target] = mutateWorkspaces([], "WORKSPACE_SAVE", { name: "듀얼탭 모음", pages: pair }, 100);
  const [added] = mutateWorkspaces([target], "WORKSPACE_APPEND", { id: target.id, pages: pair }, 200);
  assert.deepEqual(added.pages.slice(0, 2), target.pages);
  assert.notEqual(added.pages[2].dualGroupId, "A");
  assert.equal(added.pages[2].dualGroupId, added.pages[3].dualGroupId);
  assert.equal(new Set(added.pages.map((item) => item.id)).size, 4);
  assert.deepEqual(groupPages(workspace(added).pages).map((group) => group.dual), [true, true]);
  const draft = prepareRows(pair); draft[0].selected = false;
  const [single] = mutateWorkspaces([target], "WORKSPACE_APPEND", { id: target.id, pages: selectedPages(draft) }, 200);
  assert.equal(single.pages[2].openMode, "tab");
  assert.equal(single.pages[2].dualGroupId, null);
});

test("추가 후 10개는 허용하고 초과·빈 선택·삭제된 대상은 변경 없이 거부한다", () => {
  const [target] = mutateWorkspaces([], "WORKSPACE_SAVE", { name: "9개", pages: Array.from({ length: 9 }, (_, i) => page(String(i))) }, 100);
  const input = [target], before = structuredClone(input);
  const [full] = mutateWorkspaces(input, "WORKSPACE_APPEND", { id: target.id, pages: [page("last")] }, 200);
  assert.equal(full.pages.length, 10);
  assert.throws(() => mutateWorkspaces(input, "WORKSPACE_APPEND", { id: target.id, pages: sample().pages }), /10개를 넘어요/);
  assert.throws(() => mutateWorkspaces(input, "WORKSPACE_APPEND", { id: target.id, pages: [] }), /1~10개/);
  assert.throws(() => mutateWorkspaces(input, "WORKSPACE_APPEND", { id: "deleted", pages: [page("last")] }), /존재하지 않는 탭 모음/);
  assert.deepEqual(input, before);
});

test("직렬 큐에서 연속 추가한 페이지를 모두 보존한다", async () => {
  let items = mutateWorkspaces([], "WORKSPACE_SAVE", sample(), 100);
  const id = items[0].id, queue = serialQueue();
  await Promise.all(["first", "second"].map((next) => queue(async () => {
    items = mutateWorkspaces(items, "WORKSPACE_APPEND", { id, pages: [page(next)] }, 200);
  })));
  assert.deepEqual(items[0].pages.map((item) => item.url), [...sample().pages, page("first"), page("second")].map((item) => item.url));
  assert.equal(items[0].updatedAt, 201);
});

test("로컬 파일 주소와 따옴표 포함 Windows 경로의 한글·공백·특수문자 보존", () => {
  const path = 'C:\\자료\\강의 #1 100%.pdf';
  const url = pageUrl(path);
  assert.equal(url, 'file:///C:/%EC%9E%90%EB%A3%8C/%EA%B0%95%EC%9D%98%20%231%20100%25.pdf');
  assert.equal(pageUrl('"' + path + '"'), url);
  assert.equal(pageUrl(url), url);
  assert.equal(pageTitle(url), '강의 #1 100%.pdf');
  assert.equal(pageUrl('file:///C:/notes.pdf#page=3'), 'file:///C:/notes.pdf#page=3');
  assert.equal(pageTitle('file:///C:/notes.pdf#page=3'), 'notes.pdf');
  assert.equal(pageUrl('C:/notes.pdf'), 'file:///C:/notes.pdf');
});

test("로컬 PDF 저장·수정·실행에 파일 URL 유지", async () => {
  const [saved] = mutateWorkspaces([], "WORKSPACE_SAVE", {name:"강의", pages:[page("pdf", {url:'C:\\자료\\강의.pdf',title:'강의.pdf'})]});
  const [edited] = mutateWorkspaces([saved], "WORKSPACE_SAVE", {...saved,name:"다음 강의"});
  const opened=[];
  await launchWorkspace(edited,{currentWindow:async()=>({id:1}),create:async p=>{opened.push(p.url);return {id:2};},activate:async()=>{}});
  assert.deepEqual(opened,[pageUrl('C:\\자료\\강의.pdf')]);
});

test("닫기는 생성한 ID만 대상으로 하고 일반탭·듀얼탭·다른 창을 처리", async () => {
  let tabs = [{ id: 1, windowId: 1, index: 0 }, { id: 2, windowId: 1, index: 1 }, { id: 3, windowId: 1, index: 1 }, { id: 4, windowId: 2, index: 0 }, { id: 5, windowId: 1, index: 2 }];
  const calls = [];
  const result = await closeTrackedTabs([2, 3, 4, 99], { list: async () => tabs, remove: async (id) => {
    calls.push(id); const target = tabs.find(t => t.id === id);
    tabs = tabs.filter(t => t.windowId !== target.windowId || t.index !== target.index);
  } });
  assert.deepEqual(calls, [2, 4]); assert.deepEqual(tabs.map(t => t.id), [1, 5]);
  assert.deepEqual(result, { closed: 3, remaining: [], protectedCount: 0 });
});

test("다른 페이지와 합쳐진 듀얼탭은 보호하고 닫기 실패 탭은 재시도용으로 유지", async () => {
  const tabs = [{ id: 1, windowId: 1, index: 0 }, { id: 2, windowId: 1, index: 0 }, { id: 3, windowId: 1, index: 1 }];
  const calls = [];
  const result = await closeTrackedTabs([1, 3], { list: async () => tabs, remove: async id => { calls.push(id); throw new Error("cancelled"); } });
  assert.deepEqual(calls, [3]);
  assert.deepEqual(result, { closed: 0, remaining: [1, 3], protectedCount: 1 });
});

test("닫기 전 전체 목록을 읽지 못하면 어떤 페이지도 닫지 않는다", async () => {
  let removed = false;
  await assert.rejects(closeTrackedTabs([1], { list: async () => { throw new Error("unavailable"); }, remove: async () => { removed = true; } }));
  assert.equal(removed, false);
});

test("듀얼탭 열기는 두 페이지의 실제 ID를 각각 반환", async () => {
  const input = { name: "학교", pages: [page("a", { openMode: "dual", dualGroupId: "A" }), page("b", { openMode: "dual", dualGroupId: "A" })] };
  const result = await launchWorkspace(input, { currentWindow: async () => ({ id: 1 }), createDual: async () => ({ id: 10, tabIds: [10, 11] }), activate: async () => {} });
  assert.deepEqual(result.opened.map(p => p.tabId), [10, 11]);
});

test("작업공간 순서 이동은 내용·듀얼탭·수정시각을 보존하고 양방향으로 저장", () => {
  const items = ["학교", "빅테크", "실험"].reduce((all, name, i) => mutateWorkspaces(all, "WORKSPACE_SAVE", { ...sample(), name }, i + 1), []);
  const [a, b, c] = items;
  const up = mutateWorkspaces(items, "WORKSPACE_MOVE", { id: c.id, beforeId: a.id });
  assert.deepEqual(up, [c, a, b]);
  assert.deepEqual(mutateWorkspaces(up, "WORKSPACE_MOVE", { id: c.id, beforeId: null }), items);
  assert.deepEqual(mutateWorkspaces(items, "WORKSPACE_MOVE", { id: a.id, beforeId: a.id }), items);
  assert.deepEqual(items.map(w => w.name), ["학교", "빅테크", "실험"]);
  const edited = mutateWorkspaces(up, "WORKSPACE_SAVE", { ...a, name: "수정한 학교" }, 10);
  assert.deepEqual(edited.map(w => w.id), up.map(w => w.id));
  assert.equal(edited[1].name, "수정한 학교");
});

test("이동 도중 삭제된 작업공간은 복원하지 않고 동시 추가·수정은 보존", () => {
  const [a] = mutateWorkspaces([], "WORKSPACE_SAVE", sample(), 1);
  const items = mutateWorkspaces([a], "WORKSPACE_SAVE", { ...sample(), name: "새 항목" }, 2);
  const moved = mutateWorkspaces(items, "WORKSPACE_MOVE", { id: a.id, beforeId: null });
  assert.deepEqual(moved, [items[1], a]);
  assert.throws(() => mutateWorkspaces(items, "WORKSPACE_MOVE", { id: "deleted", beforeId: a.id }));
  assert.throws(() => mutateWorkspaces(items, "WORKSPACE_MOVE", { id: a.id, beforeId: "deleted" }));
  assert.throws(() => mutateWorkspaces(items, "WORKSPACE_MOVE", { id: a.id }));
});

test("감지된 듀얼탭은 생성·저장·수정·실행까지 한 쌍으로 유지", async () => {
  const captured = [page("ewha", { openMode: "dual", dualGroupId: "A" }), page("yonsei", { openMode: "dual", dualGroupId: "A" }), page("chungnam")];
  const draft = prepareRows(captured);
  const [saved] = mutateWorkspaces([], "WORKSPACE_SAVE", { name: "학교", pages: draft.filter((p) => p.selected) });
  const reopened = prepareRows(JSON.parse(JSON.stringify(saved)).pages);
  assert.deepEqual(groupPages(reopened).map((group) => [group.dual, group.pages.length]), [[true, 2], [false, 1]]);
  const pairs = [], singles = [];
  const result = await launchWorkspace(saved, { currentWindow: async () => ({ id: 1 }), createDual: async (pair) => { pairs.push(pair); return { id: 10 }; }, create: async (tab) => { singles.push(tab); return { id: 11 }; }, activate: async () => {} });
  assert.equal(pairs.length, 1); assert.equal(singles.length, 1);
  assert.equal(pairs[0].left, captured[0].url); assert.equal(pairs[0].right, captured[1].url);
  assert.equal(result.dualGroupsOpened, 1);
});

test("처음 가져올 때 10페이지 경계에서 듀얼탭을 임의로 나누지 않는다", () => {
  const captured = [...Array.from({ length: 9 }, (_, i) => page(String(i))), page("left", { openMode: "dual", dualGroupId: "B" }), page("right", { openMode: "dual", dualGroupId: "B" })];
  const draft = prepareRows(captured);
  assert.equal(draft.filter((p) => p.selected).length, 9);
  assert.deepEqual(draft.slice(-2).map((p) => [p.selected, p.openMode, p.dualGroupId]), [[false, "dual", "B"], [false, "dual", "B"]]);
  assert.equal(groupPages(draft).at(-1).dual, true);
  const full = prepareRows(captured.slice(1));
  assert.equal(full.filter((p) => p.selected).length, 10);
  assert.ok(full.slice(-2).every((p) => p.selected));
});

test("듀얼탭 어느 쪽을 해제해도 남은 쪽은 일반탭으로 저장·실행되고 재선택하면 쌍이 복원된다", async () => {
  const captured = [page("left", { openMode: "dual", dualGroupId: "A" }), page("right", { openMode: "dual", dualGroupId: "A" }), page("single")];
  for (const removedIndex of [0, 1]) {
    const draft = prepareRows(captured);
    draft[removedIndex].selected = false;
    const remainingId = captured[1 - removedIndex].id;
    const [saved] = mutateWorkspaces([], "WORKSPACE_SAVE", { name: "한쪽만", pages: selectedPages(draft) });
    assert.deepEqual(saved.pages.map(p => [p.id, p.openMode, p.dualGroupId]), [[remainingId, "tab", null], ["single", "tab", null]]);
    const singles = [];
    await launchWorkspace(saved, { currentWindow: async () => ({ id: 1 }), create: async tab => { singles.push(tab.url); return { id: singles.length }; }, createDual: async () => assert.fail("한쪽만 선택한 페이지가 듀얼탭으로 실행됨"), activate: async () => {} });
    assert.deepEqual(singles, [captured[1 - removedIndex].url, captured[2].url]);
    draft[removedIndex].selected = true;
    assert.deepEqual(workspace({ name: "복원", pages: selectedPages(draft) }).pages, captured);
  }
});

test("9개 일반 페이지와 듀얼탭 한쪽을 선택해 10개로 저장할 수 있다", () => {
  const draft = prepareRows([...Array.from({ length: 9 }, (_, i) => page(String(i))), page("left", { openMode: "dual", dualGroupId: "B" }), page("right", { openMode: "dual", dualGroupId: "B" })]);
  draft[9].selected = true;
  const saved = workspace({ name: "10개", pages: selectedPages(draft) });
  assert.equal(saved.pages.length, 10);
  assert.equal(saved.pages.at(-1).id, "left");
  assert.equal(saved.pages.at(-1).openMode, "tab");
  draft[10].selected = true;
  assert.throws(() => workspace({ name: "11개", pages: selectedPages(draft) }), /1~10개/);
});
test("실행 가능한 스킴·자격정보 URL 거부", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,x", "file://server/share/a.pdf", "file:///", "whale://settings", "https://user:pass@example.com"]) assert.throws(() => pageUrl(url));
  assert.equal(pageUrl("https://example.com"), "https://example.com/");
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
test("5개를 넘겨 저장·수정 충돌·이름 보존", () => {
  let items = [];
  for (let i = 0; i < 12; i++) items = mutateWorkspaces(items, "WORKSPACE_SAVE", sample(), i + 1);
  assert.equal(items[0].name, sample().name);
  assert.equal(items.length, 12);
  assert.equal(new Set(items.map(item => item.id)).size, 12);
  assert.throws(() => mutateWorkspaces(items, "WORKSPACE_SAVE", { ...items[0], updatedAt: -1 }));
  const updated = mutateWorkspaces(items, "WORKSPACE_SAVE", { ...items[0], name: "수정" }, 10);
  assert.equal(updated[0].name, "수정"); assert.equal(updated.length, 12);
  assert.equal(mutateWorkspaces(items, "WORKSPACE_DELETE", { id: items[0].id }).length, 11);
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
