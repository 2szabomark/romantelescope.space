// Client engine for romantelescope.space.
// Static text is baked into each language's HTML at build time; this script only
// needs the runtime strings (live tickers, captions, labels drawn into SVG),
// which the page inlines as JSON in #strdata.
import ANAT from "../data/anat.json";

var $ = function (id) { return document.getElementById(id); };
var NS = "http://www.w3.org/2000/svg";
var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var mobMQ = window.matchMedia("(max-width: 640px)");
var MOB = mobMQ.matches;

var LANG = (document.documentElement.lang || "en").slice(0, 2);
var LOCALES = { en: "en-US", de: "de-DE", es: "es-ES", zh: "zh-CN", hu: "hu-HU" };
var STR = JSON.parse(document.getElementById("strdata").textContent);

// ---------- mission model ----------
var LAUNCH = Date.UTC(2026, 7, 30, 11, 26, 0);
var DAY = 86400000;
var CRUISE = 90, L2KM = 1500000, MOONKM = 384400, TAU = 13;
var NORM = 1 - Math.exp(-CRUISE / TAU);
var C_KM_S = 299792;

function eDays(msOffset) {
  return Math.max(0, (Date.now() - (msOffset || 0) - LAUNCH) / DAY);
}

// ---------- mission stages ----------
// Everything that can honestly follow the launch clock switches automatically.
// Milestones that need NASA's word stay manual: flip a flag here when the
// mission blog confirms it, and every affected module updates on its own.
var CONFIRMED = {
  hga: false,        // high-gain antenna deployed        (deploy board item 3)
  cover: false,      // aperture cover open               (deploy board item 4)
  cgi: false,        // coronagraph powered on            (deploy board item 5)
  wfiActive: false,  // Wide Field Instrument switched on (camera section)
  arrived: false,    // halo-orbit insertion confirmed
  firstImages: false // first public images released
};
var PLAN = {
  deployWindow: 7,   // "within days" — after this the remaining deploys show "expected any day"
  camWake: 21,       // NASA: WFI activates a few weeks in — chip switches to "activation window"
  arrive: 90         // ~90-day cruise
};
function onStation(d) { return CONFIRMED.arrived || d >= PLAN.arrive; }
function frac(d) { if (d <= 0) return 0; return (1 - Math.exp(-Math.min(d, CRUISE) / TAU)) / NORM; }
function km(d) { return L2KM * frac(d); }
var ASC = 45 / 1440;      // ~45-minute powered ascent, modeled
var VPEAK = 36000;        // km/h just after the final burn — near escape speed, modeled
function vTail(d) { return (L2KM / TAU) * Math.exp(-d / TAU) / NORM / 24; }
function kmh(d) {
  if (d <= 0) return 0;
  if (d >= CRUISE) return 5;
  if (d < ASC) return VPEAK * Math.sin(Math.PI / 2 * d / ASC);
  var burst = (VPEAK - vTail(ASC)) * Math.exp(-(d - ASC) / 0.35);
  return burst + vTail(d);
}
function fmt(n) { return Math.round(n).toLocaleString(LOCALES[LANG]); }
function T(k, v) {
  var s = STR[k];
  if (s == null) s = k;
  if (v) for (var key in v) s = s.split("{" + key + "}").join(v[key]);
  return s;
}

function makeEl(tag, attrs, parent) {
  var el = document.createElementNS(NS, tag);
  for (var k in attrs) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
}
function animate(dur, step, done) {
  var t0 = null;
  function f(ts) {
    if (t0 === null) t0 = ts;
    var p = Math.min(1, (ts - t0) / dur);
    step(p);
    if (p < 1) requestAnimationFrame(f); else if (done) done();
  }
  requestAnimationFrame(f);
}
var ease = function (k) { return 1 - Math.pow(1 - k, 3); };

