import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..", "..");
const outputDir = path.join(projectRoot, "outputs", "yudong_keyword_framework");
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();

const sheets = {
  guide: workbook.worksheets.add("使用说明"),
  pool: workbook.worksheets.add("关键词池"),
  rules: workbook.worksheets.add("评分规则"),
  pages: workbook.worksheets.add("页面规划"),
  content: workbook.worksheets.add("内容规划"),
  dash: workbook.worksheets.add("仪表盘"),
};

function setHeader(range, fill = "#1F4E78") {
  range.format = {
    fill,
    font: { bold: true, color: "#FFFFFF" },
    borders: { preset: "outside", style: "thin", color: "#B7C9D6" },
    wrapText: true,
  };
}

function styleBlock(range, fill = "#F7FAFC") {
  range.format = {
    fill,
    borders: { preset: "outside", style: "thin", color: "#D9E2EC" },
    wrapText: true,
  };
}

for (const sheet of Object.values(sheets)) {
  sheet.showGridLines = false;
}

// 使用说明
sheets.guide.getRange("A1:H1").merge();
sheets.guide.getRange("A1").values = [["Google SEO 关键词研究与页面规划模板"]];
sheets.guide.getRange("A1").format = {
  fill: "#123047",
  font: { bold: true, color: "#FFFFFF", size: 16 },
};
sheets.guide.getRange("A3:H3").merge();
sheets.guide.getRange("A3").values = [["这个模板复刻了视频里能看到的两层结构：先做关键词分类/打分，再映射到页面地图。示例数据用于演示 2C 商城站，不代表真实搜索量。"]];
sheets.guide.getRange("A3").format = { fill: "#EAF4F4", wrapText: true };

sheets.guide.getRange("A5:B12").values = [
  ["使用步骤", "说明"],
  ["1. 填关键词池", "把 Ahrefs/Semrush/GSC/Google SERP 收集到的词放到“关键词池”，补充 Volume、CPC、KD、Intent、SERP 页面类型。"],
  ["2. 人工校正意图", "工具给的 Intent 只能初筛，最终以 Google 首页真实排名页面为准。"],
  ["3. 填业务打分", "Product Fit、Margin Fit、Inventory Fit、SERP Fit、Content Feasibility 都用 1-5 分。"],
  ["4. 看总分和优先级", "Total Score >= 75 为 P0，优先建页或优化现有页。"],
  ["5. 做页面规划", "把 P0/P1 关键词聚合成类目页、筛选集合页、商品页、导购页、FAQ。"],
  ["6. 上线后复查", "用 GSC 看查询词、排名 URL 和点击变化，发现页面抢词时回到本表调整。"],
  ["注意", "本模板是可迁移骨架。B2B 会偏解决方案页和询盘页；2C 要偏类目页、商品页、专题集合页和购买指南。"],
];
setHeader(sheets.guide.getRange("A5:B5"));
styleBlock(sheets.guide.getRange("A6:B12"));
sheets.guide.getRange("A:B").format.columnWidth = 24;
sheets.guide.getRange("B:B").format.columnWidth = 90;

// 评分规则
sheets.rules.getRange("A1:H1").merge();
sheets.rules.getRange("A1").values = [["评分规则与映射表"]];
sheets.rules.getRange("A1").format = { fill: "#123047", font: { bold: true, color: "#FFFFFF", size: 15 } };

sheets.rules.getRange("A3:B8").values = [
  ["当前站点阶段", "新站"],
  ["新站 KD机会分", "KD<=10:15, <=20:12, <=35:8, <=50:4, >50:1"],
  ["成长期 KD机会分", "KD<=20:15, <=35:12, <=50:8, <=70:4, >70:1"],
  ["权威站 KD机会分", "KD<=35:15, <=50:12, <=70:8, <=85:4, >85:1"],
  ["评分总分", "100分：意图20 + 需求15 + KD机会15 + 业务20 + 页面可做15 + 架构10 + 数据置信5"],
  ["建议", "先用工具筛，再用 SERP 校正，最后用业务价值决定是否建页。"],
];
setHeader(sheets.rules.getRange("A3:B3"), "#2F6F73");
styleBlock(sheets.rules.getRange("A4:B8"));
sheets.rules.getRange("B3").format = { fill: "#FFF2CC", font: { bold: true } };

