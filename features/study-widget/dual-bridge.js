import { pageUrl } from "../../shared/validation.js";
// File navigation uses the tabs API; web navigation stays in this left-hand document.
try {
  const { token, left: value } = JSON.parse(decodeURIComponent(location.hash.slice(1)));
  if (!/^[a-f0-9-]{36}$/.test(token)) throw new Error("잘못된 작업공간 요청이에요.");
  const left = pageUrl(value), initialWidth = innerWidth;
  const link = document.createElement("a");
  link.href = new URL("dual-target.html#" + token, location.href).href;
  link.rel = "whale-space";
  link.textContent = "오른쪽 페이지 준비";
  link.hidden = true;
  document.body.append(link);
  link.click();
  if (!left.startsWith("file:")) {
    const started = Date.now();
    const timer = setInterval(() => {
      if (innerWidth < initialWidth * 0.85) { clearInterval(timer); location.replace(left); }
      else if (Date.now() - started > 8000) clearInterval(timer);
    }, 50);
  }
} catch (error) { document.querySelector("#status").textContent = error.message; }