// ---------- hero ----------
function tickHero() {
  var d = eDays();
  var dist = km(d);
  var distAgo = km(eDays(3600000));
  var sp = kmh(d), spAgo = kmh(eDays(3600000));
  var delay = dist / C_KM_S;

  $("hbNum").textContent = delay.toFixed(2);
  $("hbCap").innerHTML = T("hb_cap", { s: delay.toFixed(2) });
  $("hbNote").innerHTML = T("hb_note", { s: delay.toFixed(2) });
  $("pgRoman").setAttribute("transform", "translate(" + (60 + 880 * frac(d)).toFixed(1) + ",60)");
  $("stDist").innerHTML = fmt(dist) + "<small> km</small>";
  $("stDistD").textContent = "+" + fmt(dist - distAgo) + " km";
  $("stSpeed").innerHTML = fmt(sp) + "<small> km/h</small>";
  $("stSpeedD").textContent = fmt(sp - spAgo) + " km/h";
  $("stPct").innerHTML = (frac(d) * 100).toFixed(1) + "<small> %</small>";
  $("stDayLine").innerHTML = onStation(d)
    ? T("day_line_station", { d: Math.max(1, Math.ceil(d)) })
    : T("day_line", { d: Math.max(1, Math.ceil(d)) });

  var ms = Math.max(0, Date.now() - LAUNCH);
  var dd = Math.floor(ms / DAY), hh = Math.floor(ms % DAY / 3600000),
      mm = Math.floor(ms % 3600000 / 60000), ss = Math.floor(ms % 60000 / 1000);
  var p2 = function (n) { return (n < 10 ? "0" : "") + n; };
  $("stMet").textContent = dd + "d " + p2(hh) + ":" + p2(mm) + ":" + p2(ss);

  // route + ladder + speed live bits
  routeTick(d); ladderTick(d); speedTick(d);
  $("cmpMoonX").textContent = (km(d) / MOONKM).toFixed(2) + "×";
  $("cmpEarthLaps").textContent = (km(d) / 40075).toFixed(1) + "×";
  $("nxDays").textContent = onStation(d)
    ? Math.max(0, Math.round(d - PLAN.arrive)) + ""
    : Math.max(0, Math.round(CRUISE - d)) + "";
}

// ---------- 1 route ----------
var rtPlan = $("rtPlan"), rtDone = $("rtDone"), RTLEN = rtPlan.getTotalLength();
rtDone.style.strokeDasharray = RTLEN + " " + RTLEN;
(function () {
  var g = $("rtStars");
  for (var i = 0; i < 70; i++) {
    makeEl("circle", { cx: (Math.random() * 1000).toFixed(1), cy: (Math.random() * 330).toFixed(1),
      r: (0.4 + Math.random() * 0.8).toFixed(2), fill: "#dfe7ff", opacity: (0.12 + Math.random() * 0.5).toFixed(2) }, g);
  }
})();
function rtBuildTicks() {
  var tks = $("rtTicks"); tks.innerHTML = "";
  [[0, "0"], [MOONKM, T("rt_moon")], [L2KM, T("rt_l2")]].forEach(function (m) {
    var x = 110 + 840 * (m[0] / L2KM);
    makeEl("line", { x1: x, x2: x, y1: 354, y2: 366, stroke: "#94a1c7", "stroke-width": 1.3 }, tks);
    var t = makeEl("text", { x: x, y: 390, "text-anchor": m[0] === 0 ? "start" : (m[0] === L2KM ? "end" : "middle"), "class": "sl" }, tks);
    t.textContent = m[1];
  });
}
function routeTick(d) {
  var p = frac(d);
  var pt = rtPlan.getPointAtLength(RTLEN * p);
  $("rtCraft").setAttribute("transform", "translate(" + pt.x.toFixed(1) + "," + pt.y.toFixed(1) + ")");
  rtDone.style.strokeDashoffset = RTLEN * (1 - p);
  var th = (d / 27.32) * Math.PI * 2 - 0.7;
  $("rtMoon").setAttribute("cx", (110 + 215 * Math.cos(th)).toFixed(1));
  $("rtMoon").setAttribute("cy", (200 + 215 * Math.sin(th)).toFixed(1));
}

