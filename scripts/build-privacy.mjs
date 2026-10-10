import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { privacy, supportEmail } from "../shared/privacy-content.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const escape = text => text.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const markdown = [`# ${privacy.title}`, `작성일: ${privacy.date}`, `> ${privacy.status}`,
  ...privacy.sections.flatMap(s => [`## ${s.title}`, ...s.paragraphs, ...(s.links || []).map(l => `[${l.label}](${l.url})`)])].join("\n\n") + "\n";
const sections = privacy.sections.map(s => `<section><h2>${escape(s.title)}</h2>${s.paragraphs.map(p => `<p>${escape(p)}</p>`).join("")}${(s.links || []).map(l => `<p><a href="${escape(l.url)}" rel="noopener noreferrer">${escape(l.label)}</a></p>`).join("")}</section>`).join("\n");
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escape(privacy.title)}</title><style>body{margin:0;background:#fff;color:#202429;font:16px/1.85 system-ui,sans-serif}main{max-width:760px;margin:auto;padding:40px 22px 64px}h1{font-size:28px;line-height:1.4}h2{font-size:20px;margin-top:36px}p{overflow-wrap:anywhere}a{color:#075b46}aside{background:#eff6f3;padding:16px;border-radius:12px}small{color:#727880}</style></head><body><main><h1>${escape(privacy.title)}</h1><small>작성일 ${privacy.date}</small><aside>${escape(privacy.status)}</aside><p><a href="mailto:${supportEmail}">문의: ${supportEmail}</a></p>${sections}</main></body></html>\n`;
fs.mkdirSync(path.join(root, "docs", "privacy"), { recursive: true });
fs.writeFileSync(path.join(root, "PRIVACY.md"), markdown);
fs.writeFileSync(path.join(root, "docs", "privacy", "index.html"), html);
console.log("Generated PRIVACY.md and docs/privacy/index.html from shared/privacy-content.js");
