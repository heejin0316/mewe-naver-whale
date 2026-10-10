import { api, call } from "./browser.js";
export async function request(type, payload = {}) {
  const requestId = crypto.randomUUID();
  const response = await call(api.runtime, "sendMessage", { requestId, type, payload });
  if (!response || response.requestId !== requestId) throw new Error("앱 연결이 끊겼어요. 확장앱을 다시 열어 주세요.");
  if (!response.ok) throw new Error(response.error?.message || "요청을 처리하지 못했어요.");
  return response.data;
}