// ---------- 2 first 91 minutes ----------
// Horizontal timeline on wide screens; vertical (line on the left, labels to
// the right) on phones, where the horizontal labels would overlap.
var LNEV = [0, 7, 31, 70, 83];
function lnPt(min) {
  if (MOB) return { x: 80, y: 60 + 660 * (min / 91) };
  return { x: 70 + 860 * (min / 91), y: 150 };
}
function lnBuild() {
  var svg = $("lnSvg"), base = $("lnBase");
  if (MOB) {
    svg.setAttribute("viewBox", "0 0 500 780");
    base.setAttribute("x1", 80); base.setAttribute("y1", 60);
    base.setAttribute("x2", 80); base.setAttribute("y2", 720);
  } else {
    svg.setAttribute("viewBox", "0 0 1000 250");
    base.setAttribute("x1", 70); base.setAttribute("y1", 150);
    base.setAttribute("x2", 930); base.setAttribute("y2", 150);
  }
  var g = $("lnEvents"); g.innerHTML = "";
  LNEV.forEach(function (mn, i) {
    var ev = [mn, T("ln" + (i + 1) + "_n"), T("ln" + (i + 1) + "_s")];
    var p = lnPt(ev[0]);
    var grp;
    if (MOB) {
      makeEl("line", { x1: p.x, x2: p.x + 24, y1: p.y, y2: p.y, stroke: "#3a4877", "stroke-width": 1.4 }, g);
      grp = makeEl("g", { "class": "lnev", id: "lnev" + i, opacity: 0.35 }, g);
      makeEl("circle", { cx: p.x, cy: p.y, r: 6, fill: "#ffb454" }, grp);
      var m1 = makeEl("text", { x: p.x + 34, y: p.y + 1, "text-anchor": "start", "class": "sl sl-strong" }, grp);
      m1.textContent = "T+" + ev[0] + " min — " + ev[1];
      var m2 = makeEl("text", { x: p.x + 34, y: p.y + 25, "text-anchor": "start", "class": "sl" }, grp);
      m2.textContent = ev[2];
    } else {
      var up = i % 2 === 0;
      makeEl("line", { x1: p.x, x2: p.x, y1: 150, y2: up ? 108 : 192, stroke: "#3a4877", "stroke-width": 1.4 }, g);
      grp = makeEl("g", { "class": "lnev", id: "lnev" + i, opacity: 0.35 }, g);
      makeEl("circle", { cx: p.x, cy: 150, r: 5, fill: "#ffb454" }, grp);
      var t1 = makeEl("text", { x: p.x, y: up ? 92 : 216, "text-anchor": "middle", "class": "sl sl-strong" }, grp);
      t1.textContent = "T+" + ev[0] + " min — " + ev[1];
      var t2 = makeEl("text", { x: p.x, y: up ? 70 : 238, "text-anchor": "middle", "class": "sl" }, grp);
      t2.textContent = ev[2];
    }
  });
}
function lnSet(p) { // p: 0..1 over 91 min
  var m = p * 91;
  var pt = lnPt(m);
  $("lnMarker").setAttribute("transform", "translate(" + pt.x.toFixed(1) + "," + pt.y.toFixed(1) + ")");
  LNEV.forEach(function (mn, i) {
    $("lnev" + i).setAttribute("opacity", m >= mn - 0.01 ? 1 : 0.35);
  });
}
$("lnPlay").addEventListener("click", function () {
  animate(6000, function (k) { lnSet(ease(k)); });
});

// ---------- 3 boosters ----------
var boCore = $("boCore"), boL = $("boL"), boR = $("boR");
var boLenC = boCore.getTotalLength(), boLenL = boL.getTotalLength(), boLenR = boR.getTotalLength();
function boSet(p) {
  var e = ease(p);
  var pc = boCore.getPointAtLength(boLenC * Math.min(1, e * 1.05));
  $("boCoreDot").setAttribute("transform", "translate(" + pc.x.toFixed(1) + "," + pc.y.toFixed(1) + ") rotate(32)");
  var start = 0.12; // boosters separate a moment in
  var pb = Math.max(0, (e - start) / (1 - start));
  var pl = boL.getPointAtLength(boLenL * pb);
  var pr = boR.getPointAtLength(boLenR * pb);
  $("boLDot").setAttribute("transform", "translate(" + pl.x.toFixed(1) + "," + pl.y.toFixed(1) + ")");
  $("boRDot").setAttribute("transform", "translate(" + pr.x.toFixed(1) + "," + pr.y.toFixed(1) + ")");
  var flames = document.querySelectorAll(".boFlame");
  for (var i = 0; i < flames.length; i++) {
    flames[i].setAttribute("opacity", (pb < 0.25 || pb > 0.82) ? 1 : 0.12);
  }
}
boSet(1);
$("boPlay").addEventListener("click", function () {
  animate(5200, function (k) { boSet(k); });
});

