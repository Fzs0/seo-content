import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..", "..");
const sourcePath =
  process.argv[2]?.trim() ||
  process.env.SEMRUSH_SOURCE_XLSX ||
  path.join(currentDir, "source.xlsx");
const outputDir = path.join(projectRoot, "outputs", "semrush_exdivo_allocation");
const outputPath = path.join(outputDir, "exdivo_keyword_allocation_result.xlsx");

const colors = {
  ink: "#122033",
  navy: "#17324D",
  blue: "#2F6B9A",
  teal: "#0F766E",
  mint: "#E7F6F1",
  sky: "#EAF3FA",
  sand: "#FFF4D8",
  rose: "#FDECEC",
  lilac: "#F1EDFF",
  gray: "#F6F7F9",
  border: "#D9E2EC",
  white: "#FFFFFF",
};

await fs.access(sourcePath).catch(() => {
  throw new Error(
    `找不到源 Excel：${sourcePath}。请运行 node work/semrush_exdivo_allocation/build_allocation.mjs <你的xlsx路径>，或设置 SEMRUSH_SOURCE_XLSX。`,
  );
});

const sourceBlob = await FileBlob.load(sourcePath);
const sourceWb = await SpreadsheetFile.importXlsx(sourceBlob);
const sourceSheet = sourceWb.worksheets.getItem("table");
const sourceValues = sourceSheet.getUsedRange(true).values;
const headers = sourceValues[0].map((v) => String(v ?? "").trim());
const sourceRows = sourceValues.slice(1).filter((row) => String(row[3] ?? "").trim());

const headerIndex = Object.fromEntries(headers.map((h, i) => [h.toLowerCase(), i]));
const cell = (row, name) => row[headerIndex[name]] ?? "";

const competitorBrands = [
  "elf bar",
  "lost mary",
  "geek bar",
  "juul",
  "vuse",
  "njoy",
  "hyde",
  "puff bar",
  "fume",
  "flum",
  "air bar",
  "esco bar",
  "espeibar",
  "randm",
  "raz",
  "mr fog",
  "kangvape",
  "smok",
  "vaporesso",
  "voopoo",
  "uwell",
  "caliburn",
  "suorin",
  "blu",
  "stiiizy",
  "breeze",
  "ignite",
  "posh",
  "dragbar",
  "myle",
  "novo",
  "lostmary",
  "geekbar",
];

const drugTerms = [
  "thc",
  "weed",
  "cannabis",
  "marijuana",
  "delta 8",
  "delta-8",
  "delta 9",
  "delta-9",
  "cbd",
  "dmt",
  "dry herb",
  "wax pen",
  "dab pen",
];

const underageTerms = [
  "teen",
  "teens",
  "kid",
  "kids",
  "school",
  "under 18",
  "minor",
  "minors",
  "youth",
  "children",
];

const healthLegalTerms = [
  "safe",
  "safer",
  "healthy",
  "health",
  "lungs",
  "lung",
  "cancer",
  "heart",
  "blood",
  "pregnant",
  "pregnancy",
  "side effect",
  "side effects",
  "addiction",
  "addictive",
  "quit smoking",
  "stop smoking",
  "legal",
  "law",
  "laws",
  "banned",
  "ban",
  "fda",
  "age",
  "asthma",
  "copd",
  "disease",
  "cough",
];

const transactionalTerms = [
  "buy",
  "shop",
  "online",
  "for sale",
  "price",
  "prices",
  "sale",
  "discount",
  "coupon",
  "cheap",
  "order",
  "store",
  "stores",
  "wholesale",
  "bulk",
  "supplier",
  "suppliers",
  "near me",
];

const commercialTerms = [
  "best",
  "top",
  "review",
  "reviews",
  "compare",
  "comparison",
  " vs ",
  "versus",
  "alternative",
  "alternatives",
  "brand",
  "brands",
  "rated",
  "popular",
];

const infoTerms = [
  "what",
  "how",
  "why",
  "guide",
  "meaning",
  "types",
  "different",
  "difference",
  "use",
  "using",
  "work",
  "works",
  "last",
  "long",
  "can",
  "do",
  "does",
  "charge",
  "recharge",
  "refill",
  "clean",
  "fix",
  "tutorial",
  "beginner",
  "beginners",
];

const scenarioTerms = [
  "for ",
  "with ",
  "without",
  "no nicotine",
  "nicotine free",
  "low nicotine",
  "high nicotine",
  "flavor",
  "flavors",
  "flavoured",
  "flavored",
  "travel",
  "airport",
  "airplane",
  "smokers",
  "discreet",
  "long lasting",
  "rechargeable",
  "refillable",
  "reusable",
];

const coreProductTerms = [
  "vape",
  "vapes",
  "vaping",
  "e-cig",
  "e cig",
  "e-cigarette",
  "e cigarette",
  "ecig",
  "disposable",
  "pod",
  "pods",
  "pod kit",
  "vapor cigarette",
  "electronic cigarette",
  "vape pen",
];

const hasAny = (text, terms) => terms.some((term) => text.includes(term));
const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;

function demandScore(volume) {
  if (volume >= 20000) return 20;
  if (volume >= 10000) return 18;
  if (volume >= 5000) return 16;
  if (volume >= 1000) return 13;
  if (volume >= 500) return 10;
  if (volume >= 100) return 7;
  if (volume > 0) return 4;
  return 1;
}

function difficultyScore(kd) {
  if (kd <= 15) return 15;
  if (kd <= 30) return 12;
  if (kd <= 45) return 9;
  if (kd <= 60) return 6;
  if (kd <= 75) return 3;
  return 1;
}