sheets.rules.getRange("A11:B17").values = [
  ["搜索意图", "意图分"],
  ["Transactional", 20],
  ["Commercial", 17],
  ["Mixed", 14],
  ["Informational", 10],
  ["Local", 8],
  ["Navigational", 5],
];
setHeader(sheets.rules.getRange("A11:B11"));
styleBlock(sheets.rules.getRange("A12:B17"));

sheets.rules.getRange("D11:F21").values = [
  ["关键词类型", "建议页面类型", "架构分"],
  ["核心类目词", "分类页/集合页", 10],
  ["属性类目词", "可索引筛选集合页", 9],
  ["产品词", "商品详情页", 8],
  ["SKU/型号词", "商品详情页", 8],
  ["Best/Top词", "专题集合页/购买指南", 7],
  ["比较词", "对比页/导购文章", 7],
  ["问题词", "博客/FAQ/帮助中心", 5],
  ["品牌词", "品牌页/信任页", 5],
  ["场景词", "专题集合页", 7],
  ["B2B解决方案词", "解决方案页", 8],
];
setHeader(sheets.rules.getRange("D11:F11"));
styleBlock(sheets.rules.getRange("D12:F21"));

sheets.rules.getRange("H11:I14").values = [
  ["优先级", "动作建议"],
  ["P0", "立即建页或重点优化"],
  ["P1", "进入本轮内容/页面规划"],
  ["P2", "放入FAQ、段落、内链或后续批次"],
];
sheets.rules.getRange("H15:I15").values = [["P3", "暂缓，仅保留观察"]];
setHeader(sheets.rules.getRange("H11:I11"));
styleBlock(sheets.rules.getRange("H12:I15"));

sheets.rules.getRange("A24:D31").values = [
  ["瑜东视频里可见的关键词表字段", "含义", "2C迁移", "备注"],
  ["Keyword", "原始关键词", "保留", "来自 Ahrefs/Semrush/GSC/SERP 扩展"],
  ["Volume", "月搜索量", "保留", "零搜索量不一定删除，但需要更强业务理由"],
  ["CPC", "广告点击成本", "保留", "2C 可作为购买意图强弱的辅助信号"],
  ["搜索意图", "交易/商业调研/信息/地域", "保留并人工校正", "以 Google 首页真实页面类型为准"],
  ["产品分类", "映射到产品/服务类目", "改成类目/属性/场景/SKU", "这是定页面的核心"],
  ["业务价值", "高/中/低", "改成产品匹配、利润、库存三项", "2C 不能只看询盘价值"],
  ["内容策略", "产品页/落地页/文章/FAQ", "改成集合页、商品页、导购、FAQ", "页面类型服从 SERP"],
];
setHeader(sheets.rules.getRange("A24:D24"));
styleBlock(sheets.rules.getRange("A25:D31"));

sheets.rules.getRange("A:I").format.columnWidth = 23;
sheets.rules.getRange("B:B").format.columnWidth = 65;
sheets.rules.getRange("D:D").format.columnWidth = 22;
sheets.rules.getRange("E:E").format.columnWidth = 28;
sheets.rules.getRange("F:F").format.columnWidth = 12;
sheets.rules.getRange("H:I").format.columnWidth = 24;

// 关键词池
const poolHeaders = [
  "Keyword", "中文含义", "Topic Cluster", "Volume", "CPC", "KD",
  "SERP Intent", "SERP Page Type", "关键词类型", "Product Fit",
  "Margin Fit", "Inventory Fit", "SERP Fit", "Content Feasibility",
  "Data Confidence", "Existing URL", "Parent Topic", "Notes",
  "Intent Score", "Demand Score", "KD Opportunity", "Business Score",
  "Page Fit Score", "Architecture Score", "Confidence Score",
  "Total Score", "Tier", "Recommended Action", "Target Page Type", "Proposed URL"
];
sheets.pool.getRange("A1:AD1").values = [poolHeaders];
setHeader(sheets.pool.getRange("A1:AD1"));

