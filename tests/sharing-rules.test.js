// Start the Firestore emulator with firestore.rules on 127.0.0.1:8787 first.
// Only the demo project and local emulator are contacted; no real Firebase credentials.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createShareClient, encodeValue } from "../features/sharing/firebase.js";
const projectId = "demo-mewe", base = "http://127.0.0.1:8787/v1";
const documents = `projects/${projectId}/databases/(default)/documents`;
function token(uid) {
  const now = Math.floor(Date.now() / 1000);
  return [Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ aud: projectId, iss: `https://securetoken.google.com/${projectId}`, sub: uid, user_id: uid, iat: now, exp: now + 3600, auth_time: now, firebase: { identities: {}, sign_in_provider: "anonymous" } })).toString("base64url"), ""].join(".");
}
const client = uid => createShareClient({ config: { projectId, apiKey: "demo" }, firestoreBase: base, loadAuth: async () => ({ uid, idToken: token(uid), expiresAt: Date.now() + 3600000 }), saveAuth: async () => { throw new Error("Auth emulator not needed"); }, fetcher: async (...args) => { const r = await fetch(...args); if(!r.ok) console.log(r.status,await r.clone().text()); return r; } });
const sample = { name: "팀 과제", pages: [{ id: "a", title: "문서", url: "https://example.com/notes", openMode: "tab", dualGroupId: null }] };
const send = (url, auth, method = "GET", body) => fetch(base + "/" + documents + url, { method, headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
const rawCreate = (code, data, uid = "alice") => send(":commit", token(uid), "POST", { writes: [{ update: { name: `${documents}/shares/${code}`, fields: encodeValue(data).mapValue.fields }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }] }] });
test("Firestore rules: two guests share, no public/list/update/foreign delete, validation and expiry", async () => {
  const rules = await fetch('http://127.0.0.1:8787/emulator/v1/projects/demo-mewe:securityRules', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') }] } }) });
  assert.ok(rules.ok, await rules.text());
  await send('/shares/ABCDEFGHJKLM', 'owner', 'DELETE');
  const a = client("alice"), b = client("bob"), result = await a.create(sample);
  assert.deepEqual((await b.get(result.code)).workspace, sample);
  assert.equal((await send(`/shares/${result.code}`, null)).status, 403);
  assert.equal((await send("/shares", token("bob"))).status, 403);
  assert.equal((await send(`/shares/${result.code}`, token("bob"), "DELETE")).status, 403);
  assert.equal((await send(`/shares/${result.code}`, token("alice"), "PATCH", { fields: encodeValue({ ...sample, ownerUid: "alice" }).mapValue.fields })).status, 403);
  const valid = { schemaVersion: 1, ...sample, ownerUid: "alice", expiresAt: new Date(Date.now() + 86400000) };
  const ten = await rawCreate("ABCDEFGHJKLM", { ...valid, pages: Array.from({ length: 10 }, (_, i) => ({ ...sample.pages[0], id: String(i), openMode: "dual", dualGroupId: String(Math.floor(i / 2)) })) });
  assert.equal(ten.status, 200, 'ten-page rules evaluation: ' + await ten.text());
  for (const change of [
    { ownerUid: "bob" }, { secret: "unexpected" }, { pages: [] }, { pages: Array(11).fill(sample.pages[0]) },
    { pages: [{ ...sample.pages[0], url: "file:///C:/private.pdf" }] },
    { pages: [{ ...sample.pages[0], url: "javascript:alert(1)" }] },
    { pages: [{ ...sample.pages[0], url: "https://user:password@example.com" }] },
    { name: "x".repeat(61) }, { expiresAt: new Date(Date.now() + 9 * 86400000) }
  ]) {
    const response = await rawCreate("ABCDEFGH2345", { ...valid, ...change });
    assert.equal(response.status, 403, JSON.stringify(change) + ": " + await response.text());
  }
  // Seed an expired document via the emulator's admin token, then test ordinary-user rules.
  const expired = await send("/shares/ABCDEFGH6789", "owner", "PATCH", { fields: encodeValue({ ...valid, createdAt: new Date(1), expiresAt: new Date(1) }).mapValue.fields });
  assert.ok(expired.ok);
  assert.equal((await send("/shares/ABCDEFGH6789", token("bob"))).status, 403);
  assert.equal((await send(`/shares/${result.code}`, token("alice"), "DELETE")).status, 200);
});
