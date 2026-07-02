import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/汪海枭/Documents/Codex/2026-06-27/seo/outputs/article_keyword_framework/google_seo_article_keyword_standard_framework_linked.xlsx";
const outputDir = "C:/Users/汪海枭/Documents/Codex/2026-06-27/seo/outputs/article_keyword_framework_enhanced";
const outputPath = `${outputDir}/google_seo_article_keyword_standard_framework_monthly_review_enhanced.xlsx`;

const colors = {
  green: "#275E45",
  greenDark: "#173B2C",
  greenLight: "#DDEFE5",
  cream: "#F7F1DF",
  tan: "#E8D6AF",
  amber: "#8A4B2E",
  amberLight: "#F4E3CF",
  white: "#FFFFFF",
  text: "#172019",
  muted: "#5F6B61",
  border: "#D8CFB8",
};

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

function styleTitle(sheet, rangeAddress, title, subtitle) {
  const titleRange = sheet.getRange(rangeAddress);
  titleRange.merge();
  titleRange.values = [[title]];
  titleRange.format = {
    fill: colors.green,
    font: { bold: true, color: colors.white, fontSize: 16 },
    wrapText: true,
    verticalAlignment: "middle",
  };

  const [start, end] = rangeAddress.split(":");
  const endCol = end.replace(/[0-9]/g, "");
  const row = Number(start.replace(/[A-Z]/gi, "")) + 1;
  const subtitleRange = sheet.getRange(`A${row}:${endCol}${row + 1}`);
  subtitleRange.merge();
  subtitleRange.values = [[subtitle]];
  subtitleRange.format = {
    fill: colors.greenLight,
    font: { color: colors.text, fontSize: 11 },
    wrapText: true,
    verticalAlignment: "middle",
  };
  subtitleRange.format.rowHeightPx = 46;
}

function styleTable(sheet, rangeAddress, headerRows = 1) {
  const range = sheet.getRange(rangeAddress);
  range.format = {
    font: { color: colors.text, fontSize: 10 },
    wrapText: true,
    verticalAlignment: "top",
    borders: {
      insideHorizontal: { style: "thin", color: colors.border },
      insideVertical: { style: "thin", color: colors.border },
      top: { style: "thin", color: colors.border },
      bottom: { style: "thin", color: colors.border },
      left: { style: "thin", color: colors.border },
      right: { style: "thin", color: colors.border },
    },
  };
  const firstRow = rangeAddress.match(/[0-9]+/)?.[0] ?? "1";
  const lastCol = rangeAddress.split(":")[1].replace(/[0-9]/g, "");
  const headerRange = sheet.getRange(`A${firstRow}:${lastCol}${Number(firstRow) + headerRows - 1}`);
  headerRange.format = {
    fill: colors.tan,
    font: { bold: true, color: colors.text, fontSize: 10 },
    wrapText: true,
    verticalAlignment: "middle",
  };
  headerRange.format.rowHeightPx = 36;
}

function setWidths(sheet, widths) {
  widths.forEach((width, index) => {
    const col = String.fromCharCode("A".charCodeAt(0) + index);
    sheet.getRange(`${col}1:${col}120`).format.columnWidthPx = width;
  });
}

function createSheet(name, title, subtitle, titleRange = "A1:H1") {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;
  styleTitle(sheet, titleRange, title, subtitle);
  return sheet;
}

function addValidation(range, values) {
  range.dataValidation = {
    rule: {
      type: "list",
      values,
    },
  };
}

