import { STANDARD } from "./standard.mjs";
import { resolveTargetAsset } from "./assets.mjs";
import { localeForProject, localeInstruction } from "./locale.mjs";
import { hasAny, slugify, titleCase } from "./utils.mjs";

export function referencePlan(item) {
  if (!item) return { triggered: false, reason: "未选择关键词。", sources: [] };

  const text = `${item.keyword} ${item.intent} ${item.pageType}`.toLowerCase();
  const sources = [];

  for (const [name, rule] of Object.entries(STANDARD.references.triggers)) {
    if (hasAny(text, rule.terms)) {
      sources.push({
        name,
        label: rule.label,
        url: rule.url,
      });
    }
  }

  if (!sources.length) {
    return {
      triggered: false,
      reason: "未触发官方引用：普通选购、口味、场景、经验型文章可以 0 引用，避免每篇文章都长得一样。",
      sources: [],
    };
  }

  return {
    triggered: true,
    reason: "触发官方引用：涉及健康、安全、年龄、法规、电子烟定义或电池回收，正文需要更谨慎。",
    sources,
  };
}

export function parentPageFor(item, project = {}) {
  if (!item) return "";
  const asset = resolveTargetAsset(item, project);
  if (asset.status === "existing" || asset.status === "needs_review") return asset.url;
  if (item.parentPage && item.assetStatus === "existing") return item.parentPage;
  return "";
}

export function outlineFor(item) {
  if (!item) return [];
  const keyword = item.keyword;

  if (item.assignedSite === "主站-集合页") {
    return [
      `H1: ${titleCase(keyword)}`,
      "H2: 快速筛选：口味、尼古丁、续航、价格带",
      "H2: 推荐产品区块：畅销款、新手款、长续航款",
      "H2: 购买前需要确认的 5 个问题",
      "H2: FAQ：配送、退换、合规、使用注意事项",
    ];
  }

  if (item.assignedSite === "主站-博客") {
    return [
      `H1: ${titleCase(keyword)}: Practical Guide Before You Buy`,
      "H2: 先给结论：谁适合、谁不适合",
      "H2: 判断标准：需求、预算、使用场景、维护成本",
      "H2: 推荐选择路径：从问题到主站集合页",
      "H2: 常见误区与安全提醒",
      "H2: FAQ",
    ];
  }

  if (item.assignedSite?.includes("对比")) {
    return [
      `H1: ${titleCase(keyword)}: Which Option Makes More Sense?`,
      "H2: 快速结论表",
      "H2: 适合人群对比",
      "H2: 成本、便携、维护、体验对比",
      "H2: 什么时候应该选择 A / B",
      "H2: FAQ",
    ];
  }

  if (item.assignedSite?.includes("场景")) {
    return [
      `H1: ${titleCase(keyword)}: How To Choose Without Overthinking`,
      "H2: 场景拆分：新手、通勤、旅行、口味探索",
      "H2: 选择标准：强度、甜度、续航、便携",
      "H2: 避坑清单",
      "H2: 下一步阅读或导购入口",
      "H2: FAQ",
    ];
  }

  return [
    `H1: ${titleCase(keyword)}: A Clear, Practical Guide`,
    "H2: 先解释用户真正想解决的问题",
    "H2: 分步骤说明核心概念",
    "H2: 常见错误与注意事项",
    "H2: 什么时候需要进一步比较产品",
    "H2: FAQ",
  ];
}

export function imagePlanFor(item) {
  if (!item) return [];
  return STANDARD.imagePlacements.map((image) => ({
    name: image.name,
    position: image.position,
    alt: image.altTemplate.replace("{keyword}", item.keyword),
  }));
}

function statusLabel(status) {
  return (
    {
      existing: "已存在",
      planned: "规划 URL",
      needs_review: "需要人工确认",
      missing: "缺失",
    }[status] || status || "未确定"
  );
}

function keywordContext(item) {
  return `${item.keyword} ${item.intent} ${item.intentBucket} ${item.pageType} ${item.assignedSite}`.toLowerCase();
}