const sampleRows = [
  ["silk pillowcase", "真丝枕套", "Silk Pillowcase", 12100, 1.80, 38, "Commercial", "Category", "核心类目词", 5, 4, 5, 5, 4, 4, "", "silk pillowcase", "主类目词，适合分类页"],
  ["mulberry silk pillowcase", "桑蚕丝枕套", "Silk Pillowcase", 6600, 2.40, 28, "Commercial", "Category", "属性类目词", 5, 5, 5, 5, 4, 4, "", "silk pillowcase", "材质属性强，适合可索引集合页"],
  ["queen silk pillowcase", "Queen 尺寸真丝枕套", "Silk Pillowcase", 1900, 1.20, 22, "Transactional", "Category", "属性类目词", 5, 4, 4, 4, 3, 4, "", "silk pillowcase", "尺寸筛选页，需有足够商品"],
  ["pink silk pillowcase", "粉色真丝枕套", "Silk Pillowcase", 1300, 0.90, 18, "Transactional", "Category", "属性类目词", 4, 4, 4, 4, 3, 4, "", "silk pillowcase", "颜色属性页，商品数不足时不要独立索引"],
  ["best silk pillowcase for hair", "适合护发的真丝枕套", "Silk Pillowcase", 2400, 1.60, 34, "Commercial", "Guide", "Best/Top词", 5, 4, 5, 5, 5, 4, "", "silk pillowcase", "导购页或专题集合页"],
  ["silk pillowcase vs satin", "真丝枕套 vs 缎面枕套", "Silk Pillowcase", 1600, 0.70, 26, "Commercial", "Comparison", "比较词", 4, 3, 5, 5, 5, 4, "", "silk pillowcase", "对比文章，强内链到类目页"],
  ["how to wash silk pillowcase", "如何清洗真丝枕套", "Silk Pillowcase", 2900, 0.35, 19, "Informational", "Article", "问题词", 3, 2, 5, 5, 5, 4, "", "silk pillowcase", "帮助内容，服务已购买和潜在用户"],
  ["silk eye mask", "真丝眼罩", "Silk Eye Mask", 8100, 1.50, 31, "Commercial", "Category", "核心类目词", 5, 4, 5, 5, 4, 4, "", "silk eye mask", "另一个一级类目"],
  ["weighted silk eye mask", "加重真丝眼罩", "Silk Eye Mask", 720, 1.10, 15, "Transactional", "Product", "产品词", 5, 5, 3, 4, 3, 3, "", "silk eye mask", "如果只有1-2个SKU，用商品页"],
  ["travel silk eye mask", "旅行真丝眼罩", "Silk Eye Mask", 390, 0.80, 12, "Transactional", "Category", "场景词", 4, 4, 4, 4, 4, 3, "", "silk eye mask", "场景专题集合页"],
  ["silk hair scrunchies", "真丝发圈", "Silk Accessories", 5400, 1.10, 24, "Commercial", "Category", "核心类目词", 5, 4, 5, 5, 4, 4, "", "silk scrunchies", "可作为独立类目"],
  ["large silk scrunchies", "大号真丝发圈", "Silk Accessories", 880, 0.70, 14, "Transactional", "Category", "属性类目词", 4, 4, 4, 4, 3, 3, "", "silk scrunchies", "属性集合页或筛选页"],
  ["silk bonnet for curly hair", "卷发真丝睡帽", "Silk Bonnet", 4400, 1.90, 36, "Commercial", "Category", "场景词", 5, 4, 4, 5, 5, 4, "", "silk bonnet", "场景意图强，适合专题集合页"],
  ["silk pillowcase amazon", "亚马逊真丝枕套", "Silk Pillowcase", 3600, 0.45, 45, "Navigational", "Marketplace", "品牌词", 2, 2, 5, 2, 2, 3, "", "silk pillowcase", "不建议优先做，SERP偏平台"],
  ["cheap silk pillowcase", "便宜真丝枕套", "Silk Pillowcase", 1000, 0.55, 25, "Transactional", "Category", "属性类目词", 3, 2, 4, 4, 3, 3, "", "silk pillowcase", "价格敏感词，利润差时降级"],
  ["silk pillowcase set", "真丝枕套套装", "Silk Pillowcase", 1700, 1.30, 20, "Transactional", "Product", "产品词", 5, 5, 4, 4, 3, 4, "", "silk pillowcase", "可做套装商品页/集合页"],
];