function addStandardClosureSection() {
  const sheet = workbook.worksheets.getItem("标准骨架");
  const startRow = 26;
  const rows = [
    ["发布后复盘闭环：把 GSC、当前排名、GA4、询盘和页面承接统一成下月动作", "", "", "", "", "", "", ""],
    ["阶段", "目标", "操作", "判断口径", "输出物", "AI必须遵守", "常见错误", "通过标准"],
    ["9. 数据源统一", "把关键词、文章库、GSC、GA4、当前排名、询盘接到同一站点画像", "在「数据源中心」记录数据来源、字段、市场/语言、同步频率", "数据是否同国家、同语言、同站点；是否能追到页面与关键词", "站点数据源状态表", "数据市场不匹配时必须标红风险，不允许直接生成结论", "DE 站点用 US 数据复盘；只看 Semrush 不看真实站点数据", "能说明每个结论来自哪个数据源"],
    ["10. 月度复盘", "判断本月 SEO 是否有效、下月优先做什么", "填写「月度复盘总控」：需求、排名承接、行为质量、转化/询盘", "GSC 证明需求；当前排名证明承接；GA4 判断流量质量；询盘/订单判断商业价值", "月度结论 + 下月主打法", "不要把月报写成流水账，必须输出结论和动作", "只报点击曝光，不判断为什么和下一步", "能得出 P0/P1/P2 的任务方向"],
    ["11. 排名校验", "解决 GSC 均位不是当前排名的问题", "用「GSC排名校验」把 GSC 查询词与 DataForSEO/Semrush 当前排名对齐", "GSC avg position 是历史均值；当前排名要看实时 provider 和排名 URL", "机会类型：Quick Win / Product Page Needed / Blog Supporting / Internal Link / Monitor", "有 GSC 曝光但当前排名缺失时，要先判断承接页是否缺失", "把 GSC 均位当真实排名；URL 错配还继续写新文章", "每个机会词有当前 URL、目标 URL 和动作"],
    ["12. 任务回流", "把复盘结果推回内容中枢、生产和发布", "在「月度ActionPlan」生成任务池，再推到内容中枢或待办", "不是所有机会都写新文章；有些是改旧文、补内链、做产品页、观察", "下月 Action Plan", "Product Page Needed 不应直接变成博客；Update Old Page 应回到文章库存优化", "所有机会都生成文章；重复抢同一关键词", "任务能进入生成、优化、内链或页面规划流程"],
  ];
  sheet.getRange(`A${startRow}:H${startRow + rows.length - 1}`).values = rows;
  sheet.getRange(`A${startRow}:H${startRow}`).format = {
    fill: colors.green,
    font: { bold: true, color: colors.white, fontSize: 13 },
    wrapText: true,
    verticalAlignment: "middle",
  };
  sheet.getRange(`A${startRow}:H${startRow}`).merge();
  styleTable(sheet, `A${startRow + 1}:H${startRow + rows.length - 1}`);
  sheet.getRange(`A${startRow + 2}:H${startRow + rows.length - 1}`).format.rowHeightPx = 68;
}

function buildDataSourcesSheet() {
  const sheet = createSheet(
    "数据源中心",
    "数据源中心：把关键词、站点文章、排名、行为和转化接到同一站点画像",
    "这张表定义后续网页端/API 应该接哪些数据，以及每个数据源在 SEO 决策里扮演什么角色。先允许 CSV/Excel 手动导入，后续再接 GSC、GA4、DataForSEO、询盘或订单 API。",
    "A1:H1",
  );
  setWidths(sheet, [150, 130, 180, 170, 210, 200, 120, 220]);
  const rows = [
    ["数据源", "接入方式", "关键字段", "主要用途", "健康检查", "失败/缺失时影响", "优先级", "下一步"],
    ["Semrush 关键词池", "Excel/CSV 导入", "Keyword, Volume, KD, Intent, SERP Features, URL, Country", "建立关键词池、主题簇、初始难度和搜索意图", "国家/语言是否匹配当前站点；是否保留搜索量和 KD", "只能做初筛，不能证明本站真实需求", "P0", "已接入，继续兼容不同导出格式"],
    ["站点文章库存", "WordPress / 自建博客 / 主站 OpenAPI", "title, slug/url, content, category, status, published_at, meta", "判断已覆盖主题、重复竞争、内链机会、旧文优化对象", "所选站点是否与市场/语言匹配；是否只展示当前站点文章", "无法判断写新文还是改旧文，容易重复", "P0", "已接入，继续补分类、标签和关键词映射"],
    ["GSC 查询词/页面", "CSV 导入，后续 API", "query, page, country, clicks, impressions, ctr, avg position, date", "证明真实搜索需求，发现高曝光低点击、页面错配、长尾机会", "日期范围、国家、站点属性是否正确；GSC 均位不得当实时排名", "无法知道本站真正被 Google 曝光了什么", "P0", "先做导入页，再接 OAuth/API"],
    ["当前排名", "DataForSEO / Semrush Rank / SerpAPI", "keyword, location, language, rank, ranking_url, checked_at", "校验当前是否真实排名、排名 URL 是否正确、是否 Quick Win", "检查时间、国家/语言、设备是否与目标市场一致", "会把历史均位误判为当前排名", "P0", "预留 provider 字段和导入模板"],
    ["GA4 行为质量", "CSV 导入，后续 API", "landing_page, country, source/medium, users, sessions, engagement, bounce, avg_time", "判断流量质量、入口页价值、目标国家和渠道质量", "目标 GEO 是否一致；停留、跳出、互动是否健康", "只知道有流量，不知道流量值不值钱", "P1", "先导入 GA4 report，后续接 Data API"],
    ["询盘/订单/加购", "表单、Shopify、CRM、自建接口", "event/page/source/keyword(if any), lead/order/add_to_cart, value, date", "判断 SEO 是否带来商业价值，给下月任务排序", "能否回溯到页面/来源；是否剔除垃圾询盘", "只能做流量 SEO，无法判断商业贡献", "P1", "预留转化接口和归因字段"],
    ["AI 引用/来源流量", "GA4 referral/source 或服务器日志", "chatgpt/perplexity/ai assistant referrals, landing_page", "观察 AI 搜索/推荐带来的额外流量和页面价值", "来源是否可识别；页面是否与主题相关", "忽略非 Google 机会", "P2", "先作为 GA4 来源分类"],
  ];
  sheet.getRange(`A5:H${4 + rows.length}`).values = rows;
  styleTable(sheet, `A5:H${4 + rows.length}`);
  sheet.tables.add(`A5:H${4 + rows.length}`, true, "DataSourcesTable");
  sheet.freezePanes.freezeRows(5);
}