export function articleTypeFor(item) {
  if (!item) return "未选择";
  const text = keywordContext(item);

  if (item.assignedSite === "主站-集合页") return "集合页 / 商业承接页";
  if (item.assignedSite?.includes("对比") || hasAny(text, STANDARD.signals.comparison)) return "对比文 / Best / VS";
  if (item.assignedSite?.includes("场景") || hasAny(text, STANDARD.signals.scenario)) return "场景方案 / 人群方案";
  if (hasAny(text, STANDARD.signals.transaction)) return "购买指南 / 商业前教育";
  if (item.assignedSite?.includes("知识") || hasAny(text, STANDARD.signals.knowledge)) return "教程 / FAQ / 合规科普";
  if (item.assignedSite === "主站-博客") return "购买前教育文章";
  return item.pageType || "实用指南";
}

function userQuestionFor(item) {
  const text = keywordContext(item);

  if (item.assignedSite === "主站-集合页") {
    return `用户搜索 "${item.keyword}" 时已经接近选择或购买，需要快速看到合适的产品/分类、筛选标准和可信购买入口。`;
  }

  if (hasAny(text, STANDARD.signals.comparison)) {
    return `用户搜索 "${item.keyword}" 时想比较不同选择，判断哪一种更适合自己，以及下一步应该看哪个承接页。`;
  }

  if (hasAny(text, STANDARD.signals.transaction)) {
    return `用户搜索 "${item.keyword}" 时有明显购买前判断需求，需要确认规格、适用场景、价格/风险和购买路径。`;
  }

  if (hasAny(text, STANDARD.signals.scenario)) {
    return `用户搜索 "${item.keyword}" 时想在具体场景或人群里快速筛选方案，而不是阅读泛泛概念。`;
  }

  if (hasAny(text, STANDARD.signals.knowledge)) {
    return `用户搜索 "${item.keyword}" 时想先理解概念、方法、规则或注意事项，再决定是否继续比较产品。`;
  }

  return `用户搜索 "${item.keyword}" 时想获得一个清晰、可信、能指导下一步决策的答案。`;
}

function oneSentenceAnswerFor(item) {
  const text = keywordContext(item);

  if (item.assignedSite === "主站-集合页") {
    return `${titleCase(item.keyword)} should be handled as a commercial landing page with filters, product proof, FAQs, and clear purchase paths, not as a generic blog article.`;
  }

  if (hasAny(text, STANDARD.signals.comparison)) {
    return `The best answer for "${item.keyword}" is a practical comparison that explains the key differences, who each option fits, and the next page to visit.`;
  }

  if (hasAny(text, STANDARD.signals.transaction)) {
    return `The article should help readers choose confidently first, then point them to the most relevant product or collection page only when that page is confirmed.`;
  }

  if (hasAny(text, STANDARD.signals.knowledge)) {
    return `Answer the exact question behind "${item.keyword}" first, then explain what it means for safe use, product choice, or the next decision step.`;
  }

  return `Start with a direct answer to "${item.keyword}", then organize the article around the reader's decision path instead of broad background.`;
}

function originalEvidenceFor(item, project = {}) {
  const evidence = [
    "决策表 / 对比表：把关键选择标准视觉化。",
    "真实产品、参数、材质、规格或场景经验：避免纯 AI 泛写。",
    "FAQ：从 Semrush、People Also Ask 或后续 GSC 查询词补充真实问题。",
  ];

  if (project.coreProducts) {
    evidence.unshift(`结合当前核心产品/类目：${project.coreProducts}，补充实际商品或分类经验。`);
  }

  if (referencePlan(item).triggered) {
    evidence.push("官方定义、法规、安全或回收资料：只在触发 References 时使用。");
  }

  return evidence;
}

function competitorGapFor(item) {
  return [
    "写作前看 Google 前 10，记录前排是否缺少对比表、真实图片、规格参数、购买建议、FAQ 或适用人群判断。",
    `正文至少补足 1-2 个能帮助 "${item.keyword}" 超越泛泛内容的差异点。`,
    "如果前排都是集合页，优先重新判断是否应该做页面，而不是硬写文章。",
  ];
}