const rowCount = 60;
const valueRows = [];
for (let i = 0; i < rowCount; i++) {
  if (i < sampleRows.length) {
    valueRows.push([...sampleRows[i], ...Array(12).fill(null)]);
  } else {
    valueRows.push(Array(poolHeaders.length).fill(null));
  }
}
sheets.pool.getRange(`A2:AD${rowCount + 1}`).values = valueRows;

for (let r = 2; r <= rowCount + 1; r++) {
  sheets.pool.getRange(`S${r}`).formulas = [[`=IF(A${r}="","",XLOOKUP(G${r},'评分规则'!$A$12:$A$17,'评分规则'!$B$12:$B$17,0))`]];
  sheets.pool.getRange(`T${r}`).formulas = [[`=IF(A${r}="","",IF(D${r}>=10000,10,IF(D${r}>=3000,9,IF(D${r}>=1000,8,IF(D${r}>=300,7,IF(D${r}>=100,6,IF(D${r}>=30,4,IF(D${r}>=10,3,1)))))))+IF(E${r}>=3,5,IF(E${r}>=1,4,IF(E${r}>=0.3,3,IF(E${r}>0,2,1)))))`]];
  sheets.pool.getRange(`U${r}`).formulas = [[`=IF(A${r}="","",IF('评分规则'!$B$3="新站",IF(F${r}<=10,15,IF(F${r}<=20,12,IF(F${r}<=35,8,IF(F${r}<=50,4,1)))),IF('评分规则'!$B$3="成长期",IF(F${r}<=20,15,IF(F${r}<=35,12,IF(F${r}<=50,8,IF(F${r}<=70,4,1)))),IF(F${r}<=35,15,IF(F${r}<=50,12,IF(F${r}<=70,8,IF(F${r}<=85,4,1)))))))`]];
  sheets.pool.getRange(`V${r}`).formulas = [[`=IF(A${r}="","",ROUND((J${r}*0.45+K${r}*0.30+L${r}*0.25)*4,1))`]];
  sheets.pool.getRange(`W${r}`).formulas = [[`=IF(A${r}="","",ROUND((M${r}*0.60+N${r}*0.40)*3,1))`]];
  sheets.pool.getRange(`X${r}`).formulas = [[`=IF(A${r}="","",XLOOKUP(I${r},'评分规则'!$D$12:$D$21,'评分规则'!$F$12:$F$21,0))`]];
  sheets.pool.getRange(`Y${r}`).formulas = [[`=IF(A${r}="","",O${r})`]];
  sheets.pool.getRange(`Z${r}`).formulas = [[`=IF(A${r}="","",SUM(S${r}:Y${r}))`]];
  sheets.pool.getRange(`AA${r}`).formulas = [[`=IF(A${r}="","",IF(Z${r}>=75,"P0",IF(Z${r}>=60,"P1",IF(Z${r}>=45,"P2","P3"))))`]];
  sheets.pool.getRange(`AB${r}`).formulas = [[`=IF(A${r}="","",XLOOKUP(AA${r},'评分规则'!$H$12:$H$15,'评分规则'!$I$12:$I$15,""))`]];
  sheets.pool.getRange(`AC${r}`).formulas = [[`=IF(A${r}="","",XLOOKUP(I${r},'评分规则'!$D$12:$D$21,'评分规则'!$E$12:$E$21,"人工判断"))`]];
  sheets.pool.getRange(`AD${r}`).formulas = [[`=IF(A${r}="","","/"&LOWER(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(A${r}," / ","-")," ","-"),"+",""))&"/")`]];
}

