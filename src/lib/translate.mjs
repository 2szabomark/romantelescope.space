// Build-time translation: applies the language tables to the English body markup.
// This is the former client-side applyLang()/MAP logic, executed once per language
// at build time so every language ships as real static HTML.
import * as cheerio from "cheerio";
import BODY_EN from "../content/body.en.html?raw";
import staticHu from "../i18n/static.hu.json";
import staticDe from "../i18n/static.de.json";
import staticEs from "../i18n/static.es.json";
import staticZh from "../i18n/static.zh.json";
import runtimeEn from "../i18n/runtime.en.json";
import runtimeHu from "../i18n/runtime.hu.json";
import runtimeDe from "../i18n/runtime.de.json";
import runtimeEs from "../i18n/runtime.es.json";
import runtimeZh from "../i18n/runtime.zh.json";

const STATIC = { hu: staticHu, de: staticDe, es: staticEs, zh: staticZh };
export const RUNTIME = { en: runtimeEn, hu: runtimeHu, de: runtimeDe, es: runtimeEs, zh: runtimeZh };

export const LANGS = ["en", "hu", "de", "es", "zh"];
export const HTML_LANG = { en: "en", hu: "hu", de: "de", es: "es", zh: "zh-CN" };
export const LANG_HREF = { en: "/", hu: "/hu/", de: "/de/", es: "/es/", zh: "/zh/" };

// selector -> translation key (verbatim from the original page's MAP)
const MAP = [
  ["h1", "h1"], [".hero .tag", "tag"], ["#statusText", "pill_status"],
  [".stat:nth-child(1) .k", "k1"], [".stat:nth-child(2) .k", "k2"],
  [".stat:nth-child(3) .k", "k3"], [".stat:nth-child(4) .k", "k4"],
  ['nav a[href="#route"]', "nv1"], ['nav a[href="#launch"]', "nv2"], ['nav a[href="#boosters"]', "nv3"],
  ['nav a[href="#deploys"]', "nv4"], ['nav a[href="#anatomy"]', "nv5"], ['nav a[href="#listening"]', "nv6"],
  ['nav a[href="#howfar"]', "nv7"], ['nav a[href="#speed"]', "nv8"], ['nav a[href="#camera"]', "nv9"],
  ['nav a[href="#next"]', "nv10"], ['nav a[href="#socials"]', "nv11"],
  ["#route h2", "r_h2"], ["#route .chip", "chip_live"], ["#route .lead", "r_lead"], ["#route .howto", "r_howto"],
  ["#svgMoonOrbit", "r_moon"], ["#svgEarthRt", "w_earth"],
  ["#launch h2", "l_h2"], ["#launch .chip", "chip_done"], ["#launch .lead", "l_lead"],
  ["#lnPlay", "l_btn"], ["#launch .btnnote", "l_note"],
  ["#boosters h2", "b_h2"], ["#boosters .chip", "chip_done2"], ["#boosters .lead", "b_lead"],
  ["#boPlay", "b_btn"], ["#boosters .btnnote", "b_note"], ["#svgBoCore", "b_core"],
  ["#deploys h2", "dm_h2"], ["#deploys .chip", "chip_track"], ["#deploys .lead", "dm_lead"], ["#deploys .howto", "dm_howto"],
  ["#anatomy h2", "an_h2"], ["#anatomy .chip", "chip_inter"], ["#anatomy .lead", "an_lead"], ["#anatomy .howto", "an_howto"],
  ["#listening h2", "ds_h2"], ["#listening .chip", "chip_estl"], ["#listening .lead", "ds_lead"], ["#listening .howto", "ds_howto"],
  ["#svgDsnEarth", "ds_earth"],
  ["#howfar h2", "hf_h2"], ["#howfar .chip", "chip_live2"], ["#howfar .lead", "hf_lead"], ["#howfar .howto", "hf_howto"],
  ["#svgEarthLd", "w_earth"],
  ["#speed h2", "sp_h2"], ["#speed .chip", "chip_model"], ["#speed .lead", "sp_lead"], ["#speed .howto", "sp_howto"],
  ["#camera h2", "cam_h2"], ["#camera .chip", "chip_wakes"], ["#camera .lead", "cam_lead"],
  ["#fpPlay", "cam_btn"], ["#camera .btnnote", "cam_note"], ["#svgHubble", "cam_hub"],
  ["#next h2", "nx_h2"], ["#next .chip", "chip_up"], ["#next .lead", "nx_lead"],
  ["#nxPlay", "nx_btn"], ["#next .btnnote", "nx_note"], ["#next .howto", "nx_howto"],
  ["#svgShadow", "nx_shadow"], ["#svgEarthNx", "w_earth2"], ["#svgTb1", "nx_tb1"], ["#svgTb1w", "nx_tb1w"],
  ["#svgTb2", "nx_tb2"], ["#svgTb2w", "nx_tb2w"], ["#svgBrake", "nx_brake"], ["#svgArrive", "nx_arr"], ["#svgLap", "nx_lap"],
  ["#svgPingEarth", "w_earth3"], ["#svgPingL2", "hb_l2"],
  ["#socials h2", "so_h2"], ["#socials .lead", "so_lead"],
  [".soc a:nth-child(3) small", "so_flickr"], [".soc a:nth-child(4) small", "so_yt"],
  [".soc a:nth-child(5) small", "so_blog"], [".soc a:nth-child(6) small", "so_home"],
  ["footer p:nth-of-type(1)", "f_p1"], ["footer p:nth-of-type(2)", "f_p2"], ["footer p:nth-of-type(3)", "f_p3"],
];

export function renderBody(lang) {
  const $ = cheerio.load(BODY_EN, null, false);

  // mark the active language in the switcher
  $("a.langbtn").each(function () {
    if ($(this).attr("data-lang") === lang) $(this).addClass("on");
  });

  if (lang !== "en") {
    const tbl = STATIC[lang];
    const put = (sel, key) => {
      const el = $(sel).first();
      if (el.length && tbl[key] != null) el.html(tbl[key]);
    };
    for (const [sel, key] of MAP) put(sel, key);
    // roadmap accordion (was built dynamically in the original MAP)
    $("#next .steps details").each(function (pi) {
      put(`#next .steps details:nth-of-type(${pi + 1}) summary span:first-child`, `ph${pi + 1}_t`);
      put(`#next .steps details:nth-of-type(${pi + 1}) summary .when`, `ph${pi + 1}_w`);
      $(this).find(".sub li").each(function (si) {
        const base = `s${pi + 1}${String.fromCharCode(97 + si)}`;
        put(`#next .steps details:nth-of-type(${pi + 1}) .sub li:nth-of-type(${si + 1}) b`, `${base}_t`);
        put(`#next .steps details:nth-of-type(${pi + 1}) .sub li:nth-of-type(${si + 1}) span.x`, `${base}_x`);
      });
    });
    // [data-i] one-liners
    $("[data-i]").each(function () {
      const k = $(this).attr("data-i");
      if (tbl[k] != null) $(this).html(tbl[k]);
    });
  }
  return $.html();
}

export function pageMeta(lang) {
  const runtime = RUNTIME[lang];
  const EN_DESC = "Roman, step by step — live, self-explanatory visualizations of every stage of NASA's Roman Space Telescope journey from Earth to L2.";
  let desc = EN_DESC;
  if (lang !== "en" && STATIC[lang].tag) desc = STATIC[lang].tag.replace(/<[^>]*>/g, "");
  return { title: runtime.title, description: desc };
}
