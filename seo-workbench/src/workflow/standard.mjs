import { readFileSync, writeFileSync } from "node:fs";

const standardUrl = new URL("../../workflows/seo-standard.json", import.meta.url);

export function loadStandard() {
  return JSON.parse(readFileSync(standardUrl, "utf8"));
}

export let STANDARD = loadStandard();

export function reloadStandard() {
  STANDARD = loadStandard();
  return STANDARD;
}

export function saveStandard(nextStandard) {
  if (!nextStandard || typeof nextStandard !== "object") {
    throw new Error("标准配置必须是一个 JSON 对象。");
  }

  if (!nextStandard.positioning?.defaultProject) {
    throw new Error("标准配置缺少 positioning.defaultProject。");
  }

  if (!Array.isArray(nextStandard.sites) || !nextStandard.sites.length) {
    throw new Error("标准配置缺少 sites 列表。");
  }

  if (!nextStandard.signals || !nextStandard.scoring || !nextStandard.references) {
    throw new Error("标准配置缺少 signals、scoring 或 references。");
  }

  STANDARD = nextStandard;
  writeFileSync(standardUrl, `${JSON.stringify(STANDARD, null, 2)}\n`, "utf8");
  return STANDARD;
}

export function getDefaultProject() {
  return STANDARD.positioning.defaultProject;
}

export const DEFAULT_PROJECT = STANDARD.positioning.defaultProject;

export const SAMPLE_KEYWORDS = [
  {
    keyword: "how to vape properly",
    volume: 2900,
    kd: 10,
    intent: "informational",
    url: "",
  },
  {
    keyword: "how to vape",
    volume: 4400,
    kd: 22,
    intent: "informational",
    url: "",
  },
  {
    keyword: "disposable vapes",
    volume: 22200,
    kd: 47,
    intent: "commercial, transactional",
    url: "/collections/disposable-vapes",
  },
  {
    keyword: "best disposable vapes",
    volume: 14800,
    kd: 39,
    intent: "commercial",
    url: "",
  },
  {
    keyword: "vape flavours",
    volume: 8100,
    kd: 45,
    intent: "informational, commercial",
    url: "",
  },
  {
    keyword: "nicotine free disposable vapes",
    volume: 5400,
    kd: 32,
    intent: "commercial, informational",
    url: "",
  },
  {
    keyword: "are disposable vapes safe",
    volume: 2400,
    kd: 28,
    intent: "informational",
    url: "",
  },
  {
    keyword: "rechargeable disposable vape",
    volume: 3600,
    kd: 31,
    intent: "commercial",
    url: "",
  },
  {
    keyword: "vape pen vs disposable vape",
    volume: 1200,
    kd: 18,
    intent: "commercial, informational",
    url: "",
  },
  {
    keyword: "how to dispose of vape batteries",
    volume: 700,
    kd: 12,
    intent: "informational",
    url: "",
  },
];