sheets.pool.tables.add(`A1:AD${rowCount + 1}`, true, "KeywordPool");
sheets.pool.freezePanes.freezeRows(1);
sheets.pool.freezePanes.freezeColumns(3);
sheets.pool.getRange("A:AD").format.font = { name: "Microsoft YaHei", size: 10 };
sheets.pool.getRange("D:F").format.numberFormat = "#,##0.00";
sheets.pool.getRange("J:O").format.numberFormat = "0";
sheets.pool.getRange("S:Z").format.numberFormat = "0.0";
sheets.pool.getRange("Z:Z").format.font = { bold: true };
sheets.pool.getRange("A:A").format.columnWidth = 28;
sheets.pool.getRange("B:C").format.columnWidth = 20;
sheets.pool.getRange("D:F").format.columnWidth = 10;
sheets.pool.getRange("G:I").format.columnWidth = 18;
sheets.pool.getRange("J:O").format.columnWidth = 12;
sheets.pool.getRange("P:R").format.columnWidth = 26;
sheets.pool.getRange("S:Y").format.columnWidth = 14;
sheets.pool.getRange("Z:AD").format.columnWidth = 20;

const listValidations = [
  ["G2:G61", ["Transactional", "Commercial", "Mixed", "Informational", "Local", "Navigational"]],
  ["H2:H61", ["Product", "Category", "Collection", "Guide", "Comparison", "FAQ", "Home", "Marketplace", "Mixed", "Article"]],
  ["I2:I61", ["核心类目词", "属性类目词", "产品词", "SKU/型号词", "Best/Top词", "比较词", "问题词", "品牌词", "场景词", "B2B解决方案词"]],
];
for (const [range, values] of listValidations) {
  sheets.pool.getRange(range).dataValidation = { rule: { type: "list", values } };
}
sheets.pool.getRange("J2:O61").dataValidation = { rule: { type: "whole", operator: "between", formula1: 1, formula2: 5 } };

// 页面规划
const pageHeaders = ["层级", "页面名称", "主关键词", "URL路径", "父页面", "页面类型", "搜索意图", "建议优先级", "审计状态", "内容要求", "内链目标"];
sheets.pages.getRange("A1:K1").values = [pageHeaders];
setHeader(sheets.pages.getRange("A1:K1"));
sheets.pages.getRange("A2:K13").values = [
  ["L1", "Silk Pillowcase", "silk pillowcase", "/silk-pillowcase/", "-", "分类页/集合页", "Commercial", "P0", "Draft", "类目介绍、材质、尺寸、评价、FAQ、商品网格", "商品页、导购页、清洗指南"],
  ["L2", "Mulberry Silk Pillowcase", "mulberry silk pillowcase", "/silk-pillowcase/mulberry-silk/", "Silk Pillowcase", "可索引筛选集合页", "Commercial", "P0", "Draft", "解释材质差异、产品集合、评价、FAQ", "Silk Pillowcase 主类目"],
  ["L2", "Queen Silk Pillowcase", "queen silk pillowcase", "/silk-pillowcase/queen-size/", "Silk Pillowcase", "可索引筛选集合页", "Transactional", "P1", "Draft", "尺寸筛选、库存足够时索引", "Silk Pillowcase 主类目"],
  ["L2", "Pink Silk Pillowcase", "pink silk pillowcase", "/silk-pillowcase/pink/", "Silk Pillowcase", "可索引筛选集合页", "Transactional", "P1", "Draft", "颜色页，商品少时先 noindex 或合并", "Silk Pillowcase 主类目"],
  ["L1", "Silk Eye Mask", "silk eye mask", "/silk-eye-mask/", "-", "分类页/集合页", "Commercial", "P0", "Draft", "类目页，突出使用场景、睡眠、旅行、礼品", "商品页、旅行专题"],
  ["L2", "Travel Silk Eye Mask", "travel silk eye mask", "/silk-eye-mask/travel/", "Silk Eye Mask", "专题集合页", "Transactional", "P1", "Draft", "旅行场景集合页，强调便携和遮光", "Silk Eye Mask 主类目"],
  ["L1", "Silk Hair Scrunchies", "silk hair scrunchies", "/silk-scrunchies/", "-", "分类页/集合页", "Commercial", "P0", "Draft", "类目页，强调不扯发、礼盒、颜色组合", "商品页"],
  ["Blog", "Best Silk Pillowcase for Hair", "best silk pillowcase for hair", "/blog/best-silk-pillowcase-for-hair/", "Silk Pillowcase", "购买指南", "Commercial", "P1", "Draft", "榜单/选购标准/推荐商品/FAQ", "Silk Pillowcase 分类页"],
  ["Blog", "Silk Pillowcase vs Satin", "silk pillowcase vs satin", "/blog/silk-pillowcase-vs-satin/", "Silk Pillowcase", "对比文章", "Commercial", "P1", "Draft", "对比表、材质证据、购买建议", "Silk Pillowcase 分类页"],
  ["Help", "How to Wash Silk Pillowcase", "how to wash silk pillowcase", "/help/how-to-wash-silk-pillowcase/", "Silk Pillowcase", "帮助/FAQ", "Informational", "P2", "Draft", "护理步骤、禁忌、售后链接", "Silk Pillowcase 商品页"],
  ["L2", "Silk Pillowcase Set", "silk pillowcase set", "/silk-pillowcase/sets/", "Silk Pillowcase", "集合页/商品页", "Transactional", "P1", "Draft", "套装商品、优惠、搭配购买", "购物车促销/相关商品"],
  ["Observe", "Silk Pillowcase Amazon", "silk pillowcase amazon", "", "-", "暂缓", "Navigational", "P3", "Hold", "SERP偏平台，不作为优先页面", "无"],
];
sheets.pages.tables.add("A1:K13", true, "PageMap");
sheets.pages.freezePanes.freezeRows(1);
sheets.pages.getRange("A:K").format.columnWidth = 22;
sheets.pages.getRange("J:K").format.columnWidth = 42;
sheets.pages.getRange("A:K").format.wrapText = true;