// ---------- 4b anatomy (NASA imagery + hotspot geometry) ----------
var PART_LINKS = {
  tel: "https://roman.gsfc.nasa.gov/interactive/parts/telescope/",
  wfi: "https://roman.gsfc.nasa.gov/interactive/parts/wfi/",
  cgi: null,
  sass: "https://roman.gsfc.nasa.gov/interactive/parts/sass/",
  oss: "https://roman.gsfc.nasa.gov/interactive/parts/oss/",
  com: "https://roman.gsfc.nasa.gov/interactive/parts/communications/"
};
var anatImg = $("anatImg"), anatStage = $("anatStage"), stageCap = $("stageCap");
var anatViewKey = "right", anatSel = null;
var PART_IDS = ["tel", "wfi", "cgi", "sass", "oss", "com"];
function anatViewObj() { for (var i = 0; i < ANAT.length; i++) if (ANAT[i].key === anatViewKey) return ANAT[i]; return ANAT[0]; }
function anatPartIn(view, s) { for (var i = 0; i < view.parts.length; i++) if (view.parts[i].s === s) return view.parts[i]; return null; }
function anatCap(html) { stageCap.innerHTML = html; }
function anatShow(uri) { if (anatImg.getAttribute("src") !== uri) anatImg.setAttribute("src", uri); }
function anatRefresh() {
  var v = anatViewObj();
  var sel = anatSel ? anatPartIn(v, anatSel) : null;
  if (sel) { anatShow(sel.hi); anatCap(T("an_cap_sel", { n: T("p_" + anatSel + "_name") })); }
  else { anatShow(v.main); anatCap(anatSel ? T("an_cap_notvis", { n: T("p_" + anatSel + "_name") }) : T("an_cap_default")); }
}
function anatBuildHotspots() {
  var olds = anatStage.querySelectorAll(".hot");
  for (var i = 0; i < olds.length; i++) olds[i].remove();
  var v = anatViewObj();
  v.parts.forEach(function (p) {
    p.rects.forEach(function (r) {
      var d = document.createElement("div");
      d.className = "hot";
      d.style.left = r.l + "%"; d.style.bottom = r.b + "%";
      d.style.width = r.w + "%"; d.style.height = r.h + "%";
      d.style.zIndex = r.z;
      d.setAttribute("title", T("p_" + p.s + "_name"));
      d.addEventListener("mouseenter", function () { anatShow(p.hi); anatCap("<b>" + T("p_" + p.s + "_name") + "</b>"); });
      d.addEventListener("mouseleave", anatRefresh);
      d.addEventListener("click", function () { anatSelect(p.s, false); });
      anatStage.appendChild(d);
    });
  });
}
function anatSetView(key) {
  anatViewKey = key;
  var btns = document.querySelectorAll(".viewbtn");
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("on", btns[i].getAttribute("data-view") === key);
  anatBuildHotspots();
  anatRefresh();
}
function anatSelect(s, fromChip) {
  if (fromChip && !anatPartIn(anatViewObj(), s)) {
    for (var i = 0; i < ANAT.length; i++) {
      if (anatPartIn(ANAT[i], s)) { anatViewKey = ANAT[i].key; break; }
    }
    var btns = document.querySelectorAll(".viewbtn");
    for (var j = 0; j < btns.length; j++) btns[j].classList.toggle("on", btns[j].getAttribute("data-view") === anatViewKey);
    anatBuildHotspots();
  }
  anatSel = s;
  PART_IDS.forEach(function (k) { $("chip_" + k).classList.toggle("on", k === s); });
  $("pdName").textContent = T("p_" + s + "_name");
  $("pdStat").textContent = T("p_" + s + "_stat");
  $("pdBlurb").textContent = T("p_" + s + "_blurb");
  $("pdLink").innerHTML = PART_LINKS[s]
    ? T("an_link", { u: PART_LINKS[s] })
    : "";
  anatRefresh();
}
(function () {
  var bar = $("viewbar");
  ANAT.forEach(function (v) {
    var b = document.createElement("button");
    b.className = "viewbtn";
    b.setAttribute("data-view", v.key);
    b.setAttribute("type", "button");
    var im = document.createElement("img");
    im.loading = "lazy"; im.decoding = "async";
    im.src = v.main; im.alt = v.label + " view";
    var sp = document.createElement("span");
    sp.textContent = T("view_" + v.key);
    b.appendChild(im); b.appendChild(sp);
    b.addEventListener("click", function () { anatSetView(v.key); });
    bar.appendChild(b);
  });
  PART_IDS.forEach(function (k) {
    $("chip_" + k).addEventListener("click", function () { anatSelect(k, true); });
    $("chip_" + k).textContent = T("p_" + k + "_name");
  });
})();

