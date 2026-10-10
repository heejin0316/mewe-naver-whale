export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "className") node.className = value;
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.filter((c) => c != null));
  return node;
}
export const button = (label, action, className = "btn") => el("button", { type: "button", className, onclick: action }, label);
export function field(label, input) { return el("label", { className: "field" }, el("span", {}, label), input); }
export async function busy(buttonNode, operation, reportError) {
  if (buttonNode.disabled) return;
  buttonNode.disabled = true;
  try { return await operation(); } catch (error) { reportError(error.message); } finally { buttonNode.disabled = false; }
}