function detectCluster(text) {
  if (hasAny(text, drugTerms)) return "高风险/非主营";
  if (hasAny(text, healthLegalTerms) || hasAny(text, underageTerms)) return "合规科普";
  if (competitorBrands.some((brand) => text.includes(brand))) return "竞品/品牌词";
  if (text.includes("pod")) return "Pod Kit / Pod System";
  if (text.includes("disposable")) return "Disposable Vape";
  if (text.includes("flavor") || text.includes("flavoured") || text.includes("flavored")) return "Flavor / 口味";
  if (text.includes("nicotine")) return "Nicotine / 尼古丁";
  if (text.includes("refillable") || text.includes("reusable") || text.includes("rechargeable")) return "Reusable / Rechargeable";
  if (text.includes("e-cig") || text.includes("e cig") || text.includes("cigarette")) return "E-Cigarette";
  if (hasAny(text, commercialTerms)) return "对比评测";
  if (hasAny(text, infoTerms)) return "知识教程";
  if (hasAny(text, transactionalTerms)) return "购买交易";
  return "General Vape";
}

function classifyKeyword(keyword, semrushIntent, volume, kd) {
  const text = ` ${String(keyword).toLowerCase().replace(/\s+/g, " ").trim()} `;
  const intent = String(semrushIntent ?? "").toLowerCase();
  const cluster = detectCluster(text);
  const isRelevant = hasAny(text, coreProductTerms) || competitorBrands.some((brand) => text.includes(brand));
  const isDrug = hasAny(text, drugTerms);
  const isUnderage = hasAny(text, underageTerms);
  const isHealthLegal = hasAny(text, healthLegalTerms);
  const isCompetitor = competitorBrands.some((brand) => text.includes(brand));
  const isTransactional = intent.includes("transactional") || hasAny(text, transactionalTerms);
  const isCommercial = intent.includes("commercial") || hasAny(text, commercialTerms);
  const isInfo = intent.includes("informational") || hasAny(text, infoTerms);
  const isScenario = hasAny(text, scenarioTerms);
  const isComparison = hasAny(text, commercialTerms) || text.includes(" vs ") || text.includes(" versus ");
  const isQuestion = /(^|\s)(what|how|why|can|does|do|is|are|when|where|which)\b/.test(text);
  const shortCoreCategory = isRelevant && wordCount(text.trim()) <= 3 && !isQuestion && !isComparison && !isTransactional && !isScenario;

  let recommendedSite = "博客A-知识教程";
  let role = "内容词";
  let pageType = "知识/教程文章";
  let linkAllowed = "谨慎";
  let anchorType = "品牌词/自然句";
  let riskNote = "低风险：按常规内容质量和搜索意图校验";
  let intentNote = "先看 Google SERP：如果首页多数为产品集合页，改回主站；如果多数为教程/问答，保持博客。";
  let mainTarget = "/collections/disposable-vapes 或最接近的产品集合页";
  let titleAngle = titleFor(keyword, "博客A-知识教程");
  let businessValue = 10;
  let contentWritable = 12;
  let siteFit = 12;
  let riskDeduction = 4;

  if (!isRelevant) {
    recommendedSite = "暂不做";
    role = "弱相关词";
    pageType = "不建议建页";
    linkAllowed = "否";
    anchorType = "不导流";
    riskNote = "相关性弱：可能带来无效流量或偏离产品定位";
    intentNote = "除非人工确认与核心产品强相关，否则不要进入内容排期。";
    mainTarget = "无";
    titleAngle = "不进入内容生产";
    businessValue = 2;
    contentWritable = 3;
    siteFit = 2;
    riskDeduction = 16;
  }

  if (isDrug) {
    recommendedSite = "暂不做";
    role = "高风险/非主营词";
    pageType = "不建议建页";
    linkAllowed = "否";
    anchorType = "不导流";
    riskNote = "高风险：可能涉及 THC/CBD/大麻/药物或非主营品类，不建议用于主站导流";
    intentNote = "仅在确认合法资质、产品范围和地区法规后再考虑，否则删除。";
    mainTarget = "无";
    titleAngle = "不进入内容生产";
    businessValue = 1;
    contentWritable = 2;
    siteFit = 1;
    riskDeduction = 20;
  } else if (isUnderage) {
    recommendedSite = "博客A-知识教程";
    role = "合规科普词";
    pageType = "合规/年龄限制科普文章";
    linkAllowed = "否";
    anchorType = "不导流";
    riskNote = "高风险：涉及未成年人/年龄限制，只能做合规教育，不做商业转化";
    intentNote = "内容必须强调年龄限制与合法合规，避免任何购买引导。";
    mainTarget = "无商业内链";
    titleAngle = titleFor(keyword, recommendedSite);
    businessValue = 3;
    contentWritable = 9;
    siteFit = 7;
    riskDeduction = 18;
  } else if (isHealthLegal) {
    recommendedSite = "博客A-知识教程";
    role = "合规/YMYL科普词";
    pageType = "合规/健康风险科普文章";
    linkAllowed = "否";
    anchorType = "不导流";
    riskNote = "高风险：健康、戒烟、法律等 YMYL 主题，不写疗效承诺，不直接卖货";
    intentNote = "需要引用权威资料，语气中立；如果不能做到合规审核，暂缓。";
    mainTarget = "无商业内链";
    titleAngle = titleFor(keyword, recommendedSite);
    businessValue = 4;
    contentWritable = 10;
    siteFit = 8;
    riskDeduction = 15;
  } else if (isCompetitor && isComparison) {
    recommendedSite = "博客C-对比评测";
    role = "竞品对比词";
    pageType = "对比/替代/榜单文章";
    linkAllowed = "谨慎";
    anchorType = "自然句/品牌词/品类词";
    riskNote = "中风险：涉及竞品品牌，避免商标误导、贬低竞品和虚假对比";
    intentNote = "适合做客观对比或替代方案，但不要把竞品词直接做主站商业页。";
    mainTarget = "/collections/disposable-vapes 或对应替代产品集合页";
    titleAngle = titleFor(keyword, recommendedSite);
    businessValue = 14;
    contentWritable = 14;
    siteFit = 11;
    riskDeduction = 10;
  } else if (isCompetitor) {
    recommendedSite = "暂不做";
    role = "竞品品牌词";
    pageType = "人工确认后再决定";
    linkAllowed = "否";
    anchorType = "不导流";
    riskNote = "中高风险：纯竞品品牌词容易产生商标/相关性问题";
    intentNote = "只有带 alternative / vs / review / best 这类明确比较意图时，才考虑博客C。";
    mainTarget = "无";
    titleAngle = "人工确认是否可做客观对比";
    businessValue = 5;
    contentWritable = 7;
    siteFit = 4;
    riskDeduction = 14;
  } else if (isTransactional) {
    if (text.includes("near me")) {
      recommendedSite = "暂不做";
      role = "本地交易词";
      pageType = "除非有门店页，否则暂不做";
      linkAllowed = "否";
      anchorType = "不导流";
      riskNote = "匹配风险：near me 通常需要本地门店/地图结果，独立站难承接";
      intentNote = "如果未来有经销商/门店查询页，可改为主站门店页。";
      mainTarget = "门店/经销商页（若有）";
      titleAngle = "暂不进入博客生产";
      businessValue = 8;
      contentWritable = 4;
      siteFit = 5;
      riskDeduction = 12;
    } else {
      recommendedSite = "主站";
      role = "交易词";
      pageType = "产品集合页/分类页/购买页";
      linkAllowed = "不适用";
      anchorType = "主站页面自身承接";
      riskNote = "商业词：优先给主站，避免博客抢主站排名";
      intentNote = "SERP 如为商品列表/品牌站/电商集合页，就建主站页面；若 SERP 全是教程，再拆支持文章。";
      mainTarget = mainTargetFor(keyword);
      titleAngle = "主站商业页：标题围绕购买意图 + 品类 + 关键卖点";
      businessValue = 20;
      contentWritable = 7;
      siteFit = 15;
      riskDeduction = 4;
    }
  } else if (shortCoreCategory || (isRelevant && intent.includes("commercial") && !isQuestion && !isComparison)) {
    recommendedSite = "主站";
    role = "品类承接词";
    pageType = "品类页/集合页 + FAQ内容块";
    linkAllowed = "不适用";
    anchorType = "主站页面自身承接";
    riskNote = "核心品类词：主站优先，博客只做长尾解释，不直接抢同一词";
    intentNote = "如果 Google 首页产品页和指南混合，主站页要加 FAQ、选购指南、对比模块。";
    mainTarget = mainTargetFor(keyword);
    titleAngle = "主站品类页：用产品集合 + 选购说明承接";
    businessValue = isCommercial ? 18 : 16;
    contentWritable = 8;
    siteFit = 15;
    riskDeduction = 4;
  } else if (isComparison) {
    recommendedSite = "博客C-对比评测";
    role = "商业调查词";
    pageType = "Best/Top/Review/VS/替代方案文章";
    linkAllowed = "是";
    anchorType = "自然句/品类词/品牌词";
    riskNote = "中风险：榜单和评测必须真实、中立，避免夸大";
    intentNote = "这类词不直接给主站，先用博客C教育和比较，再导流到最相关集合页。";
    mainTarget = mainTargetFor(keyword);
    titleAngle = titleFor(keyword, recommendedSite);
    businessValue = 16;
    contentWritable = 15;
    siteFit = 13;
    riskDeduction = 6;
  } else if (isScenario) {
    recommendedSite = "博客B-场景人群";
    role = "场景/需求词";
    pageType = "场景解决方案/选购指南文章";
    linkAllowed = "是";
    anchorType = "自然句/品类词";
    riskNote = "低中风险：适合软性导流，但不要夸大效果或触碰健康疗效";
    intentNote = "围绕使用场景、口味、尼古丁需求、便携性等写，不和主站品类页抢词。";
    mainTarget = mainTargetFor(keyword);
    titleAngle = titleFor(keyword, recommendedSite);
    businessValue = 13;
    contentWritable = 14;
    siteFit = 13;
    riskDeduction = 5;
  } else if (isInfo) {
    recommendedSite = "博客A-知识教程";
    role = "知识/教程词";
    pageType = "百科/How-to/FAQ文章";
    linkAllowed = "谨慎";
    anchorType = "自然句/品牌词";
    riskNote = "低中风险：先满足信息意图，导流要克制";
    intentNote = "如果文章能自然回答下一步购买问题，再放 1 个主站内链；否则只做知识闭环。";
    mainTarget = mainTargetFor(keyword);
    titleAngle = titleFor(keyword, recommendedSite);
    businessValue = 9;
    contentWritable = 14;
    siteFit = 12;
    riskDeduction = 5;
  }

  const dScore = demandScore(volume);
  const kdScore = difficultyScore(kd);
  return {
    cluster,
    role,
    recommendedSite,
    pageType,
    titleAngle,
    mainTarget,
    linkAllowed,
    anchorType,
    riskNote,
    intentNote,
    demandScore: dScore,
    difficultyScore: kdScore,
    businessValue,
    contentWritable,
    siteFit,
    riskDeduction,
  };
}