function internalLinkPlanFor(item, asset, project = {}) {
  const lines = [
    `目标资产：${asset.url || "未确定"}（${statusLabel(asset.status)}）`,
    `内容动作：${asset.contentAction}`,
  ];

  if (asset.status === "existing") {
    lines.push("正文允许自然链接到目标资产，但同一 URL 不重复完全相同锚文本。");
  } else if (asset.status === "needs_review") {
    lines.push("目标资产需要人工确认，正文只输出 Internal Link Suggestions，不生成可点击硬链接。");
  } else {
    lines.push("目标资产尚未真实存在，先放入 Internal Link Suggestions，等页面创建后再上线链接。");
  }

  if (project.mainPages) {
    lines.push("优先从已填写的主站商业页面里选择最相关承接页。");
  }

  lines.push("下链相关博客：补充 1-3 篇同主题支持文章，用不同自然锚文本连接主题集群。");
  return lines;
}

function ctaFor(item, asset) {
  const type = articleTypeFor(item);
  const target = asset.url || "待确认承接页";

  if (type.includes("教程") || type.includes("FAQ") || item.assignedSite?.includes("知识")) {
    return `轻 CTA：先帮助读者完成理解，再用一句自然建议引导到 ${target}；不要硬塞购买按钮。`;
  }

  if (type.includes("对比") || type.includes("购买") || item.assignedSite === "主站-博客") {
    return `中强 CTA：在结论或 FAQ 后引导读者查看 ${target}，文案要承接比较/选购需求。`;
  }

  if (item.assignedSite === "主站-集合页") {
    return "强 CTA：集合页首屏、筛选区和 FAQ 后都需要清晰购买/比较入口。";
  }

  return `低门槛 CTA：给出下一步阅读或比较入口，避免让博客站文章像销售页。`;
}

function visualAssetsFor(item) {
  const assets = imagePlanFor(item).map((image) => `${image.name}：${image.position}`);
  const type = articleTypeFor(item);

  if (type.includes("对比") || type.includes("购买") || hasAny(keywordContext(item), STANDARD.signals.comparison)) {
    assets.unshift("核心对比表：维度、适合人群、优缺点、下一步建议。");
  }

  if (type.includes("教程") || hasAny(keywordContext(item), STANDARD.signals.knowledge)) {
    assets.unshift("步骤/判断流程图：帮助用户按顺序完成理解或操作。");
  }

  return assets;
}

function faqFor(item) {
  return [
    `What does "${item.keyword}" mean for a shopper?`,
    `How should I choose the right option for "${item.keyword}"?`,
    `What should I compare before making a decision?`,
    `When should I visit the product or collection page instead of reading more guides?`,
  ];
}

function eeatFor(item, project = {}) {
  const lines = [
    "写清楚判断依据，不只给抽象建议。",
    "加入真实产品/场景/参数/对比维度，让读者能验证。",
    "涉及健康、安全、法规、年龄、回收时只使用官方或高可信来源。",
  ];

  if (project.domain) {
    lines.unshift(`结合 ${project.domain} 的真实页面、商品、图片或 FAQ 经验。`);
  }

  if (item.url) {
    lines.push(`检查 Semrush 原始 URL：${item.url}，判断它是否可作为已有资产或竞品线索。`);
  }

  return lines;
}

function reviewMetricsFor() {
  return [
    "发布 30-60 天后看 GSC：Clicks、Impressions、Average Position、查询词覆盖。",
    "有展现没点击：优先改标题、Meta、首屏一句话答案。",
    "有排名苗头但不上升：补 FAQ、对比表、原创证据和内部链接。",
    "有点击没转化：检查 CTA、承接页匹配度和内链锚文本。",
  ];
}

function updateDecisionFor() {
  return [
    "有排名苗头就更新，不要只发不改。",
    "优先补强：FAQ、对比表、图片/表格、内部链接、缺失的父级商业页入口。",
    "如果 SERP 意图变化，重新判断页面类型，必要时合并、改写或转成商业页。",
  ];
}

