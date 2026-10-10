import { request } from "./messages.js";
import { subscribe } from "./storage.js";
export const workspaceStore = {
  list: () => request("WORKSPACES_LIST"),
  save: (value) => request("WORKSPACE_SAVE", value),
  remove: (id) => request("WORKSPACE_DELETE", { id }),
  subscribe: (listener) => subscribe("mewe.workspaces", listener)
};