function mainTargetFor(keyword) {
  const text = String(keyword).toLowerCase();
  if (text.includes("pod")) return "/collections/pod-kits";
  if (text.includes("flavor") || text.includes("flavored") || text.includes("flavoured")) return "/collections/flavored-disposable-vapes";
  if (text.includes("nicotine free") || text.includes("no nicotine")) return "/collections/nicotine-free-vapes";
  if (text.includes("refillable") || text.includes("reusable") || text.includes("rechargeable")) return "/collections/rechargeable-vapes";
  if (text.includes("e-cig") || text.includes("e cig") || text.includes("cigarette")) return "/collections/e-cigarettes";
  return "/collections/disposable-vapes";
}

function titleFor(keyword, site) {
  const kw = String(keyword).trim();
  if (site.includes("博客C")) return `Best angle: ${kw} - comparison, pros/cons, and which option fits different buyers`;
  if (site.includes("博客B")) return `Scenario angle: how to choose ${kw} based on use case, flavor, nicotine, and budget`;
  if (site.includes("博客A")) return `Guide angle: explain ${kw}, answer common questions, and avoid sales-first writing`;
  return `Commercial landing page angle for ${kw}`;
}

function safeNum(value) {
  const num = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(num) ? num : 0;
}

const resultHeaders = [
  "原始行号",
  "url",
  "关键词",
  "keyword type",
  "volume",
  "keyword difficulty",
  "Semrush intent",
  "主题簇",
  "关键词角色",
  "推荐站点",
  "人工确认站点",
  "最终站点",
  "推荐页面/文章类型",
  "博客标题方向/页面角度",
  "主站承接页/内链目标",
  "是否可导流主站",
  "推荐锚文本类型",
  "合规/竞争风险",
  "意图校验备注",
  "需求分(0-20)",
  "难度分(0-15)",
  "商业价值分(0-20)",
  "内容可写分(0-15)",
  "站点匹配分(0-15)",
  "风险扣分(0-20)",
  "总分(公式)",
  "优先级(公式)",
  "下一步动作(公式)",
  "原始title",
  "原始description",
];

