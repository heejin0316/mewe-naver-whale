import { api, call } from "./browser.js";
export async function read(key, fallback) {
  const value = await call(api.storage.local, "get", key);
  return value[key] ?? fallback;
}
// Only the service worker writes user data. UI modules use messages instead.
export async function write(key, value) { await call(api.storage.local, "set", { [key]: value }); }
export function subscribe(key, listener) {
  const handler = (changes, area) => { if (area === "local" && changes[key]) listener(changes[key].newValue); };
  api.storage.onChanged.addListener(handler);
  return () => api.storage.onChanged.removeListener(handler);
}
export function serialQueue() {
  let tail = Promise.resolve();
  return (operation) => { const next = tail.then(operation); tail = next.catch(() => {}); return next; };
}
