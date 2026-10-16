import { firebaseConfig } from "../../shared/firebase-config.js";
import { newShareCode, normalizeCode, prepareShare, sharedWorkspace, SHARE_DAYS } from "./model.js";

export function encodeValue(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") return { integerValue: String(value) };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeValue(v)])) } };
}
export function decodeValue(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, decodeValue(v)]));
  throw new Error("공유 데이터 형식이 올바르지 않아요.");
}
function userError(error, operation) {
  const code = error.code || "";
  if (/RESOURCE_EXHAUSTED|TOO_MANY_ATTEMPTS|QUOTA_EXCEEDED/.test(code) || error.status === 429) return new Error("공유 서비스의 사용 한도에 도달했어요. 나중에 다시 시도해 주세요. 개인 작업공간은 계속 사용할 수 있어요.");
  if (/OPERATION_NOT_ALLOWED|ADMIN_ONLY_OPERATION/.test(code)) return new Error("공유 서비스를 이용할 수 없어요. 잠시 후 다시 시도하거나 앱 정보의 문의 주소로 알려 주세요.");
  if (/PERMISSION_DENIED/.test(code)) return new Error(operation === "get" ? "공유 코드를 찾을 수 없거나 만료되었어요. 보낸 사람에게 새 코드를 요청해 주세요." : "공유 코드를 저장하지 못했어요. 잠시 후 다시 시도하거나 앱 정보의 문의 주소로 알려 주세요.");
  if (error.status === 404) return new Error("공유 코드를 찾을 수 없어요. 코드를 다시 확인해 주세요.");
  if (error.status === 401) return new Error("공유 인증에 실패했어요. 잠시 후 다시 시도해 주세요.");
  if (error.status) return new Error("공유 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
  return error;
}

// Firebase REST + ID tokens obey Firestore Security Rules. No remote executable SDK,
// service account, Cloud Functions, Storage uploads, or paid TTL service is used.
export function createShareClient({ loadAuth, saveAuth, fetcher = fetch, config = firebaseConfig,
  authBase = "https://identitytoolkit.googleapis.com/v1", tokenBase = "https://securetoken.googleapis.com/v1",
  firestoreBase = "https://firestore.googleapis.com/v1", now = Date.now, codeFactory = newShareCode }) {
  const documents = `projects/${config.projectId}/databases/(default)/documents`;
  let authTask;
  async function json(url, options = {}) {
    let response;
    try { response = await fetcher(url, { ...options, signal: AbortSignal.timeout(15000), cache: "no-store" }); }
    catch { throw new Error("인터넷 연결을 확인한 뒤 다시 시도해 주세요."); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error("공유 요청에 실패했어요.");
      error.status = response.status; error.code = data.error?.status || data.error?.message || "";
      throw error;
    }
    return data;
  }
  async function authenticate(force = false) {
    if (authTask) return authTask;
    authTask = (async () => {
      const stored = await loadAuth();
      if (!force && stored?.idToken && stored.expiresAt > now() + 60000) return stored;
      let result;
      if (stored?.refreshToken) {
        try {
          result = await json(`${tokenBase}/token?key=${config.apiKey}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: stored.refreshToken }).toString() });
        } catch (error) {
          if (!/TOKEN_EXPIRED|INVALID_REFRESH_TOKEN|USER_NOT_FOUND/.test(error.code || "")) throw error;
        }
      }
      if (!result) result = await json(`${authBase}/accounts:signUp?key=${config.apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }) });
      const auth = { uid: result.localId || result.user_id, idToken: result.idToken || result.id_token, refreshToken: result.refreshToken || result.refresh_token, expiresAt: now() + Number(result.expiresIn || result.expires_in) * 1000 };
      if (!auth.uid || !auth.idToken || !auth.refreshToken) throw new Error("공유 인증 응답이 올바르지 않아요.");
      await saveAuth(auth); return auth;
    })();
    try { return await authTask; } finally { authTask = null; }
  }
  async function authorized(path, options, auth, retried = false) {
    try { return await json(`${firestoreBase}/${documents}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.idToken}` } }); }
    catch (error) {
      if (error.status === 401 && !retried) {
        const renewed = await authenticate(true);
        if (renewed.uid !== auth.uid) throw error;
        return authorized(path, options, renewed, true);
      }
      throw error;
    }
  }
  return {
    async create(input) {
      const prepared = prepareShare(input);
      if (!prepared.pages.length) throw new Error("공유할 수 있는 웹페이지가 없어요.");
      const clean = sharedWorkspace(prepared);
      try {
        const auth = await authenticate();
        const expiresAt = new Date(now() + SHARE_DAYS * 86400000);
        for (let attempt = 0; attempt < 4; attempt++) {
          const code = normalizeCode(codeFactory());
          const fields = encodeValue({ schemaVersion: 1, ...clean, ownerUid: auth.uid, expiresAt }).mapValue.fields;
          try {
            await authorized(":commit", { method: "POST", body: JSON.stringify({ writes: [{ update: { name: `${documents}/shares/${code}`, fields }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }] }] }) }, auth);
            return { code, expiresAt: expiresAt.toISOString() };
          } catch (error) { if (error.status !== 409 && error.code !== "ALREADY_EXISTS") throw error; }
        }
        throw new Error("공유 코드를 만들지 못했어요. 다시 시도해 주세요.");
      } catch (error) { throw userError(error, "create"); }
    },
    async get(value) {
      const code = normalizeCode(value);
      try {
        const auth = await authenticate();
        const document = await authorized(`/shares/${code}`, { method: "GET" }, auth);
        const data = decodeValue({ mapValue: { fields: document.fields || {} } });
        if (data.schemaVersion !== 1) throw new Error("지원하지 않는 공유 형식이에요. 확장앱을 업데이트해 주세요.");
        if (!Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= now()) throw new Error("만료된 공유 코드예요. 새 코드를 받아 주세요.");
        return { workspace: sharedWorkspace(data), expiresAt: data.expiresAt };
      } catch (error) { throw userError(error, "get"); }
    }
  };
}
