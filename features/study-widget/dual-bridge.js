import { webUrl } from "../../shared/validation.js";
// Public Whale web API only. No iframe, debugger, content injection, or private API.
try {
  const config = JSON.parse(decodeURIComponent(location.hash.slice(1)));
  const left = webUrl(config.left), right = webUrl(config.right);
  const initialWidth = innerWidth;
  const link = document.createElement("a");
  link.href = right; link.rel = "whale-space"; link.textContent = "오른쪽 페이지 열기";
  link.hidden = true; document.body.append(link); link.click();
  const start = Date.now();
  const timer = setInterval(() => {
    // Navigate only after the native split actually changes the helper's viewport.
    if (innerWidth < initialWidth * 0.85) {
      clearInterval(timer); location.replace(left);
    } else if (Date.now() - start > 5000) {
      clearInterval(timer);
      document.querySelector("#status").textContent = "나란히 보기를 준비하지 못해 각 페이지를 따로 열고 있어요.";
    }
  }, 50);
} catch (error) { document.querySelector("#status").textContent = error.message; }