function buildMonthlyControlSheet() {
  const sheet = createSheet(
    "月度复盘总控",
    "月度 SEO 复盘总控：先证明需求，再补强排名承接",
    "这里不是单纯月报，而是每月一次的决策层：GSC 证明有没有需求，当前排名判断有没有承接，GA4 判断流量质量，询盘/订单判断商业价值，最后产出下月打法。",
    "A1:J1",
  );
  setWidths(sheet, [140, 150, 160, 155, 170, 170, 170, 170, 180, 220]);

  const summaryRows = [
    ["复盘对象", "填写值", "说明", "判断结果", "备注"],
    ["站点", "", "选择主站 / WP 博客 / 自建博客 / 具体站点名", "", ""],
    ["复盘月份", "", "例如 2026-07", "", ""],
    ["目标市场/语言", "", "必须和关键词池、GSC、GA4、排名数据一致", "", ""],
    ["本月总判断", "", "例如：需求成立，但产品页承接不足", "", ""],
    ["下月主打法", "", "例如：Quick Win + Product Page Needed + 内链补强", "", ""],
  ];
  sheet.getRange("A5:E10").values = summaryRows;
  styleTable(sheet, "A5:E10");
  sheet.tables.add("A5:E10", true, "MonthlyReviewSummaryTable");

  const signalRows = [
    ["信号层", "核心问题", "关键指标", "健康信号", "风险信号", "结论填写", "输出动作"],
    ["需求信号", "用户是否真的在搜？", "GSC impressions / clicks / query count", "曝光增长、核心词有展现、点击逐步出现", "高曝光 0 点击、目标国家错配、只有工具量没有 GSC 信号", "", "继续做承接或标题优化"],
    ["排名承接", "有没有页面真正排名？", "当前排名位置、排名 URL、URL 是否匹配", "目标页进入 1-30 名，URL 类型正确", "GSC 有曝光但当前未排名；博客抢了产品页词；URL 错配", "", "Quick Win / 页面定位修正 / 产品页规划"],
    ["内容承接", "是新写、改旧文还是做页面？", "已有文章、目标 URL、主题覆盖、内链", "已有承接页且内容可更新", "无承接页、重复文章、主题孤岛", "", "新写文章 / 更新旧文 / 内链 / 合并"],
    ["行为质量", "流量是否有质量？", "GA4 engagement / bounce / avg session time / GEO", "目标国家流量、停留较好、入口页匹配", "非目标国家、跳出高、停留短、入口页不相关", "", "强化 CTA / 调整入口页 / 暂缓"],
    ["商业价值", "是否能带来询盘/加购/订单？", "lead/order/add_to_cart, source, landing page", "能回溯到 SEO 页面或关键词主题", "有流量无转化路径；询盘无法归因", "", "补 CTA / 产品页 / 表单路径"],
  ];
  sheet.getRange("A13:G18").values = signalRows;
  styleTable(sheet, "A13:G18");
  sheet.tables.add("A13:G18", true, "MonthlySignalTable");

  const actionRules = [
    ["机会类型", "触发条件", "优先动作", "不要做什么", "回流位置"],
    ["Quick Win", "当前排名 11-30 或 GSC 有曝光且已有承接页", "补内链、补 FAQ、补对比段落、优化标题摘要", "不要直接新写重复文章", "内容中枢/优化旧文"],
    ["Blog Supporting", "产品/集合页需要解释型或导购型内容支撑", "写支持文章，并规划到父级商业页的自然内链", "不要让博客抢产品页主词", "生产/内容日历"],
    ["Product Page Needed", "GSC 有商业需求但无产品/集合页承接", "规划产品页或集合页，再决定是否补博客", "不要用博客硬承接购买词", "页面规划"],
    ["Internal Link", "已有页面有曝光/停留，但排名或点击弱", "从相关旧文、新文、集合页补内链", "不要堆同一锚文本", "内链任务"],
    ["Update Old Page", "旧文已有排名/曝光但内容薄、过期或 CTR 弱", "重写标题、补内容、补图片/表格/FAQ", "不要另开一篇重复意图", "内容优化"],
    ["Monitor", "有苗头但数据不足", "进入观察列表，下月复查", "不要过早投入生产资源", "待办"],
  ];
  sheet.getRange("A22:E28").values = actionRules;
  styleTable(sheet, "A22:E28");
  sheet.tables.add("A22:E28", true, "MonthlyActionRuleTable");
  sheet.freezePanes.freezeRows(5);
}