const classified = sourceRows.map((row, idx) => {
  const keyword = String(cell(row, "keyword")).trim();
  const volume = safeNum(cell(row, "volume"));
  const kd = safeNum(cell(row, "keyword difficulty"));
  const semrushIntent = String(cell(row, "intent") ?? "").trim();
  const c = classifyKeyword(keyword, semrushIntent, volume, kd);
  return {
    raw: row,
    originalIndex: idx + 2,
    url: cell(row, "url"),
    title: cell(row, "title"),
    description: cell(row, "description"),
    keyword,
    keywordType: cell(row, "keyword type"),
    volume,
    kd,
    semrushIntent,
    ...c,
  };
});

function finalScore(item) {
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        ((item.demandScore + item.difficultyScore + item.businessValue + item.contentWritable + item.siteFit - item.riskDeduction) / 85) *
          100,
      ),
    ),
  );
}

for (const item of classified) item.score = finalScore(item);

const blogRows = classified
  .filter((item) => item.recommendedSite.startsWith("博客") && item.score >= 45)
  .sort((a, b) => b.score - a.score || b.volume - a.volume)
  .slice(0, 160);

const briefRows = blogRows.slice(0, 80);

const siteNames = ["主站", "博客A-知识教程", "博客B-场景人群", "博客C-对比评测", "暂不做"];
const priorityLabels = ["P0 本周做", "P1 近期做", "P2 备选", "P3 暂缓"];

const wb = Workbook.create();
const instructionSheet = wb.worksheets.add("使用说明");
const rulesSheet = wb.worksheets.add("分配规则");
const rawSheet = wb.worksheets.add("源数据");
const resultSheet = wb.worksheets.add("关键词分站结果");
const calendarSheet = wb.worksheets.add("内容日历P0P1");
const briefSheet = wb.worksheets.add("AI写作Brief");
const dashboardSheet = wb.worksheets.add("仪表盘");

for (const sheet of [instructionSheet, rulesSheet, rawSheet, resultSheet, calendarSheet, briefSheet, dashboardSheet]) {
  sheet.showGridLines = false;
}

writeInstructionSheet(instructionSheet);
writeRulesSheet(rulesSheet);
writeRawSheet(rawSheet);
writeResultSheet(resultSheet);
writeCalendarSheet(calendarSheet);
writeBriefSheet(briefSheet);
writeDashboardSheet(dashboardSheet);

await fs.mkdir(outputDir, { recursive: true });