// 内容规划
const contentHeaders = ["Cluster", "Supporting Keyword", "内容类型", "用户问题", "页面目标", "CTA/内链", "发布阶段", "状态", "需要的证据/素材"];
sheets.content.getRange("A1:I1").values = [contentHeaders];
setHeader(sheets.content.getRange("A1:I1"));
sheets.content.getRange("A2:I11").values = [
  ["Silk Pillowcase", "best silk pillowcase for hair", "购买指南", "用户想知道哪种枕套对头发更好", "商业调研转化", "链接到 /silk-pillowcase/", "第1批", "Draft", "材质、momme、评价、前后对比"],
  ["Silk Pillowcase", "silk pillowcase vs satin", "对比文章", "用户在真丝和缎面之间比较", "解释差异并导购", "链接到类目页和热卖商品", "第1批", "Draft", "材质定义、价格、耐用性、护理"],
  ["Silk Pillowcase", "how to wash silk pillowcase", "帮助/FAQ", "用户想知道如何护理", "降低售后疑虑", "链接到商品页和护理用品", "第2批", "Draft", "洗涤说明、图片、短视频"],
  ["Silk Eye Mask", "travel silk eye mask", "场景页", "旅行时需要遮光和便携", "场景转化", "链接到眼罩分类页", "第1批", "Draft", "场景图、尺寸、收纳袋"],
  ["Silk Accessories", "large silk scrunchies", "属性集合页", "用户找大号发圈", "承接属性需求", "链接到发圈类目", "第2批", "Draft", "产品数量、颜色、尺寸说明"],
  ["Silk Bonnet", "silk bonnet for curly hair", "专题集合页", "卷发用户找睡帽", "场景转化", "链接到睡帽商品", "第1批", "Draft", "发质场景、尺码、评价"],
  ["Brand Trust", "is mulberry silk worth it", "信任内容", "用户担心价格是否值得", "建立信任", "链接到材质说明和类目页", "第2批", "Draft", "证书、材质、生产说明"],
  ["Support", "silk pillowcase return policy", "帮助页", "用户买前看退换货", "降低购买阻力", "链接到退换货政策", "第3批", "Draft", "政策、时效、流程"],
  ["Comparison", "silk pillowcase set vs single", "对比/FAQ", "用户选择单只还是套装", "提升客单价", "链接到套装页", "第2批", "Draft", "价格、礼品场景、搭配"],
  ["Seasonal", "silk gifts for mom", "专题集合页", "礼品场景", "节日转化", "链接到礼品集合", "第3批", "Draft", "礼盒、评价、配送时间"],
];
sheets.content.tables.add("A1:I11", true, "ContentPlan");
sheets.content.freezePanes.freezeRows(1);
sheets.content.getRange("A:I").format.columnWidth = 24;
sheets.content.getRange("D:I").format.columnWidth = 34;
sheets.content.getRange("A:I").format.wrapText = true;