// ---------- 4 deployment board (NASA renders) ----------
// conf names the CONFIRMED flag that marks the item deployed ("always" =
// confirmed on launch day). Flip the flag up top; the board follows.
var DEPLOYS = [
  { k: "sass", view: "right", conf: "always", id: "d1" },
  { k: "sass", view: "right", conf: "always", id: "d2" },
  { k: "com",  view: "right", conf: "hga",    id: "d3" },
  { k: "tel",  view: "right", conf: "cover",  id: "d4" },
  { k: "cgi",  view: "left",  conf: "cgi",    id: "d5" }
];
function dpDone(it) { return it.conf === "always" || !!CONFIRMED[it.conf]; }
var dpCur = 0;
function dpFrame(viewKey, s) {
  var v = null;
  for (var i = 0; i < ANAT.length; i++) if (ANAT[i].key === viewKey) { v = ANAT[i]; break; }
  if (!v) v = ANAT[0];
  for (var j = 0; j < v.parts.length; j++) if (v.parts[j].s === s) return v.parts[j].hi;
  return v.main;
}
function dpShow(idx) {
  dpCur = idx;
  var it = DEPLOYS[idx];
  var btns = document.querySelectorAll(".dpitem");
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("on", i === idx);
  $("dpImg").setAttribute("src", dpFrame(it.view, it.k));
  var dpStatus = dpDone(it) ? T("dp_open")
    : (eDays() > PLAN.deployWindow ? T("dp_wait") : T("dp_exp", { w: T(it.id + "_w") }));
  $("dpCap").innerHTML = "<b>" + T(it.id + "_n") + "</b> — " + dpStatus;
}
function dpBuild() {
  var list = $("dpList"); list.innerHTML = "";
  DEPLOYS.forEach(function (it, i) {
    var b = document.createElement("button");
    b.className = "dpitem" + (dpDone(it) ? " done" : "");
    b.setAttribute("type", "button");
    b.innerHTML = "<span class=\"dot\"></span><span class=\"dtxt\"><b>" + T(it.id + "_n") + "</b><small>" +
      T(it.id + "_w") + " — " + (dpDone(it) ? T("dp_done") : T("dp_up")) + "</small><em>" + T(it.id + "_x") + "</em></span>";
    b.addEventListener("click", function () { dpShow(i); });
    list.appendChild(b);
  });
}

