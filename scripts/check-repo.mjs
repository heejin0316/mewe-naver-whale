// Offline consistency checks. Does not access Firebase or change repository files.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const pkg = JSON.parse(read("package.json"));
assert.equal(pkg.version, manifest.version, "package.json과 manifest.json 버전 불일치");
assert.equal(pkg.license, "MIT");
const files = [];
function walk(relative) {
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    if ([".git", "node_modules", "tmp", "release", "test-results"].includes(entry.name) || entry.name.startsWith(".test-profile")) continue;
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) walk(next);
    else files.push(next);
  }
}
walk("");
function reference(from, raw) {
  if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(raw)) return;
  const url = decodeURIComponent(raw.split(/[?#]/)[0]);
  if (!url) return;
  const target = path.resolve(root, path.dirname(from), url);
  const relative = path.relative(root, target);
  assert.ok(!relative.startsWith("..") && !path.isAbsolute(relative), `${from}: 저장소 밖 경로 ${raw}`);
  assert.ok(fs.existsSync(target), `${from}: 없는 파일 ${raw}`);
}
for (const file of files) {
  const source = /\.(md|html|js|mjs|css)$/.test(file) ? read(file) : "";
  if (file.endsWith(".md")) {
    // Ignore examples inside code fences; check Markdown links and embedded images.
    const prose = source.replace(/```[\s\S]*?```/g, "");
    for (const match of prose.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) reference(file, match[1]);
    for (const match of prose.matchAll(/(?:src|href)="([^"]+)"/g)) reference(file, match[1]);
  }
  if (file.endsWith(".html")) {
    for (const match of source.matchAll(/(?:src|href)="([^"]+)"/g)) reference(file, match[1]);
  }
  if ((file.startsWith("shared") || file.startsWith("features") || ["app.js", "background.js"].includes(file)) && file.endsWith(".js")) {
    execFileSync(process.execPath, ["--check", path.join(root, file)], { stdio: "pipe" });
    for (const match of source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)) reference(file, match[1]);
  }
}
for (const file of [manifest.background.service_worker, manifest.sidebar_action.default_page, "LICENSE", "assets/icons/LICENSE.txt"]) reference("manifest.json", file);
for (const iconSet of [manifest.icons, manifest.sidebar_action.default_icon]) for (const [size, file] of Object.entries(iconSet)) {
  reference("manifest.json", file);
  const bytes = fs.readFileSync(path.join(root, file));
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${file}: PNG 형식 확인`);
  // A larger source is intentional for Whale's enlarged management-page slot.
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  assert.equal(width, height, `${file}: 정사각형 아이콘`);
  assert.ok(width >= Number(size), `${file}: 표시 크기보다 작은 원본`);
}
execFileSync(process.execPath, [path.join(root, "scripts/build-privacy.mjs"), "--check"], { stdio: "inherit" });
console.log(`저장소 점검 통과: 버전 ${manifest.version}, 실행 코드 문법, 아이콘 크기, 로컬 링크·참조, 라이선스 고지`);