function buildGscRankSheet() {
  const sheet = createSheet(
    "GSC排名校验",
    "GSC + 当前排名校验：不要把 GSC 均位当实时排名",
    "把 GSC 查询词和当前排名 provider 结果放在一起看，判断是 Quick Win、产品页缺失、博客支撑、内链，还是先观察。",
    "A1:S1",
  );
  setWidths(sheet, [150, 140, 100, 90, 110, 90, 110, 130, 90, 210, 210, 90, 120, 130, 150, 80, 220, 130, 160]);
  const headers = [
    "查询词",
    "主题集群",
    "目标市场",
    "GSC Clicks",
    "GSC Impressions",
    "GSC CTR",
    "GSC Avg Position",
    "当前排名 Provider",
    "当前排名",
    "当前排名 URL",
    "预期承接 URL",
    "URL匹配",
    "当前URL类型",
    "预期页面类型",
    "机会类型",
    "优先级",
    "建议动作",
    "回流位置",
    "备注",
  ];
  const rows = Array.from({ length: 100 }, (_, i) => {
    if (i === 0) return headers;
    return ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""];
  });
  sheet.getRange("A5:S104").values = rows;
  sheet.getRange("F6").formulas = [["=IFERROR(D6/E6,0)"]];
  sheet.getRange("F6:F104").fillDown();
  sheet.getRange("A5:S104").format.rowHeightPx = 42;
  styleTable(sheet, "A5:S104");
  sheet.getRange("D6:G104").format.numberFormat = "#,##0.0";
  sheet.getRange("F6:F104").format.numberFormat = "0.0%";
  addValidation(sheet.getRange("L6:L104"), ["匹配", "不匹配", "待确认"]);
  addValidation(sheet.getRange("M6:M104"), ["博客", "产品页", "集合页", "支柱页", "FAQ", "首页", "未知"]);
  addValidation(sheet.getRange("N6:N104"), ["博客", "产品页", "集合页", "支柱页", "FAQ", "暂不做"]);
  addValidation(sheet.getRange("O6:O104"), ["Quick Win", "Blog Supporting", "Product Page Needed", "Internal Link", "Update Old Page", "Monitor"]);
  addValidation(sheet.getRange("P6:P104"), ["P0", "P1", "P2", "P3"]);
  addValidation(sheet.getRange("R6:R104"), ["内容中枢", "生产", "页面规划", "内链任务", "内容优化", "待办"]);
  sheet.tables.add("A5:S104", true, "GscRankValidationTable");
  sheet.freezePanes.freezeRows(5);
}