export function articleBriefTemplateFor(item, project = {}) {
  if (!item) return [];

  const refs = referencePlan(item);
  const outline = outlineFor(item);
  const images = imagePlanFor(item);
  const asset = resolveTargetAsset(item, project);
  const score = item.scores?.total ?? "未评分";
  const priority = item.priority || "未定";
  const computed = {
    primaryKeyword: {
      value: `${item.keyword}（${priority} / ${score}）`,
      review: "一个主词只服务一个明确意图；同意图变体进入副关键词或 FAQ。",
    },
    parentCommercialPage: {
      value: `${asset.url || "未确定"}（${statusLabel(asset.status)}）`,
      review: "上线前必须确认承接页真实存在；非 existing 资产不能在正文生成可点击链接。",
    },
    userQuestion: { value: userQuestionFor(item), review: "正文第一屏必须回应这个问题。" },
    searchIntent: {
      value: `${item.intentBucket || item.intent || "未识别"}；工具标签：${item.intent || "未提供"}；写作前仍建议人工看 SERP 前 10 校验。`,
      review: "如果 SERP 多数是集合页/商品页，应重新判断页面类型。",
    },
    articleType: {
      value: articleTypeFor(item),
      review: "文章类型要匹配 SERP 获胜类型，不按我们想写什么来定。",
    },
    oneSentenceAnswer: { value: oneSentenceAnswerFor(item), review: "开头先给结论，再展开。" },
    h2Structure: { value: outline, review: "H2 顺序必须服务用户决策路径。" },
    originalEvidence: { value: originalEvidenceFor(item, project), review: "至少落地 2-3 个非泛泛模块。" },
    competitorGap: { value: competitorGapFor(item), review: "把 SERP 缺口转成正文可执行模块。" },
    internalLinks: { value: internalLinkPlanFor(item, asset, project), review: "上链商业页，下链相关博客；锚文本自然变化。" },
    cta: { value: ctaFor(item, asset), review: "CTA 强弱跟意图和文章类型匹配。" },
    visualAssets: { value: visualAssetsFor(item), review: "表格、流程图、场景图优先于纯文字堆叙述。" },
    imagePlacement: {
      value: images.map((image) => `${image.name}：${image.position}；alt="${image.alt}"`),
      review: "必须写清楚 H2/H3、段落后、表格前后或 CMS featured image。",
    },
    faq: { value: faqFor(item), review: "正式写作前可用 PAA、Semrush、GSC 替换为真实问题。" },
    referencesJudgment: {
      value: refs.triggered
        ? [`需要 References：${refs.reason}`, ...refs.sources.map((source) => `${source.name}: [${source.label}](${source.url})`)]
        : ["0引用，不添加 References；除非写作中实际使用了外部资料。", refs.reason],
      review: "触发才加 References，不触发就不要硬塞。",
    },
    eeat: { value: eeatFor(item, project), review: "用经验、证据、可验证事实降低 AI 味。" },
    postPublishReview: { value: reviewMetricsFor(item), review: "30-60 天复盘，不只发布不回看。" },
    updateDecision: { value: updateDecisionFor(item), review: "有排名苗头就更新，优先补强已有文章。" },
  };

  const modules = STANDARD.articleBriefTemplate?.modules || [];
  return modules.map((module) => ({
    ...module,
    value: computed[module.key]?.value || "待补充",
    review: computed[module.key]?.review || "待复盘",
  }));
}

function formatBriefModule(module, index) {
  const valueLines = Array.isArray(module.value)
    ? ["- 填写内容：", ...module.value.map((line) => `  - ${line}`)]
    : [`- 填写内容：${module.value || "待补充"}`];

  return [
    `### ${index + 1}. ${module.label}`,
    ...valueLines,
    `- 判断标准：${module.standard}`,
    `- Excel 示例：${module.example}`,
    `- 写作提示：${module.promptInstruction}`,
    `- 复盘：${module.review}`,
    "",
  ];
}