// ---------- 5 DSN ----------
var DISHES = [
  { name: "Canberra",  lon: 149.1 },
  { name: "Madrid",    lon: -4.2 },
  { name: "Goldstone", lon: -116.9 }
];
var DCX = 340, DCY = 200, DR = 140;
function lonPt(lon, r) {
  var a = lon * Math.PI / 180;
  return { x: DCX + r * Math.sin(a), y: DCY - r * Math.cos(a) };
}
function antiSolarLon(t) {
  var dt = new Date(t);
  var h = dt.getUTCHours() + dt.getUTCMinutes() / 60;
  var sun = (12 - h) * 15;              // subsolar longitude, approx.
  var anti = sun + 180;
  while (anti > 180) anti -= 360;
  while (anti < -180) anti += 360;
  return anti;
}
function angDist(a, b) {
  var d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
function bestDish(t) {
  var anti = antiSolarLon(t), bi = 0, bd = 1e9;
  DISHES.forEach(function (D, i) {
    var d = angDist(D.lon, anti);
    if (d < bd) { bd = d; bi = i; }
  });
  return bi;
}
(function () {
  var g = $("dsnDishes");
  DISHES.forEach(function (D, i) {
    var p = lonPt(D.lon, DR);
    var grp = makeEl("g", { id: "dish" + i }, g);
    makeEl("circle", { cx: p.x, cy: p.y, r: 7, fill: "#0c1329", stroke: "#94a1c7", "stroke-width": 2 }, grp);
    var lp = lonPt(D.lon, DR + 34);
    var t = makeEl("text", { x: lp.x, y: lp.y, "text-anchor": "middle", "class": "sl" }, grp);
    t.textContent = D.name;
  });
})();
function dsnTick() {
  var now = Date.now();
  var anti = antiSolarLon(now);
  // night half faces the anti-solar longitude
  $("dsnNight").setAttribute("transform", "rotate(" + (anti - 90) + " " + DCX + " " + DCY + ")");
  // sun arrow on the solar side
  var sunLon = anti - 180;
  var sp1 = lonPt(sunLon, DR + 66), sp2 = lonPt(sunLon, DR + 22);
  var g = $("dsnSunArrow"); g.innerHTML = "";
  makeEl("line", { x1: sp1.x, y1: sp1.y, x2: sp2.x, y2: sp2.y, stroke: "#ffdf9e", "stroke-width": 2 }, g);
  var st = makeEl("text", { x: sp1.x, y: sp1.y - 8, "text-anchor": "middle", "class": "sl" }, g);
  st.textContent = T("w_sun");
  // Roman sits anti-solar
  var rp = lonPt(anti, DR + 118);
  $("dsnRoman").setAttribute("transform", "translate(" + rp.x.toFixed(1) + "," + rp.y.toFixed(1) + ")");
  // best dish + beam
  var bi = bestDish(now);
  DISHES.forEach(function (D, i) {
    var c = $("dish" + i).querySelector("circle");
    c.setAttribute("stroke", i === bi ? "#ffb454" : "#94a1c7");
    c.setAttribute("stroke-width", i === bi ? 3 : 2);
    c.setAttribute("fill", i === bi ? "#2a2008" : "#0c1329");
  });
  var bp = lonPt(DISHES[bi].lon, DR);
  var beam = $("dsnBeam");
  beam.setAttribute("x1", bp.x); beam.setAttribute("y1", bp.y);
  beam.setAttribute("x2", rp.x); beam.setAttribute("y2", rp.y);
  $("dsnNow").textContent = DISHES[bi].name;
  // next handover: step forward until the best dish changes
  var nxt = null, who = bi;
  for (var m = 5; m <= 1440; m += 5) {
    var b2 = bestDish(now + m * 60000);
    if (b2 !== bi) { nxt = m; who = b2; break; }
  }
  if (nxt !== null) {
    var hh = Math.floor(nxt / 60), mm = nxt % 60;
    $("dsnNext").textContent = T("ds_next", { n: DISHES[who].name, h: hh, m: (mm < 10 ? "0" : "") + mm });
    $("dsnCaption").textContent = T("ds_cap_hand", { a: DISHES[bi].name, b: DISHES[who].name });
  } else {
    $("dsnNext").textContent = "—";
    $("dsnCaption").textContent = T("ds_cap_solo", { a: DISHES[bi].name });
  }
}

// ---------- 6 ladder ----------
// True-to-scale linear strip, 0 .. 1.5M km: the familiar orbits crowd the left
// edge — that compression is the point of the picture.
function ldX(kmv) { return 70 + 860 * (Math.min(kmv, L2KM) / L2KM); }
function ldBuildRungs() {
  var g = $("ldRungs"); g.innerHTML = "";
  [[400, "ISS"], [35786, T("hf_tv")], [MOONKM, T("hf_moon")], [L2KM, "L2"]].forEach(function (r, i) {
    var x = ldX(r[0]);
    var row2 = i % 2 === 1; // ISS and TV satellites sit almost on top of each other: alternate rows
    makeEl("line", { x1: x, x2: x, y1: 118, y2: row2 ? 196 : 142, stroke: "#94a1c7", "stroke-width": 1.4, opacity: row2 ? 0.55 : 1 }, g);
    var anchor = i === 3 ? "end" : (i === 2 ? "middle" : "start");
    var t = makeEl("text", { x: i === 3 ? x : x + 2, y: row2 ? 208 : 172, "text-anchor": anchor, "class": "sl sl-strong" }, g);
    t.textContent = r[1] + (MOB ? "" : " · " + fmt(r[0]) + " km");
  });
}
function ladderTick(d) {
  var dist = Math.max(0, km(d));
  $("ldCraft").setAttribute("transform", "translate(" + ldX(dist).toFixed(1) + ",130)");
  $("ldGeoX").textContent = (dist / 35786).toFixed(1) + "×";
  $("ldRemain").textContent = fmt(Math.max(0, L2KM - dist));
}

// ---------- 7 speed ----------
var SPX0 = 70, SPX1 = 930, SPY0 = 282, SPY1 = 60, SPVMAX = 8000;
function spX(d) { return SPX0 + (SPX1 - SPX0) * (d / CRUISE); }
function spY(v) { return SPY0 - (SPY0 - SPY1) * (Math.min(v, SPVMAX) / SPVMAX); }
function spPts(from, to) {
  var pts = [], t = from;
  while (t < to) {
    pts.push(spX(t).toFixed(1) + "," + spY(kmh(t)).toFixed(1));
    t += (t < 2 ? 0.01 : 0.5);         // fine steps through the launch spike
  }
  pts.push(spX(to).toFixed(1) + "," + spY(kmh(to)).toFixed(1));
  return pts.join(" ");
}
function spBuild() {
  var g = $("spGrid"), i; g.innerHTML = "";
  for (i = 0; i <= 4; i++) {
    var v = i * 2000, y = spY(v);
    makeEl("line", { x1: SPX0, x2: SPX1, y1: y, y2: y, stroke: "#20294b", "stroke-width": 1 }, g);
    var t = makeEl("text", { x: SPX0 - 8, y: y + 5, "text-anchor": "end", "class": "sl" }, g);
    // compact "8k" labels on phones — the full numbers clip off the left edge
    t.textContent = MOB ? (v === 0 ? "0" : (v / 1000) + "k") : fmt(v);
  }
  var unit = makeEl("text", { x: SPX0 - 8, y: spY(8000) + 24, "text-anchor": "end", "class": "sl" }, g);
  unit.textContent = T("sp_unit");
  for (i = 0; i <= 90; i += (MOB ? 30 : 15)) {
    var x = spX(i);
    makeEl("line", { x1: x, x2: x, y1: SPY0, y2: SPY0 + 6, stroke: "#94a1c7", "stroke-width": 1.2 }, g);
    var tt = makeEl("text", { x: x, y: SPY0 + 27, "text-anchor": "middle", "class": "sl" }, g);
    tt.textContent = i;
  }
  var ax = makeEl("text", { x: (SPX0 + SPX1) / 2, y: SPY0 + 52, "text-anchor": "middle", "class": "sl" }, g);
  ax.textContent = T("sp_axis");
  $("spCurve").setAttribute("points", spPts(0, 90));
  var yj = spY(900);
  $("spJet").setAttribute("y1", yj); $("spJet").setAttribute("y2", yj);
  $("spJetLbl").setAttribute("y", yj - 8);
  $("spEndDot").setAttribute("cx", spX(90).toFixed(1));
  $("spEndDot").setAttribute("cy", spY(kmh(90)).toFixed(1));
  makeEl("line", { x1: 86, y1: 63, x2: 124, y2: 80, stroke: "#3a4877", "stroke-width": 1.2 }, g);
  var pk = makeEl("text", { x: 128, y: 85, "class": "sl" }, g);
  pk.textContent = T("sp_peak");
  $("spJetLbl").textContent = T("sp_jet");
  $("spEndLbl").textContent = T("sp_end");
  $("spTodayLbl").textContent = T("sp_today");
}
function speedTick(d) {
  var dd = Math.min(d, CRUISE);
  $("spCurveDone").setAttribute("points", spPts(0, dd));
  var dx = spX(dd), dy = spY(kmh(dd));
  $("spDot").setAttribute("transform", "translate(" + dx.toFixed(1) + "," + dy.toFixed(1) + ")");
  $("spToday").setAttribute("x1", dx.toFixed(1));
  $("spToday").setAttribute("x2", dx.toFixed(1));
  $("spTodayLbl").setAttribute("x", dx.toFixed(1));
  var lbl = $("spNowLbl");
  lbl.textContent = T("sp_now", { v: fmt(kmh(dd)) });
  lbl.setAttribute("x", Math.min(dx + 14, 750).toFixed(1));
  lbl.setAttribute("y", Math.max(dy - 14, 74).toFixed(1));
  $("spJetX").textContent = (kmh(dd) / 900).toFixed(1) + "×";
}

// ---------- 8 focal plane ----------
var FP_LIT = 0;
(function () {
  var g = $("fpTiles");
  var w = 86, h = 86, gap = 12, cols = 6, rows = 3;
  var x0 = 500 - (cols * w + (cols - 1) * gap) / 2;
  var y0 = 96;
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var arc = Math.pow(c - 2.5, 2) * 2.4;
      makeEl("rect", {
        id: "fp" + (r * cols + c),
        x: x0 + c * (w + gap), y: y0 + r * (h + gap) + arc,
        width: w, height: h, rx: 7,
        fill: "#182448", stroke: "#3a4877", "stroke-width": 1.6
      }, g);
    }
  }
})();
function fpSet(n) {
  FP_LIT = n;
  for (var i = 0; i < 18; i++) {
    var el = $("fp" + i);
    var on = i < n;
    el.setAttribute("fill", on ? "#4a3410" : "#182448");
    el.setAttribute("stroke", on ? "#ffb454" : "#3a4877");
  }
  $("fpCount").textContent = T("fp_count", { n: n, mp: Math.round(n * 300 / 18) });
}
$("fpPlay").addEventListener("click", function () {
  animate(3400, function (k) { fpSet(Math.round(ease(k) * 18)); });
});