function buildGa4Sheet() {
  const sheet = createSheet(
    "GA4质量分析",
    "GA4 站内行为质量：看流量值不值钱，而不是只看访问量",
    "用于判断目标国家、入口页、渠道和停留质量。分数只是辅助判断，最终仍要结合关键词意图、页面承接和转化路径。",
    "A1:N1",
  );
  setWidths(sheet, [130, 100, 180, 100, 140, 90, 90, 90, 110, 90, 120, 90, 170, 220]);
  sheet.getRange("A4:B4").values = [["目标国家", ""]];
  sheet.getRange("A4:B4").format = {
    fill: colors.greenLight,
    font: { bold: true, color: colors.text },
    borders: { preset: "all", style: "thin", color: colors.border },
  };
  const headers = [
    "站点",
    "市场",
    "入口页",
    "国家",
    "Source / Medium",
    "Active Users",
    "Sessions",
    "Views",
    "Engagement Rate",
    "Bounce Rate",
    "Avg Time Sec",
    "质量分",
    "建议动作",
    "备注",
  ];
  const rows = Array.from({ length: 100 }, (_, i) => {
    if (i === 0) return headers;
    return ["", "", "", "", "", "", "", "", "", "", "", "", "", ""];
  });
  sheet.getRange("A7:N106").values = rows;
  sheet.getRange("L8").formulas = [["=IFERROR(IF(I8>=0.45,25,IF(I8>=0.30,15,5))+IF(J8<=0.55,20,IF(J8<=0.75,10,0))+IF(K8>=120,25,IF(K8>=60,15,5))+IF(F8>=20,15,5)+IF(D8=$B$4,15,5),0)"]];
  sheet.getRange("L8:L106").fillDown();
  styleTable(sheet, "A7:N106");
  sheet.getRange("F8:H106").format.numberFormat = "#,##0";
  sheet.getRange("I8:J106").format.numberFormat = "0.0%";
  sheet.getRange("K8:L106").format.numberFormat = "#,##0";
  addValidation(sheet.getRange("M8:M106"), ["强化 CTA", "补内链", "优化标题摘要", "更新内容", "观察", "暂缓", "做转化路径"]);
  sheet.tables.add("A7:N106", true, "Ga4QualityTable");
  sheet.freezePanes.freezeRows(7);
}

function buildActionPlanSheet() {
  const sheet = createSheet(
    "月度ActionPlan",
    "下月 Action Plan：把复盘结果回流到内容中枢、生产、发布和待办",
    "这张表是月度复盘的最终产物。不是每一行都写新文章：有些需要更新旧文，有些需要补内链，有些应该规划产品页/集合页，有些只需要观察。",
    "A1:P1",
  );
  setWidths(sheet, [80, 150, 160, 170, 130, 210, 210, 130, 220, 160, 110, 100, 100, 120, 140, 180]);
  const headers = [
    "优先级",
    "任务类型",
    "来源信号",
    "关键词 / 主题",
    "目标站点",
    "当前 URL",
    "目标 URL",
    "页面类型",
    "建议动作",
    "预期收益",
    "状态",
    "负责人",
    "截止日期",
    "是否推送",
    "复盘指标",
    "备注",
  ];
  const rows = Array.from({ length: 100 }, (_, i) => {
    if (i === 0) return headers;
    return ["", "", "", "", "", "", "", "", "", "", "待做", "", "", "", "", ""];
  });
  sheet.getRange("A5:P104").values = rows;
  styleTable(sheet, "A5:P104");
  addValidation(sheet.getRange("A6:A104"), ["P0", "P1", "P2", "P3"]);
  addValidation(sheet.getRange("B6:B104"), ["Quick Win", "Blog Supporting", "Product Page Needed", "Internal Link", "Update Old Page", "Technical Fix", "Monitor"]);
  addValidation(sheet.getRange("H6:H104"), ["博客", "产品页", "集合页", "支柱页", "FAQ", "技术任务"]);
  addValidation(sheet.getRange("K6:K104"), ["待做", "生成中", "待审核", "已发布", "已完成", "待复盘", "暂缓"]);
  addValidation(sheet.getRange("N6:N104"), ["未推送", "内容中枢", "生产", "页面规划", "内链任务", "待办"]);
  sheet.getRange("M6:M104").format.numberFormat = "yyyy-mm-dd";
  sheet.tables.add("A5:P104", true, "MonthlyActionPlanTable");
  sheet.freezePanes.freezeRows(5);
}

