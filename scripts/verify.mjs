// Verification suite for romantelescope.space: serves dist/, drives headless
// chromium, and checks the live tickers, mission-stage switching (via clock
// shifting), the what's-next diagram, and the DSN diagram bounds in all
// five languages. Run with: npm test  (after npm run build)
import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { chromium } from "playwright-core";
import path from "node:path";
import os from "node:os";

const DIST = new URL("../dist", import.meta.url).pathname;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain" };

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(os.homedir(), ".cache/ms-playwright");
  const dirs = readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort();
  if (!dirs.length) throw new Error("no chromium under ~/.cache/ms-playwright — set CHROME_PATH");
  return path.join(base, dirs[dirs.length - 1], "chrome-linux64/chrome");
}

const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  let f = path.join(DIST, p);
  if (!existsSync(f) && existsSync(f + "/index.html")) f += "/index.html";
  if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise(r => server.listen(4399, r));
const browser = await chromium.launch({ executablePath: chromePath() });

const LAUNCH = Date.UTC(2026, 7, 30, 11, 26, 0);
const nowDay = (Date.now() - LAUNCH) / 86400000;
let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? "PASS" : "FAIL"), name, detail || "");
  if (!cond) failures++;
}

async function probe(targetDay, lang) {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  await ctx.addInitScript((shift) => {
    const RD = Date.now;
    Date.now = () => RD() + shift;
  }, (targetDay - nowDay) * 86400000);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("http://localhost:4399/" + (lang || ""), { waitUntil: "load" });
  await page.waitForTimeout(1300);
  const r = await page.evaluate(() => ({
    dist: document.getElementById("stDist").textContent,
    pct: document.getElementById("stPct").textContent,
    dayLine: document.getElementById("stDayLine").textContent,
    nxDays: document.getElementById("nxDays").textContent,
    routeChip: document.querySelector("#route .chip").textContent,
    deploysChip: document.querySelector("#deploys .chip").textContent,
    cameraChip: document.querySelector("#camera .chip").textContent,
    dpDots: [...document.querySelectorAll(".dpitem")].map(b => b.classList.contains("done")).join(","),
    openPhase: [...document.querySelectorAll("#next .steps details")].findIndex(d => d.open),
    fpCount: document.getElementById("fpCount").textContent,
    ldGone: document.getElementById("ldGone").textContent,
    ldRemain: document.getElementById("ldRemain").textContent,
    tb1Stroke: document.getElementById("nxTb1Line").getAttribute("stroke"),
    tb1w: document.getElementById("svgTb1w").textContent,
    tb2Op: document.getElementById("nxTb2Line").getAttribute("opacity"),
    brake: document.getElementById("nxBrakeArrow").getAttribute("fill"),
    craft: document.getElementById("nxCraft").getAttribute("transform"),
    dsnNow: document.getElementById("dsnNow").textContent,
    // DSN bounds: every element inside the rendered svg box (2px slack)
    dsnOverflow: (() => {
      const svg = document.querySelector("#listening svg");
      const sb = svg.getBoundingClientRect();
      const bad = [];
      svg.querySelectorAll("circle, text, line, path").forEach(el => {
        const b = el.getBoundingClientRect();
        if (!b.width && !b.height) return;
        if (b.left < sb.left - 2 || b.top < sb.top - 2 || b.right > sb.right + 2 || b.bottom > sb.bottom + 2)
          bad.push(el.tagName + "#" + (el.id || (el.textContent || "?").slice(0, 12)));
      });
      return bad.join(";");
    })(),
  }));
  r.errs = errs;
  await ctx.close();
  return r;
}

// --- all languages at the current date ---
const num = s => parseInt(String(s).replace(/[^\d]/g, ""), 10);
for (const lang of ["", "hu/", "de/", "es/", "zh/"]) {
  const r = await probe(nowDay, lang);
  const ok = r.errs.length === 0 && r.dist.includes("km") &&
    r.dpDots === "true,true,true,true,true" &&
    Math.abs(num(r.ldGone) + num(r.ldRemain) - 1500000) < 3 &&
    r.dsnOverflow === "" && r.dsnNow.length > 2;
  check("lang /" + lang, ok, r.dist + " | dots=" + r.dpDots + (r.dsnOverflow ? " | DSN overflow: " + r.dsnOverflow : "") + (r.errs.length ? " | " + r.errs.join(";") : ""));
}

// --- stage behavior at key mission days (English) ---
const t = await probe(nowDay);
check("today camera chip active (WFI confirmed Sep 15)", /active/.test(t.cameraChip), t.cameraChip);
check("today tb1 amber + completed", t.tb1Stroke === "#ffb454" && /completed Aug 31/.test(t.tb1w), t.tb1w);
check("today tb2 tick hidden while unconfirmed + brake dim", nowDay < 90 ? (t.tb2Op === "0" && t.brake === "#3a4877") : true, "op=" + t.tb2Op + " brake=" + t.brake);
check("today craft position sane", /translate\(/.test(t.craft), t.craft);

const d20 = await probe(20);
check("d20 camera chip active (flag overrides date)", /active/.test(d20.cameraChip), d20.cameraChip);
check("d20 phase 2 open", d20.openPhase === 1, "open=" + d20.openPhase);

const d40 = await probe(40);
check("d40 camera chip active", /active/.test(d40.cameraChip), d40.cameraChip);
check("d40 detectors lit", /18/.test(d40.fpCount), d40.fpCount);
check("d40 phase 3 open", d40.openPhase === 2, "open=" + d40.openPhase);

const d95 = await probe(95);
check("d95 station line", /on station/.test(d95.dayLine), d95.dayLine);
check("d95 pct 100 + dist pinned", /100/.test(d95.pct) && /1,500,000/.test(d95.dist), d95.pct + " " + d95.dist);
check("d95 route chip arrived", /arrived/.test(d95.routeChip), d95.routeChip);
check("d95 nxDays counts up", parseInt(d95.nxDays) === 5, d95.nxDays);
check("d95 brake amber + craft on halo", d95.brake === "#ffb454" && parseFloat(d95.craft.match(/translate\(([\d.]+)/)[1]) > 700, d95.brake + " " + d95.craft);
check("d95 phase 4 open", d95.openPhase === 3, "open=" + d95.openPhase);

const d95hu = await probe(95, "hu/");
check("d95 hu station line", /állomáshely/.test(d95hu.dayLine), d95hu.dayLine);

const d100 = await probe(100);
check("d100 phase 5 open", d100.openPhase === 4, "open=" + d100.openPhase);

// --- DSN bounds across the day ---
for (let h = 0; h < 24; h += 6) {
  const r = await probe(nowDay + h / 24);
  check("dsn bounds UTC+" + h + "h", r.dsnOverflow === "" && r.errs.length === 0, r.dsnOverflow || r.errs.join(";"));
}

await browser.close();
server.close();
console.log(failures ? failures + " FAILURES" : "ALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
