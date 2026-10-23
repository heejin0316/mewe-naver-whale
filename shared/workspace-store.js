import { request } from "./messages.js";
import { subscribe } from "./storage.js";
export const workspaceStore = {
  list: () => request("WORKSPACES_LIST"),
  save: (value) => request("WORKSPACE_SAVE", value),
  append: (id, pages) => request("WORKSPACE_APPEND", { id, pages }),
  remove: (id) => request("WORKSPACE_DELETE", { id }),
  move: (id, beforeId) => request("WORKSPACE_MOVE", { id, beforeId }),
  subscribe: (listener) => {
    const saved = subscribe("mewe.workspaces", listener);
    const opened = subscribe("mewe.openWorkspaces", listener, "session");
    return () => { saved(); opened(); };
  }
};