export function briefFor(item, project = {}) {
  if (!item) {
    return "请先导入关键词，并在分站评分表中选择一个关键词。";
  }

  const refs = referencePlan(item);
  const outline = outlineFor(item);
  const images = imagePlanFor(item);
  const asset = resolveTargetAsset(item, project);
  const locale = localeForProject(project);
  const canLinkToAsset = asset.status === "existing";
  const needsReviewAsset = asset.status === "needs_review";
  const templateModules = articleBriefTemplateFor(item, project);

  return [
    `# SEO Brief: ${item.keyword}`,
    "",
    `主题集群：${item.topicCluster || item.pageGroup || item.keyword}`,
    `种子词：${item.seedKeyword || "未提供"}`,
    `页面组：${item.pageGroup || "未提供"}`,
    `目标站点：${item.assignedSite}`,
    `页面类型：${item.pageType}`,
    `页面角色：${item.pageRole || "Content Support"}`,
    `搜索意图：${item.intentBucket}`,
    `目标市场：${project.market || "未选择"}`,
    `内容语言：${locale.language || "未确定"}`,
    `Google SERP Locale：gl=${locale.googleGl || "not-set"} / hl=${locale.googleHl || "not-set"}`,
    `Semrush 数据库建议：${locale.semrushDatabase || "未确定 / 需要按市场拆分"}`,
    locale.warning ? `Locale 警告：${locale.warning}` : "",
    `优先级：${item.priority} / ${item.scores.total}`,
    `目标资产：${asset.url || "未确定"}`,
    `资产状态：${asset.status}`,
    `内容动作：${asset.contentAction}`,
    `资产判断：${asset.reason}`,
    `可否在正文直接链接：${canLinkToAsset ? "可以" : "不可以，先作为内链建议输出"}`,
    `推荐 URL：/${slugify(item.keyword)}`,
    "",
    "## 评分依据",
    `- 需求分：${item.scores.demand}/20，搜索量 ${item.volume}`,
    `- 难度分：${item.scores.difficulty}/20，KD ${item.kd}`,
    `- 商业价值：${item.scores.commercial}/20`,
    `- 内容可写性：${item.scores.content}/20`,
    `- 站点匹配：${item.scores.siteFit}/20`,
    `- 风险扣分：${item.scores.riskPenalty}`,
    ...(item.aiReview
      ? [
          `- AI 复核总分：${item.scores.total}/100，信心 ${item.aiReview.confidence}/100`,
          `- 本地初筛：${item.localReview?.assignedSite || "未记录"} / ${item.localReview?.score ?? "未记录"}`,
          `- 是否建议人工看 SERP：${item.aiReview.needsSerpCheck ? "是" : "否"}`,
        ]
      : []),
    "",
    "## 分配理由",
    item.reason,
    "",
    "## P0 Locale / SERP Guardrail",
    localeInstruction(locale),
    locale.configured
      ? `- 正式文章必须使用 ${locale.language}，并匹配 ${locale.market} 的用词、拼写、购买语境和合规表达。`
      : "- 目标市场未配置：不要进入正式写作或发布。",
    `- 如果检查 Google SERP，必须使用 gl=${locale.googleGl || "not-set"} / hl=${locale.googleHl || "not-set"}。`,
    "- 当前系统不会自动抓取 Google 前 10；没有真实 SERP 数据时，只能标记 needsSerpCheck，不能声称已看过本地 SERP。",
    "",
    "## 文章 Brief 模板（完整结构化）",
    STANDARD.articleBriefTemplate?.description || "每篇文章开写前先填这个 Brief。",
    "",
    ...templateModules.flatMap((module, index) => formatBriefModule(module, index)),
    "## Brief 完成度检查",
    ...(STANDARD.articleBriefTemplate?.qualityGate || []).map((rule) => `- ${rule}`),
    "",
    "## 内容结构",
    ...outline.map((line) => `- ${line}`),
    "",
    "## 图片位置",
    ...images.map((image) => `- ${image.name}：${image.position}；alt="${image.alt}"`),
    "",
    "## References Trigger Judgment",
    refs.triggered
      ? `${refs.reason} 正文最后使用 References 模块，锚文本必须是官方页面的具体主题。`
      : `${refs.reason} 不添加 References 模块。`,
    ...refs.sources.map((source) => `- ${source.name}: [${source.label}](${source.url})`),
    "",
    "## 内链与 CTA",
    `- 目标资产：${asset.url || "未确定"}（${asset.status}）`,
    canLinkToAsset
      ? "- 该目标资产已存在，可以在正文自然内链。"
      : needsReviewAsset
        ? "- 该目标资产需要人工确认，正文可以写 Internal Link Suggestions，但不要直接生成硬链接。"
        : "- 该目标资产尚未存在或只是规划 URL，正文不要生成可点击链接，只输出 Internal Link Suggestions。",
    "- 博客站只做自然上下文内链，不硬塞购买按钮。",
    "- 主站博客可在总结前放一次软 CTA，并在 FAQ 后放一次集合页入口。",
    "",
    "## 锚文本规范",
    `- 原则：${STANDARD.anchorTextRules?.purpose || "内部链接要自然、具体、服务读者下一步。"}`,
    ...(STANDARD.anchorTextRules?.internalLinks || []).map((rule) => `- ${rule}`),
    "- 官方 References 的锚文本优先使用官方页面主题，不为了变化而改写。",
    "",
    "## 写作边界",
    ...STANDARD.articleRules.map((rule) => `- ${rule}`),
  ].join("\n");
}