function buildReviewPromptSheet() {
  const sheet = createSheet(
    "复盘AI Prompt",
    "AI 复盘 Prompt：让 AI 按月度复盘口径输出结论和动作",
    "把这张表交给 AI 时，它应该先识别数据源和市场是否匹配，再做结论、机会分类、优先级和下月任务，不允许直接把所有词都变成文章。",
    "A1:H1",
  );
  setWidths(sheet, [130, 190, 230, 220, 210, 180, 180, 180]);
  const rows = [
    ["模块", "AI要做什么", "输入", "判断标准", "输出", "禁止事项", "适用阶段", "备注"],
    ["角色设定", "你是 Google SEO 月度复盘和内容增长策略助手", "网站定位、关键词池、文章库存、GSC、排名、GA4、询盘/订单", "先判断数据是否同市场/同语言/同站点", "复盘结论 + Action Plan", "不要直接写文章；不要忽略数据缺口", "全流程", "先问数据是否足够，再输出"],
    ["需求判断", "用 GSC 判断真实需求是否成立", "query/page/clicks/impressions/ctr/avg position", "曝光和点击是本站真实信号；GSC 均位不是当前排名", "需求成立/不足/待观察", "只看 Semrush 搜索量下结论", "月度复盘", ""],
    ["承接判断", "用当前排名和排名 URL 判断页面是否承接正确", "rank, ranking_url, expected_url, URL type", "当前 URL 与预期页面类型是否一致", "URL 匹配/错配/缺页", "把 URL 错配词继续拿去写新文章", "GSC排名校验", ""],
    ["行为判断", "用 GA4 判断流量质量", "country/source/landing/users/sessions/engagement/bounce/time", "是否目标国家、停留是否足够、入口页是否匹配", "高质量/低质量/需优化", "只看访问量不看质量", "GA4质量分析", ""],
    ["商业判断", "用询盘/订单/加购判断 SEO 商业价值", "lead/order/add_to_cart/value/source/page", "能否追到页面或主题；是否有转化路径", "商业贡献/路径缺口/无法归因", "有流量就判断成功", "月度复盘", ""],
    ["机会分类", "把机会分成具体动作", "GSC + 当前排名 + 文章库存 + GA4", "Quick Win / Blog Supporting / Product Page Needed / Internal Link / Update Old Page / Monitor", "机会类型 + P0/P1/P2/P3", "所有词都写文章", "Action Plan", ""],
    ["任务回流", "把任务推到正确系统模块", "机会类型、目标站点、目标 URL、现有文章", "新写进生产；旧文进优化；产品页进页面规划；内链进内链任务", "月度ActionPlan", "Product Page Needed 直接写博客", "内容中枢/生产", ""],
    ["输出格式", "按表格输出可执行结果", "所有可用数据", "每条任务必须有优先级、动作、目标 URL/站点、复盘指标", "Markdown 总结 + Action Plan 表格", "输出空泛建议", "交付", "可复制到网页端任务池"],
  ];
  sheet.getRange(`A5:H${4 + rows.length}`).values = rows;
  styleTable(sheet, `A5:H${4 + rows.length}`);
  sheet.tables.add(`A5:H${4 + rows.length}`, true, "ReviewAiPromptTable");
  sheet.freezePanes.freezeRows(5);
}

addStandardClosureSection();
buildDataSourcesSheet();
buildMonthlyControlSheet();
buildGscRankSheet();
buildGa4Sheet();
buildActionPlanSheet();
buildReviewPromptSheet();

await fs.mkdir(outputDir, { recursive: true });

const addedSheets = ["数据源中心", "月度复盘总控", "GSC排名校验", "GA4质量分析", "月度ActionPlan", "复盘AI Prompt"];
for (const sheetName of addedSheets) {
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(`${outputDir}/${sheetName}.png`, new Uint8Array(await preview.arrayBuffer()));
}

const errorScan = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
await fs.writeFile(`${outputDir}/enhanced_formula_error_scan.ndjson`, errorScan.ndjson, "utf8");

const sheetSummary = await workbook.inspect({
  kind: "sheet,table",
  maxChars: 12000,
  tableMaxRows: 4,
  tableMaxCols: 8,
  tableMaxCellChars: 80,
});
await fs.writeFile(`${outputDir}/enhanced_workbook_inspect.ndjson`, sheetSummary.ndjson, "utf8");

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);

console.log(`Saved ${outputPath}`);
