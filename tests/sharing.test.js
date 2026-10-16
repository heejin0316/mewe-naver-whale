import test from "node:test";
import assert from "node:assert/strict";
import { prepareShare, sharedWorkspace, newShareCode, normalizeCode, importedWorkspace } from "../features/sharing/model.js";
import { createShareClient, encodeValue, decodeValue } from "../features/sharing/firebase.js";
import { CONSENT_VERSION, hasSharingConsent, consentRecord } from "../features/sharing/consent.js";

test("동의 버전·개별 항목·시각이 유효할 때만 공유 동의를 재사용", () => {
  const payload = { version: CONSENT_VERSION, processing: true, overseas: true };
  const record = consentRecord(payload, new Date("2026-10-16T00:00:00Z"));
  assert.equal(hasSharingConsent(record), true);
  for (const value of [null, true, {}, { ...record, version: "old" }, { ...record, processing: false }, { ...record, overseas: false }, { ...record, acceptedAt: "invalid" }]) assert.equal(hasSharingConsent(value), false);
  for (const value of [{}, { ...payload, version: "old" }, { ...payload, processing: false }, { ...payload, overseas: false }]) assert.throws(() => consentRecord(value));
});
const page = (id, url, group = null) => ({ id, title: id, url, openMode: group ? "dual" : "tab", dualGroupId: group });
const sample = () => ({ name: "공유 테스트", pages: [page("a", "https://example.com/a", "A"), page("pdf", "file:///C:/private.pdf", "A"), page("b", "https://example.com/b", "B"), page("c", "https://example.com/c", "B")] });
test("공유 전에 파일을 제외하고 불완전한 듀얼탭만 해제, 원본 보존", () => {
  const original = sample(), before = structuredClone(original), result = prepareShare(original);
  assert.equal(result.excluded.length, 1);
  assert.deepEqual(result.pages.map(p => p.openMode), ["tab", "dual", "dual"]);
  assert.equal(result.pages[0].dualGroupId, null);
  assert.deepEqual(original, before);
  assert.throws(() => sharedWorkspace(original));
  const imported = importedWorkspace(result);
  assert.notEqual(imported.pages[0].id, result.pages[0].id);
});
test("공유 코드 형식, 임의 URL 및 긴 문자열 차단", () => {
  assert.equal(normalizeCode("abcd-efgh-2345"), "ABCDEFGH2345");
  for (let i = 0; i < 100; i++) assert.match(newShareCode(), /^[A-HJ-NP-Z2-9]{12}$/);
  for (const s of ["https://example.com", "../shares/abc", "A".repeat(41), "000000000000"]) assert.throws(() => normalizeCode(s));
});
function fixture(responses, stored = null) {
  const calls = []; let auth = stored;
  const client = createShareClient({ loadAuth: async () => auth, saveAuth: async a => { auth = a; }, now: () => 1700000000000,
    codeFactory: () => "ABCDEFGH2345", fetcher: async (url, options) => { calls.push({ url, ...options }); const response = responses.shift(); if (response instanceof Error) throw response; return new Response(JSON.stringify(response.body), { status: response.status || 200 }); } });
  return { client, calls, auth: () => auth };
}
const signIn = { body: { localId: "user1", idToken: "token1", refreshToken: "refresh1", expiresIn: "3600" } };
test("전송 데이터에서 파일 경로·제외 목록 제거, 서버 타임스탬프, 재인증 없이 재사용", async () => {
  const f = fixture([signIn, { body: {} }, { body: {} }]);
  await f.client.create(sample()); await f.client.create(sample());
  assert.equal(f.calls.filter(c => c.url.includes("signUp")).length, 1);
  const sent = JSON.parse(f.calls[1].body).writes[0];
  const data = decodeValue({ mapValue: { fields: sent.update.fields } });
  assert.equal(data.pages.length, 3);
  assert.ok(!JSON.stringify(sent).includes("private.pdf"));
  assert.equal(data.ownerUid, "user1"); assert.equal(data.excluded, undefined);
  assert.deepEqual(sent.currentDocument, { exists: false });
  assert.equal(sent.updateTransforms[0].setToServerValue, "REQUEST_TIME");
});
test("잘못된 코드·파일 전용 작업공간은 인증/네트워크 요청도 하지 않음", async () => {
  const f = fixture([]);
  await assert.rejects(f.client.get("invalid"));
  await assert.rejects(f.client.create({ name: "PDF", pages: [page("pdf", "file:///C:/a.pdf")] }));
  assert.equal(f.calls.length, 0);
});
test("만료 토큰 갱신, 응답의 계정 유지", async () => {
  const f = fixture([{ body: { user_id: "user1", id_token: "token2", refresh_token: "refresh2", expires_in: "3600" } }, { body: {} }], { uid: "user1", idToken: "old", refreshToken: "refresh1", expiresAt: 1 });
  await f.client.create(sample());
  assert.match(f.calls[0].url, /securetoken/); assert.equal(f.auth().uid, "user1");
  assert.equal(f.calls[1].headers.Authorization, "Bearer token2");
});
test("무료 한도·규칙 미적용·네트워크 실패를 사용자 메시지로 전달", async () => {
  for (const [failure, pattern] of [[{ status: 429, body: { error: { status: "RESOURCE_EXHAUSTED" } } }, /사용 한도/], [{ status: 403, body: { error: { status: "PERMISSION_DENIED" } } }, /공유 코드를 저장하지 못했어요/], [new Error("offline"), /인터넷 연결/]]) {
    const f = fixture([signIn, failure]); await assert.rejects(f.client.create(sample()), pattern);
  }
});
test("받은 데이터 재검증, 만료·파일·잘못된 듀얼탭 거부", async () => {
  for (const extra of [{ expiresAt: new Date(1) }, { pages: [page("bad", "file:///C:/x")] }, { pages: [page("bad", "https://example.com", "A")] }]) {
    const data = { schemaVersion: 1, ...prepareShare(sample()), expiresAt: new Date(1800000000000), ...extra };
    const f = fixture([signIn, { body: { fields: encodeValue(data).mapValue.fields } }]);
    await assert.rejects(f.client.get("ABCDEFGH2345"));
  }
});
