import { STANDARD } from "./standard.mjs";
import { classifyKeyword } from "./classifier.mjs";
import { clamp, hasAny, makeId, toNumber } from "./utils.mjs";

export function scoreKeyword(keyword, project = {}) {
  const classification = classifyKeyword(keyword.keyword, keyword.intent || "", project);
  const volume = toNumber(keyword.volume);
  const kd = toNumber(keyword.kd);
  const intent = String(keyword.intent || "").toLowerCase();
  const text = String(keyword.keyword || "").toLowerCase();

  const demandScore = clamp(Math.round(Math.log10(volume + 1) * 6), 0, 20);
  const difficultyScore = clamp(Math.round(20 - kd * 0.23), 0, 20);
  const commercialScore = clamp(
    (intent.includes("transactional") ? 15 : 0) +
      (intent.includes("commercial") ? 11 : 0) +
      (hasAny(text, ["best", "vs", "review", "price", "buy", "shop"]) ? 4 : 0) +
      (classification.assignedSite === "主站-博客" ? 2 : 0),
    3,
    20,
  );
  const contentScore = clamp(
    (intent.includes("informational") ? 11 : 0) +
      (hasAny(text, ["how", "guide", "what", "best", "vs", "choose", "flavor", "flavour"]) ? 6 : 0) +
      (classification.pageType.includes("集合页") ? 4 : 0),
    5,
    20,
  );
  const siteFitScore = clamp(classification.assignedSite.startsWith("主站") ? 18 : 14, 0, 20);
  const riskPenalty =
    classification.assignedSite === "暂不做" ? 28 : hasAny(text, ["safe", "legal", "age"]) ? 8 : 0;
  const total = clamp(
    Math.round(((demandScore + difficultyScore + commercialScore + contentScore + siteFitScore - riskPenalty) / 92) * 100),
    0,
    STANDARD.scoring.maxScore,
  );
  const thresholds = STANDARD.scoring.thresholds;
  const priority =
    classification.assignedSite === "暂不做"
      ? "Hold"
      : total >= thresholds.P0
        ? "P0"
        : total >= thresholds.P1
          ? "P1"
          : total >= thresholds.P2
            ? "P2"
            : "P3";

  return {
    ...keyword,
    ...classification,
    volume,
    kd,
    scores: {
      demand: demandScore,
      difficulty: difficultyScore,
      commercial: commercialScore,
      content: contentScore,
      siteFit: siteFitScore,
      riskPenalty,
      total,
    },
    priority,
  };
}

export function enrichKeywords(keywords = [], project = {}) {
  return keywords.map((keyword, index) =>
    scoreKeyword(
      {
        ...keyword,
        id: keyword.id || makeId(keyword.keyword, index),
      },
      project,
    ),
  );
}
