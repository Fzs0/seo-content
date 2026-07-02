import { STANDARD } from "./standard.mjs";
import { hasAny } from "./utils.mjs";

const PROJECT_TERM_STOPWORDS = new Set([
  "about",
  "all",
  "article",
  "articles",
  "blog",
  "blogs",
  "category",
  "categories",
  "collection",
  "collections",
  "contact",
  "guide",
  "guides",
  "home",
  "page",
  "pages",
  "post",
  "posts",
  "product",
  "products",
  "shop",
  "store",
]);

function projectCoreTerms(project = {}) {
  const explicitTerms = String(project.coreProducts || "")
    .split(/[\n,;，；/]+/)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length >= 3);

  const pageTerms = String(project.mainPages || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !PROJECT_TERM_STOPWORDS.has(term));

  return [...new Set([...explicitTerms, ...pageTerms])];
}

export function classifyKeyword(rawKeyword, rawIntent = "", project = {}) {
  const keyword = String(rawKeyword || "").toLowerCase();
  const intent = String(rawIntent || "").toLowerCase();
  const signals = STANDARD.signals;
  const projectTerms = projectCoreTerms(project);

  const hasRisk = hasAny(keyword, signals.risk);
  const hasCore = hasAny(keyword, signals.coreProduct) || hasAny(keyword, projectTerms);
  const isTransactional = intent.includes("transactional") || hasAny(keyword, signals.transaction);
  const isCommercial = intent.includes("commercial");
  const isComparison = hasAny(keyword, signals.comparison);
  const isScenario = hasAny(keyword, signals.scenario);
  const isKnowledge = intent.includes("informational") || hasAny(keyword, signals.knowledge);
  const isMainBlog =
    hasCore &&
    isKnowledge &&
    !hasAny(keyword, signals.mainBlogExclusions) &&
    (hasAny(keyword, ["how to", "properly", "guide", "choose"]) || isCommercial);

  if (hasRisk) {
    return {
      assignedSite: "暂不做",
      pageType: "风险词池",
      reason: "涉及合规、未成年人、本地敏感或平台不适合承接的意图，先不进入内容生产。",
      intentBucket: "Risk",
    };
  }

  if (isTransactional && hasCore && !isComparison) {
    return {
      assignedSite: "主站-集合页",
      pageType: "集合页 / 产品列表页",
      reason: "购买动作明显，优先给主站承接转化，不让博客截流。",
      intentBucket: "Transactional",
    };
  }

  if (isComparison && hasCore && (isCommercial || keyword.includes("best"))) {
    return {
      assignedSite: "主站-博客",
      pageType: "商业前教育文章 / Listicle",
      reason: "比较和榜单词离购买很近，适合主站博客写内容后导向集合页。",
      intentBucket: "Commercial Investigation",
    };
  }

  if (isMainBlog) {
    return {
      assignedSite: "主站-博客",
      pageType: "主站教程文章",
      reason: "信息需求明确，同时与产品使用和购买决策相邻，主站博客可以承接。",
      intentBucket: "Informational + Buyer Adjacent",
    };
  }

  if (isComparison) {
    return {
      assignedSite: "博客C-对比评测",
      pageType: "对比 / 评测 / 替代方案文章",
      reason: "适合用第三方视角做比较，再把合适流量导回主站。",
      intentBucket: "Comparison",
    };
  }

  if (isScenario) {
    return {
      assignedSite: "博客B-场景人群",
      pageType: "场景 / 人群 / 口味灵感文章",
      reason: "用户在找选择灵感，不急着购买，适合用场景内容养熟。",
      intentBucket: "Scenario",
    };
  }

  if (isKnowledge) {
    return {
      assignedSite: "博客A-知识教程",
      pageType: "知识教程 / FAQ 文章",
      reason: "偏知识和问题解决，适合作为知识资产与主站建立内链。",
      intentBucket: "Informational",
    };
  }

  return {
    assignedSite: "博客A-知识教程",
    pageType: "探索型文章",
    reason: "默认先进入低风险知识池，人工复核 SERP 后再决定是否升级到主站。",
    intentBucket: "Exploratory",
  };
}