// ---------- 9 next / halo ----------
var nxHalo = $("nxHalo"), NXLEN = nxHalo.getTotalLength();
nxHalo.style.strokeDasharray = NXLEN + " " + NXLEN;
function nxSet(p) {
  var e = ease(p);
  nxHalo.style.strokeDashoffset = NXLEN * (1 - e);
  var a = e * Math.PI * 1.85;   // ellipse stroke starts at (cx+rx, cy), sweeps downward
  var x = 790 + 70 * Math.cos(a), y = 170 + 120 * Math.sin(a);
  $("nxCraft").setAttribute("transform", "translate(" + x.toFixed(1) + "," + y.toFixed(1) + ")");
}
nxSet(1);
$("nxPlay").addEventListener("click", function () {
  animate(3600, function (k) { nxSet(k); });
});

// ---------- auto-play modules once, when scrolled into view ----------
if (!reduced && "IntersectionObserver" in window) {
  var played = {};
  var autos = { launch: function () { animate(6000, function (k) { lnSet(ease(k)); }); },
                boosters: function () { animate(5200, function (k) { boSet(k); }); },
                camera: function () { animate(3400, function (k) { fpSet(Math.round(ease(k) * 18)); }); },
                next: function () { animate(3600, function (k) { nxSet(k); }); } };
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting && !played[en.target.id] && autos[en.target.id]) {
        played[en.target.id] = true;
        autos[en.target.id]();
      }
    });
  }, { threshold: 0.45 });
  ["launch", "boosters", "camera", "next"].forEach(function (id) { io.observe($(id)); });
} else {
  fpSet(18);
}