for (const [sheetName, range] of [
  ["使用说明", "A1:H22"],
  ["分配规则", "A1:H12"],
  ["源数据", "A1:H18"],
  ["关键词分站结果", "A1:AD25"],
  ["内容日历P0P1", "A1:M25"],
  ["AI写作Brief", "A1:K20"],
  ["仪表盘", "A1:H24"],
]) {
  const preview = await wb.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(path.join(outputDir, `preview_${sheetName}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const errors = await wb.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
  maxChars: 4000,
});
console.log(errors.ndjson);

const dashboardInspect = await wb.inspect({
  kind: "region",
  sheetId: "仪表盘",
  range: "A1:H24",
  maxChars: 4000,
});
console.log(dashboardInspect.ndjson);

const output = await SpreadsheetFile.exportXlsx(wb);
await output.save(outputPath);
console.log(outputPath);

function writeInstructionSheet(sheet) {
  const rows = [
    ["Exdivo Semrush 关键词分站结果", "", "", "", "", "", "", ""],
    ["这份表做什么", "把 Semrush 导出的关键词分到：主站、博客A、博客B、博客C、暂不做，并给出分数、风险、页面类型和写作方向。", "", "", "", "", "", ""],
    ["使用步骤", "1. 先看“仪表盘”了解总量；2. 在“关键词分站结果”筛选 P0/P1；3. 人工确认 Google SERP 意图；4. 主站词建商业页，博客词进入内容日历；5. 写作时用“AI写作Brief”。", "", "", "", "", "", ""],
    ["人工确认站点", "如果你人工判断某个词应该改站点，在“关键词分站结果”的 K 列选择主站/博客A/博客B/博客C/暂不做，L 列会变成最终站点。", "", "", "", "", "", ""],
    ["主站原则", "交易词、品类词、购买词、价格词、可直接下单的词归主站，避免博客抢主站的商业排名。", "", "", "", "", "", ""],
    ["博客A", "负责知识教程：what/how/guide/FAQ/法律或健康风险科普。合规类内容默认不导流主站。", "", "", "", "", "", ""],
    ["博客B", "负责人群场景：口味、尼古丁、使用场景、选购问题、具体需求。可以软性导流到最相关集合页。", "", "", "", "", "", ""],
    ["博客C", "负责对比评测：best/top/review/vs/alternative/竞品替代。可导流，但必须客观、中立、避免商标误导。", "", "", "", "", "", ""],
    ["评分解释", "总分 = (需求分 + 难度分 + 商业价值分 + 内容可写分 + 站点匹配分 - 风险扣分) / 85 * 100。P0>=75，P1>=60，P2>=45。", "", "", "", "", "", ""],
    ["合规提醒", "Vape / nicotine 属于敏感和强监管品类。本表只做关键词和内容规划，不等于法律建议；涉及年龄、健康、戒烟、THC/CBD/大麻等词必须人工复核。", "", "", "", "", "", ""],
  ];
  sheet.getRangeByIndexes(0, 0, rows.length, rows[0].length).values = rows;
  sheet.getRange("A1:H1").merge();
  sheet.getRange("A1").format = { fill: colors.navy, font: { bold: true, color: colors.white, size: 16 } };
  sheet.getRange("A2:A10").format = { fill: colors.sky, font: { bold: true, color: colors.ink } };
  sheet.getRange("B2:H10").merge(true);
  sheet.getRange("A2:H10").format = { borders: { preset: "inside", style: "thin", color: colors.border }, wrapText: true };
  sheet.getRange("A1:H10").format.autofitRows();
  setWidths(sheet, { A: 18, B: 120, C: 5, D: 5, E: 5, F: 5, G: 5, H: 5 }, 25);
}

function writeRulesSheet(sheet) {
  const rows = [
    ["站点/桶", "负责的搜索意图", "典型关键词信号", "页面/内容形态", "导流规则", "不要承接", "示例", "备注"],
    ["主站", "交易/品类/购买", "buy, shop, online, price, sale, disposable vapes, pod kits", "分类页、集合页、产品页、FAQ模块", "自身承接，不需要外链导流", "what/how纯知识、竞品纯品牌词", "buy disposable vapes online", "主站吃商业词，博客不抢核心交易词"],
    ["博客A-知识教程", "信息/教程/FAQ/合规科普", "what, how, guide, meaning, legal, safe, age", "百科、教程、FAQ、合规说明", "普通知识词谨慎导流；健康/法律/年龄词不导流", "购买词、榜单评测词", "what are disposable vapes", "先解决信息需求，再考虑是否有自然内链"],
    ["博客B-场景人群", "场景/人群/问题解决", "for, flavor, nicotine free, rechargeable, beginner, travel", "场景选购指南、需求解决文章", "可用自然句导流到相关集合页", "纯交易词、竞品品牌词", "nicotine free disposable vapes", "适合从长尾流量反哺主站"],
    ["博客C-对比评测", "商业调查/比较/评测", "best, top, review, vs, alternative, brands", "榜单、评测、对比、替代方案", "可导流，但锚文本必须自然", "健康疗效承诺、虚假对比", "best disposable vapes", "适合临近购买前的流量"],
    ["暂不做", "弱相关/高风险/本地错配", "THC, CBD, weed, kids, school, near me, 纯竞品品牌", "不建页或人工复核", "不导流", "任何不符合产品/法规/品牌定位的词", "vape shop near me", "先删掉会拖累站点主题和合规性的词"],
  ];
  sheet.getRangeByIndexes(0, 0, rows.length, rows[0].length).values = rows;
  sheet.getRange("A1:H1").format = { fill: colors.navy, font: { bold: true, color: colors.white }, wrapText: true };
  sheet.getRange("A2:A6").format = { fill: colors.mint, font: { bold: true, color: colors.ink } };
  sheet.getRange("A1:H6").format = { borders: { preset: "all", style: "thin", color: colors.border }, wrapText: true };
  sheet.freezePanes.freezeRows(1);
  setWidths(sheet, { A: 18, B: 24, C: 38, D: 26, E: 34, F: 28, G: 28, H: 38 }, 30);
  sheet.getRange("A1:H6").format.autofitRows();
}

function writeRawSheet(sheet) {
  const raw = [headers, ...sourceRows];
  sheet.getRangeByIndexes(0, 0, raw.length, headers.length).values = raw;
  sheet.getRangeByIndexes(0, 0, 1, headers.length).format = {
    fill: colors.navy,
    font: { bold: true, color: colors.white },
  };
  sheet.tables.add(`A1:H${raw.length}`, true, "SourceDataTable");
  sheet.freezePanes.freezeRows(1);
  setWidths(sheet, { A: 28, B: 45, C: 60, D: 34, E: 18, F: 12, G: 18, H: 24 }, raw.length);
  sheet.getRange(`A1:H${Math.min(raw.length, 80)}`).format.wrapText = true;
}

function writeResultSheet(sheet) {
  const rows = [resultHeaders];
  for (const item of classified) {
    rows.push([
      item.originalIndex,
      item.url,
      item.keyword,
      item.keywordType,
      item.volume,
      item.kd,
      item.semrushIntent,
      item.cluster,
      item.role,
      item.recommendedSite,
      "",
      "",
      item.pageType,
      item.titleAngle,
      item.mainTarget,
      item.linkAllowed,
      item.anchorType,
      item.riskNote,
      item.intentNote,
      item.demandScore,
      item.difficultyScore,
      item.businessValue,
      item.contentWritable,
      item.siteFit,
      item.riskDeduction,
      "",
      "",
      "",
      item.title,
      item.description,
    ]);
  }
  sheet.getRangeByIndexes(0, 0, rows.length, resultHeaders.length).values = rows;
  const last = rows.length;
  sheet.getRange(`L2:L${last}`).formulas = Array.from({ length: last - 1 }, (_, i) => {
    const r = i + 2;
    return [`=IF(K${r}="",J${r},K${r})`];
  });
  sheet.getRange(`Z2:Z${last}`).formulas = Array.from({ length: last - 1 }, (_, i) => {
    const r = i + 2;
    return [[`=MAX(0,MIN(100,ROUND(((T${r}+U${r}+V${r}+W${r}+X${r})-Y${r})/85*100,0)))`][0]];
  });
  sheet.getRange(`AA2:AA${last}`).formulas = Array.from({ length: last - 1 }, (_, i) => {
    const r = i + 2;
    return [[`=IF(L${r}="暂不做","P3 暂缓",IF(Z${r}>=75,"P0 本周做",IF(Z${r}>=60,"P1 近期做",IF(Z${r}>=45,"P2 备选","P3 暂缓"))))`][0]];
  });
  sheet.getRange(`AB2:AB${last}`).formulas = Array.from({ length: last - 1 }, (_, i) => {
    const r = i + 2;
    return [
      [
        `=IF(Y${r}>=15,"先做合规/相关性复核，不建议直接商业导流",IF(L${r}="主站","建/优化主站商业页",IF(L${r}="博客A-知识教程","写知识教程/FAQ文章",IF(L${r}="博客B-场景人群","写场景需求/选购指南文章",IF(L${r}="博客C-对比评测","写对比评测/榜单文章","暂不做或人工复核")))))`,
      ][0],
    ];
  });
  sheet.getRange("A1:AD1").format = { fill: colors.navy, font: { bold: true, color: colors.white }, wrapText: true };
  sheet.getRange(`A1:AD${last}`).format.borders = { preset: "inside", style: "thin", color: colors.border };
  sheet.getRange(`E2:F${last}`).format.numberFormat = "#,##0";
  sheet.getRange(`T2:Z${last}`).format.numberFormat = "0";
  sheet.tables.add(`A1:AD${last}`, true, "KeywordAllocationTable");
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(3);
  sheet.getRange(`K2:K${last}`).dataValidation = { rule: { type: "list", values: siteNames } };
  setWidths(
    sheet,
    {
      A: 10,
      B: 28,
      C: 34,
      D: 16,
      E: 12,
      F: 16,
      G: 22,
      H: 24,
      I: 18,
      J: 18,
      K: 18,
      L: 18,
      M: 26,
      N: 58,
      O: 34,
      P: 16,
      Q: 22,
      R: 56,
      S: 60,
      T: 12,
      U: 12,
      V: 14,
      W: 14,
      X: 14,
      Y: 14,
      Z: 12,
      AA: 16,
      AB: 34,
      AC: 48,
      AD: 60,
    },
    last,
  );
  sheet.getRange(`A1:AD${Math.min(last, 220)}`).format.wrapText = true;
  addResultConditionalFormats(sheet, last);
}

function addResultConditionalFormats(sheet, last) {
  sheet.getRange(`AA2:AA${last}`).conditionalFormats.add("containsText", {
    text: "P0",
    format: { fill: "#DFF5E8", font: { bold: true, color: "#14532D" } },
  });
  sheet.getRange(`AA2:AA${last}`).conditionalFormats.add("containsText", {
    text: "P1",
    format: { fill: "#EAF3FA", font: { bold: true, color: "#174569" } },
  });
  sheet.getRange(`AA2:AA${last}`).conditionalFormats.add("containsText", {
    text: "P3",
    format: { fill: "#F4F4F5", font: { color: "#52525B" } },
  });
  sheet.getRange(`J2:L${last}`).conditionalFormats.add("containsText", {
    text: "主站",
    format: { fill: "#E7F6F1", font: { color: "#134E4A" } },
  });
  sheet.getRange(`J2:L${last}`).conditionalFormats.add("containsText", {
    text: "博客C",
    format: { fill: "#F1EDFF", font: { color: "#4C1D95" } },
  });
  sheet.getRange(`R2:R${last}`).conditionalFormats.add("containsText", {
    text: "高风险",
    format: { fill: "#FDECEC", font: { bold: true, color: "#991B1B" } },
  });
}

function writeCalendarSheet(sheet) {
  const headers = [
    "排期周",
    "推荐站点",
    "关键词",
    "volume",
    "KD",
    "intent",
    "优先级",
    "文章类型",
    "建议标题/角度",
    "H2大纲",
    "主站链接目标",
    "CTA/导流方式",
    "备注",
  ];
  const rows = [headers];
  blogRows.forEach((item, index) => {
    const week = `Week ${Math.floor(index / 8) + 1}`;
    rows.push([
      week,
      item.recommendedSite,
      item.keyword,
      item.volume,
      item.kd,
      item.semrushIntent,
      priorityFromScore(item.score, item.recommendedSite),
      item.pageType,
      item.titleAngle,
      outlineFor(item),
      item.mainTarget,
      item.linkAllowed === "是" ? "文中 1-2 个自然内链到对应集合页" : item.linkAllowed === "谨慎" ? "只在上下文强相关时放 1 个自然内链" : "不放商业内链",
      item.riskNote,
    ]);
  });
  sheet.getRangeByIndexes(0, 0, rows.length, headers.length).values = rows;
  sheet.getRange("A1:M1").format = { fill: colors.navy, font: { bold: true, color: colors.white }, wrapText: true };
  sheet.getRange(`A1:M${rows.length}`).format.borders = { preset: "inside", style: "thin", color: colors.border };
  sheet.getRange(`D2:E${rows.length}`).format.numberFormat = "#,##0";
  sheet.tables.add(`A1:M${rows.length}`, true, "ContentCalendarTable");
  sheet.freezePanes.freezeRows(1);
  setWidths(sheet, { A: 12, B: 18, C: 34, D: 12, E: 10, F: 22, G: 16, H: 28, I: 58, J: 68, K: 34, L: 32, M: 56 }, rows.length);
  sheet.getRange(`A1:M${Math.min(rows.length, 220)}`).format.wrapText = true;
}

function writeBriefSheet(sheet) {
  const headers = [
    "关键词",
    "推荐站点",
    "搜索意图",
    "目标读者问题",
    "H1建议",
    "文章骨架",
    "必须覆盖",
    "不要写",
    "主站内链/锚文本",
    "转化方式",
    "评分",
  ];
  const rows = [headers];
  briefRows.forEach((item) => {
    rows.push([
      item.keyword,
      item.recommendedSite,
      item.semrushIntent,
      readerQuestionFor(item),
      h1For(item),
      outlineFor(item),
      mustCoverFor(item),
      dontWriteFor(item),
      item.linkAllowed === "否" ? "不导流" : `${item.mainTarget}；锚文本用${item.anchorType}`,
      item.linkAllowed === "是" ? "文中自然引导查看相关集合页，不要硬广" : item.linkAllowed === "谨慎" ? "只在读者下一步需要选购时放软CTA" : "无商业CTA",
      item.score,
    ]);
  });
  sheet.getRangeByIndexes(0, 0, rows.length, headers.length).values = rows;
  sheet.getRange("A1:K1").format = { fill: colors.navy, font: { bold: true, color: colors.white }, wrapText: true };
  sheet.getRange(`A1:K${rows.length}`).format.borders = { preset: "inside", style: "thin", color: colors.border };
  sheet.getRange(`K2:K${rows.length}`).format.numberFormat = "0";
  sheet.tables.add(`A1:K${rows.length}`, true, "ArticleBriefTable");
  sheet.freezePanes.freezeRows(1);
  setWidths(sheet, { A: 34, B: 18, C: 22, D: 46, E: 52, F: 72, G: 48, H: 42, I: 40, J: 36, K: 10 }, rows.length);
  sheet.getRange(`A1:K${Math.min(rows.length, 120)}`).format.wrapText = true;
}

function writeDashboardSheet(sheet) {
  const last = classified.length + 1;
  const rows = [
    ["Exdivo 关键词分配仪表盘", "", "", "", "", "", "", ""],
    ["数据源", sourcePath, "", "关键词总数", "", "", "", ""],
    ["口径", "按 Semrush 导出关键词 + 本表分站规则自动初筛；最终仍要人工看 Google SERP。", "", "生成日期", new Date(), "", "", ""],
    ["", "", "", "", "", "", "", ""],
    ["站点", "关键词数", "P0数", "P1数", "平均总分", "可导流数", "高风险数", "说明"],
  ];
  siteNames.forEach((site) => {
    rows.push([
      site,
      "",
      "",
      "",
      "",
      "",
      "",
      dashboardNoteFor(site),
    ]);
  });
  rows.push(["", "", "", "", "", "", "", ""]);
  rows.push(["优先级", "关键词数", "", "", "", "", "", ""]);
  priorityLabels.forEach((p) => rows.push([p, "", "", "", "", "", "", ""]));
  rows.push(["", "", "", "", "", "", "", ""]);
  rows.push(["下一步建议：先做主站 P0/P1 交易页，再做博客C临近购买词，博客B补场景词，博客A做知识和合规内容。合规/健康/未成年人相关词，不要直接商业导流。", "", "", "", "", "", "", ""]);
  sheet.getRangeByIndexes(0, 0, rows.length, 8).values = rows;
  sheet.getRange("E2").formulas = [[`=COUNTA('关键词分站结果'!$C$2:$C$${last})`]];
  sheet.getRange("B6:G10").formulas = siteNames.map((site) => [
    `=COUNTIF('关键词分站结果'!$L$2:$L$${last},"${site}")`,
    `=COUNTIFS('关键词分站结果'!$L$2:$L$${last},"${site}",'关键词分站结果'!$AA$2:$AA$${last},"P0 本周做")`,
    `=COUNTIFS('关键词分站结果'!$L$2:$L$${last},"${site}",'关键词分站结果'!$AA$2:$AA$${last},"P1 近期做")`,
    `=IFERROR(AVERAGEIF('关键词分站结果'!$L$2:$L$${last},"${site}",'关键词分站结果'!$Z$2:$Z$${last}),0)`,
    `=COUNTIFS('关键词分站结果'!$L$2:$L$${last},"${site}",'关键词分站结果'!$P$2:$P$${last},"是")`,
    `=COUNTIFS('关键词分站结果'!$L$2:$L$${last},"${site}",'关键词分站结果'!$R$2:$R$${last},"*高风险*")`,
  ]);
  sheet.getRange("B13:B16").formulas = priorityLabels.map((p) => [
    `=COUNTIF('关键词分站结果'!$AA$2:$AA$${last},"${p}")`,
  ]);
  sheet.getRange("A1:H1").merge();
  sheet.getRange("A1").format = { fill: colors.navy, font: { bold: true, color: colors.white, size: 16 } };
  sheet.getRange("A5:H5").format = { fill: colors.teal, font: { bold: true, color: colors.white }, wrapText: true };
  sheet.getRange("A13:B13").format = { fill: colors.blue, font: { bold: true, color: colors.white } };
  sheet.getRange("A18:H18").merge();
  sheet.getRange("A18").format = { fill: colors.sand, font: { bold: true, color: colors.ink }, wrapText: true };
  sheet.getRange("E6:G10").format.numberFormat = "0";
  sheet.getRange("E6:E10").format.numberFormat = "0.0";
  sheet.getRange("E3").format.numberFormat = "yyyy-mm-dd";
  sheet.getRange(`A1:H${rows.length}`).format.borders = { preset: "inside", style: "thin", color: colors.border };
  setWidths(sheet, { A: 20, B: 18, C: 12, D: 12, E: 16, F: 14, G: 14, H: 70 }, rows.length);
}

function priorityFromScore(score, site) {
  if (site === "暂不做") return "P3 暂缓";
  if (score >= 75) return "P0 本周做";
  if (score >= 60) return "P1 近期做";
  if (score >= 45) return "P2 备选";
  return "P3 暂缓";
}

function dashboardNoteFor(site) {
  const notes = {
    主站: "交易和品类页面优先，避免博客抢同一商业词。",
    "博客A-知识教程": "负责解释、教程、FAQ和合规科普，导流要克制。",
    "博客B-场景人群": "负责场景、人群、口味、尼古丁需求等长尾词。",
    "博客C-对比评测": "负责best/review/vs/alternative等临近购买前关键词。",
    暂不做: "弱相关、高风险、本地错配或纯竞品品牌词，先不排期。",
  };
  return notes[site] ?? "";
}

function outlineFor(item) {
  if (item.recommendedSite.includes("博客C")) {
    return "1. 搜索者到底想比较什么；2. 评价标准；3. 主要选项对比；4. 适合/不适合人群；5. 购买前检查清单；6. 自然推荐相关集合页";
  }
  if (item.recommendedSite.includes("博客B")) {
    return "1. 场景/人群问题；2. 选择维度；3. 常见误区；4. 推荐判断标准；5. FAQ；6. 如果需要购买，链接到对应集合页";
  }
  return "1. 定义/背景；2. 工作原理或步骤；3. 常见问题；4. 风险与合规提醒；5. 何时需要进一步比较或选购";
}

function readerQuestionFor(item) {
  if (item.recommendedSite.includes("博客C")) return `用户想知道 ${item.keyword} 里哪种选择更值得买、差异是什么、有没有替代方案。`;
  if (item.recommendedSite.includes("博客B")) return `用户在具体场景下考虑 ${item.keyword}，想知道怎么选更合适。`;
  return `用户想先理解 ${item.keyword} 是什么、怎么用、有什么注意事项。`;
}

function h1For(item) {
  if (item.recommendedSite.includes("博客C")) return `${titleCase(item.keyword)}: Best Options, Comparisons, and Buying Considerations`;
  if (item.recommendedSite.includes("博客B")) return `${titleCase(item.keyword)}: How to Choose the Right Option for Your Needs`;
  return `${titleCase(item.keyword)}: A Practical Guide and Common Questions`;
}

function mustCoverFor(item) {
  if (item.recommendedSite.includes("博客C")) return "评价标准、对比维度、适合人群、优缺点、购买前清单、客观免责声明";
  if (item.recommendedSite.includes("博客B")) return "使用场景、核心选择标准、常见误区、FAQ、自然内链到主站相关集合页";
  return "定义、步骤/原理、FAQ、风险提示、必要的合规说明";
}

function dontWriteFor(item) {
  if (item.riskNote.includes("健康") || item.riskNote.includes("YMYL")) return "不要写戒烟疗效、健康保证、医疗建议或购买诱导";
  if (item.riskNote.includes("未成年人")) return "不要面向未成年人营销，不要出现购买引导";
  if (item.riskNote.includes("竞品")) return "不要冒用商标，不要贬低竞品，不要做无法证明的比较";
  return "不要硬塞产品、不要关键词堆砌、不要承诺不确定的效果";
}

function titleCase(text) {
  return String(text)
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function setWidths(sheet, widths, rows) {
  for (const [col, width] of Object.entries(widths)) {
    sheet.getRange(`${col}1:${col}${Math.max(rows, 1)}`).format.columnWidth = width;
  }
}