export function mockArticleFor(item, project = {}) {
  if (!item) return "请先选择一个关键词。";

  const refs = referencePlan(item);
  const images = imagePlanFor(item);
  const outline = outlineFor(item).slice(1, 5);
  const title = titleCase(item.keyword);
  const asset = resolveTargetAsset(item, project);
  const canLinkToAsset = asset.status === "existing";
  const slug = slugify(item.keyword);
  const lastUpdated = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return [
    "## Title",
    "",
    title,
    "",
    "## Meta Title",
    "",
    `${title}: Practical Guide Before You Decide`,
    "",
    "## Meta Description",
    "",
    `Learn how to understand ${item.keyword} with a practical decision path, clear examples, internal link guidance, and SEO-ready article structure.`,
    "",
    "## URL Slug",
    "",
    slug,
    "",
    `## Primary Keyword: ${item.keyword}`,
    "",
    `## Secondary Keywords: ${item.topicCluster || item.pageGroup || item.seedKeyword || item.keyword}`,
    "",
    "## Last Updated",
    "",
    lastUpdated,
    "",
    `# ${title}`,
    "",
    `If you searched for "${item.keyword}", you are probably trying to make a clearer decision without reading ten scattered pages. This draft uses the chosen SEO framework: satisfy the intent first, then connect the reader to the right next step.`,
    "",
    ...outline.flatMap((heading) => [
      `## ${heading.replace(/^H2:\s*/, "")}`,
      "",
      "Write this section with practical examples, short paragraphs, and a clear decision path. Avoid unsupported health or legal claims. Use the keyword naturally only where it helps the reader.",
      "",
    ]),
    "## Next Step",
    "",
    canLinkToAsset
      ? `For shoppers who are ready to compare options, the natural next step is ${asset.url}. Keep the CTA soft and context-driven, especially if this article lives on a blog station.`
      : "This article should not include a clickable internal link yet because the target asset is not confirmed as existing. Keep the next step as an editorial recommendation until the parent page is created or verified.",
    "",
    "## Internal Link Suggestions",
    "",
    `- Target asset: ${asset.url || "not decided"} (${asset.status})`,
    `- Content action: ${asset.contentAction}`,
    canLinkToAsset
      ? "- Link permission: allowed in body copy."
      : "- Link permission: do not place a live link in the article body yet; output as an internal link suggestion.",
    "- Suggested anchor 1: Use a natural phrase that describes the next decision step.",
    "- Suggested anchor 2: If linking again, use a different contextual phrase only when it fits the paragraph naturally.",
    "- Avoid repeating the exact same anchor text for the same URL in this article.",
    "",
    "## FAQ",
    "",
    `### Is "${item.keyword}" a buying keyword or an information keyword?`,
    "",
    `In this framework, it is classified as ${item.intentBucket}, so the content should be built as ${item.pageType}.`,
    "",
    ...(refs.triggered
      ? [
          "## References",
          "",
          ...refs.sources.map((source) => `- ${source.name}: [${source.label}](${source.url})`),
          "",
        ]
      : []),
    "## Image Placement Map",
    "",
    ...images.map((image) => `- ${image.name}: ${image.position}. Alt: "${image.alt}"`),
    "",
    "## Content QA Checklist",
    "",
    "- One primary keyword is used.",
    "- Search intent is answered before conversion.",
    "- Internal links follow asset status rules.",
    "- Image Placement Map is included.",
    refs.triggered ? "- Official references are included." : "- References are not included because this draft does not require them by default.",
  ].join("\n");
}