// ---------- radio ping, real-time ----------
(function () {
  var PGX0 = 60, PGY = 60;
  var pgPulse = $("pgPulse"), pgRingE = $("pgRingE"), pgRingR = $("pgRingR");
  function ring(el, k) {
    el.setAttribute("r", 4 + 20 * k);
    el.setAttribute("opacity", ((1 - k) * 0.9).toFixed(2));
  }
  if (reduced) { pgPulse.setAttribute("opacity", 0); return; }
  var pgStart = null;
  function pingLoop(ts) {
    if (pgStart === null && ts) pgStart = ts;
    var d = eDays(), f = frac(d);
    var xr = PGX0 + 880 * f;
    var oneWay = Math.max(120, km(d) / C_KM_S * 1000);   // ms, one way — the real value
    var PAUSE = 850;
    var cycle = oneWay * 2 + PAUSE * 2;
    var t = ((ts || 0) - (pgStart || 0)) % cycle;
    var vis = 0, x = PGX0, dir = 1;
    pgRingE.setAttribute("opacity", 0);
    pgRingR.setAttribute("opacity", 0);
    if (t < oneWay) {
      vis = 1; dir = 1; x = PGX0 + (xr - PGX0) * (t / oneWay);
    } else if (t < oneWay + PAUSE) {
      var k1 = (t - oneWay) / 420; if (k1 < 1) ring(pgRingR, k1);
    } else if (t < oneWay * 2 + PAUSE) {
      vis = 1; dir = -1;
      var k = (t - oneWay - PAUSE) / oneWay;
      x = xr - (xr - PGX0) * k;
    } else {
      var k2 = (t - oneWay * 2 - PAUSE) / 420; if (k2 < 1) ring(pgRingE, k2);
    }
    pgPulse.setAttribute("opacity", vis);
    pgPulse.setAttribute("transform", "translate(" + x.toFixed(1) + "," + PGY + ") scale(" + dir + ",1)");
    requestAnimationFrame(pingLoop);
  }
  pingLoop(0);
})();

// ---------- stage switching ----------
// Re-applied every few minutes so a tab left open crosses stage boundaries
// on its own; the accordion is only steered once, at boot, so it never
// fights the reader.
function setChip(sectionId, text, cls) {
  var c = document.querySelector("#" + sectionId + " .chip");
  if (!c) return;
  c.textContent = text;
  c.className = "chip" + (cls ? " " + cls : "");
}
function applyStage() {
  var d = eDays();
  var station = onStation(d);
  if (station) {
    setChip("route", T("chip_arrived"), "done");
    setChip("next", T("chip_arrived"), "done");
    var sp = document.querySelector('#next [data-i="nx_c1"]');
    if (sp) sp.innerHTML = T("nx_c1_arr");
  }
  if (DEPLOYS.every(dpDone)) setChip("deploys", T("chip_complete"), "done");
  if (CONFIRMED.wfiActive) setChip("camera", T("cam_on"), "live");
  else if (d >= PLAN.camWake) setChip("camera", T("cam_soon"), "");
  if (CONFIRMED.wfiActive) fpSet(18);
}
function applyStageBoot() {
  // open the roadmap phase we are actually in (phase windows in mission days)
  var d = eDays();
  var ph = d < 7 ? 0 : d < 35 ? 1 : d < 84 ? 2 : d < 97 ? 3 : 4;
  document.querySelectorAll("#next .steps details").forEach(function (el, i) {
    if (i === ph) el.setAttribute("open", "");
    else el.removeAttribute("open");
  });
}

// ---------- boot (was applyLang in the monolith) ----------
fpSet(0);
rtBuildTicks(); lnBuild(); lnSet(1); ldBuildRungs(); spBuild();
dpBuild(); dpShow(0);
anatSetView("right");
anatSelect("tel", false);
dsnTick();
setInterval(dsnTick, 30000);
applyStageBoot();
applyStage();
setInterval(applyStage, 600000);
tickHero();
setInterval(tickHero, 1000);

// relayout the responsive SVGs when crossing the phone breakpoint
if (mobMQ.addEventListener) {
  mobMQ.addEventListener("change", function (e) {
    MOB = e.matches;
    lnBuild(); lnSet(1); ldBuildRungs(); spBuild(); tickHero();
  });
}

// warm the render cache so hover/view swaps don't flicker on first use
// (the images were inline data URIs in the monolith, so swaps were instant)
if ("requestIdleCallback" in window) {
  requestIdleCallback(function () {
    ANAT.forEach(function (v) {
      new Image().src = v.main;
      v.parts.forEach(function (p) { new Image().src = p.hi; });
    });
  });
}