// 仪表盘
sheets.dash.getRange("A1:G1").merge();
sheets.dash.getRange("A1").values = [["关键词池摘要"]];
sheets.dash.getRange("A1").format = { fill: "#123047", font: { bold: true, color: "#FFFFFF", size: 15 } };
sheets.dash.getRange("A3:B8").values = [
  ["总关键词数", null],
  ["P0 数量", null],
  ["P1 数量", null],
  ["平均总分", null],
  ["平均 KD", null],
  ["平均 CPC", null],
];
sheets.dash.getRange("B3").formulas = [["=COUNTA('关键词池'!A2:A61)"]];
sheets.dash.getRange("B4").formulas = [["=COUNTIF('关键词池'!AA2:AA61,\"P0\")"]];
sheets.dash.getRange("B5").formulas = [["=COUNTIF('关键词池'!AA2:AA61,\"P1\")"]];
sheets.dash.getRange("B6").formulas = [["=AVERAGEIF('关键词池'!Z2:Z61,\">0\")"]];
sheets.dash.getRange("B7").formulas = [["=AVERAGEIF('关键词池'!F2:F61,\">0\")"]];
sheets.dash.getRange("B8").formulas = [["=AVERAGEIF('关键词池'!E2:E61,\">0\")"]];
setHeader(sheets.dash.getRange("A3:B3"), "#2F6F73");
styleBlock(sheets.dash.getRange("A4:B8"));
sheets.dash.getRange("B6:B8").format.numberFormat = "0.0";

sheets.dash.getRange("D3:F8").values = [
  ["决策口径", "解释", "落地动作"],
  ["P0", "高意图、高业务匹配、页面可承接", "本轮建页/优化"],
  ["P1", "价值明确但需要补内容或资源", "排入内容计划"],
  ["P2", "信息型或机会一般", "FAQ/博客/内链"],
  ["P3", "平台意图、低匹配或难度过高", "暂缓观察"],
  ["复查", "上线后看 GSC 查询词和排名 URL", "合并/内链/canonical/重写"],
];
setHeader(sheets.dash.getRange("D3:F3"), "#2F6F73");
styleBlock(sheets.dash.getRange("D4:F8"));
sheets.dash.getRange("A:F").format.columnWidth = 24;
sheets.dash.getRange("E:F").format.columnWidth = 38;

// Conditional formatting for priority/score.
sheets.pool.getRange("Z2:Z61").conditionalFormats.add("colorScale", {
  thresholds: ["min", "50%", "max"],
  colors: ["#F8D7DA", "#FFF3CD", "#D1E7DD"],
});
sheets.pool.getRange("AA2:AA61").conditionalFormats.add("containsText", {
  text: "P0",
  format: { fill: "#D1E7DD", font: { bold: true, color: "#0F5132" } },
});
sheets.pool.getRange("AA2:AA61").conditionalFormats.add("containsText", {
  text: "P3",
  format: { fill: "#F8D7DA", font: { bold: true, color: "#842029" } },
});

// Render previews for verification.
for (const sheetName of ["关键词池", "评分规则", "页面规划", "仪表盘"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(`${outputDir}/${sheetName}.png`, new Uint8Array(await preview.arrayBuffer()));
}

const check = await workbook.inspect({
  kind: "table",
  range: "关键词池!A1:AD18",
  include: "values,formulas",
  tableMaxRows: 18,
  tableMaxCols: 30,
  maxChars: 5000,
});
console.log(check.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "formula error scan",
});
console.log(errors.ndjson);

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(`${outputDir}/google_seo_keyword_scoring_template.xlsx`);
