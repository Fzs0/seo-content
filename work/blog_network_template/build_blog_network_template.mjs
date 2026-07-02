import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "..", "..");
const outputDir = path.join(rootDir, "outputs/blog_network_framework");
const previewDir = path.join(outputDir, "previews");
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const workbook = Workbook.create();

const theme = {
  ink: "#15231B",
  green: "#214E3A",
  green2: "#DDEFE5",
  mint: "#F4FAF6",
  amber: "#FFF1C9",
  red: "#B42318",
  red2: "#FEE4E2",
  blue: "#EAF2FF",
  gray: "#E4E7EC",
  white: "#FFFFFF",
};

function addSheet(name) {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;
  return sheet;
}

function title(sheet, range, text, subtitle = "") {
  sheet.getRange(range).merge();
  sheet.getRange(range).values = [[text]];
  sheet.getRange(range).format = {
    fill: theme.green,
    font: { bold: true, color: theme.white, size: 16 },
    wrapText: true,
  };
  if (subtitle) {
    const row = Number(range.match(/\d+/)?.[0] ?? 1) + 1;
    sheet.getRange(`A${row}:H${row}`).merge();
    sheet.getRange(`A${row}:H${row}`).values = [[subtitle]];
    sheet.getRange(`A${row}:H${row}`).format = {
      fill: theme.green2,
      font: { color: theme.ink },
      wrapText: true,
    };
  }
}

function header(range) {
  range.format = {
    fill: theme.green,
    font: { bold: true, color: theme.white },
    wrapText: true,
    horizontalAlignment: "center",
    verticalAlignment: "middle",
  };
}

function block(range) {
  range.format = {
    fill: theme.mint,
    borders: { preset: "inside", style: "thin", color: theme.gray },
    wrapText: true,
    verticalAlignment: "top",
  };
}

function section(sheet, range, text) {
  sheet.getRange(range).merge();
  sheet.getRange(range).values = [[text]];
  sheet.getRange(range).format = {
    fill: theme.amber,
    font: { bold: true, color: theme.ink },
    wrapText: true,
    borders: { preset: "outside", style: "thin", color: theme.gray },
  };
}

function widths(sheet, map) {
  for (const [col, width] of Object.entries(map)) {
    sheet.getRange(`${col}:${col}`).format.columnWidth = width;
  }
}

function listValidation(sheet, range, values) {
  sheet.getRange(range).dataValidation = { rule: { type: "list", values } };
}

function wholeValidation(sheet, range, min, max) {
  sheet.getRange(range).dataValidation = {
    rule: { type: "whole", operator: "between", formula1: min, formula2: max },
  };
}

const guide = addSheet("使用说明");
title(guide, "A1:H1", "主站 + 3个博客站关键词分配模板", "目标：让每个关键词只有一个主攻站点和主攻URL，避免站点之间互抢，同时控制外链风险。");
widths(guide, { A: 18, B: 30, C: 34, D: 30, E: 28, F: 28, G: 28, H: 24 });
guide.getRange("A4:H4").merge();
guide.getRange("A4:H4").values = [["核心原则：不要为了外链而建站。每个博客站都必须有独立主题、独立用户价值、独立内容角度；链接主站只能是自然导流，不要每篇文章机械插入商业锚文本。"]];
guide.getRange("A4:H4").format = { fill: theme.amber, font: { bold: true, color: theme.ink }, wrapText: true };
guide.getRange("A6:H6").values = [["步骤", "要做什么", "判断标准", "输出结果", "主站做什么", "博客站做什么", "风险控制", "备注"]];
header(guide.getRange("A6:H6"));
guide.getRange("A7:H14").values = [
  ["1. 定站点角色", "先在「站点定位」定义主站和3个博客站", "每个站必须有不同人群/意图/内容角度", "站点矩阵定位", "承接成交词", "承接知识/场景/对比词", "不要四个站都写同一类内容", ""],
  ["2. 导入关键词", "从 Semrush/GSC/竞品导出关键词", "保留 Volume、CPC、KD、Intent、SERP 类型", "关键词池", "保留交易词和品牌词", "保留信息词、场景词、对比词", "不要只看搜索量", ""],
  ["3. 分配主攻站点", "每个关键词只选择一个主攻站点", "主站=成交；博客A=知识教程；博客B=人群场景；博客C=对比评测", "主攻站点", "避免被博客抢成交词", "避免博客之间抢词", "同一关键词不能多个站主攻", ""],
  ["4. 指定主攻URL", "给每个关键词指定唯一URL", "URL 未定时先写建议URL", "主攻URL", "分类页/集合页/商品页", "文章URL", "无URL则不进入生产", ""],
  ["5. 判断是否外链", "只在高度相关时链接主站", "链接目的必须是帮助用户下一步决策", "是否允许链接主站", "被自然提及", "自然导流", "少用精确匹配商业锚文本", ""],
  ["6. 内容排期", "P0/P1 进入内容日历", "一个站点先打透一个主题簇", "发布计划", "更新商业页", "发布支持内容", "不要所有站同日大量发同类文", ""],
  ["7. 复盘冲突", "看 GSC/Semrush 排名 URL", "如果多个站抢同词，保留最合适页面", "更新/合并/改内链", "主站优先保留商业词", "博客改长尾角度", "防止关键词内耗", ""],
  ["8. 风险检查", "定期检查外链比例和锚文本", "外链应自然、多样、少量", "风险等级", "承接转化", "提供真实内容价值", "避免PBN化", ""],
];
block(guide.getRange("A7:H14"));
guide.getRange("A7:A14").format = { fill: theme.green2, font: { bold: true, color: theme.ink }, wrapText: true };
guide.freezePanes.freezeRows(6);

const sites = addSheet("站点定位");
title(sites, "A1:H1", "站点定位与分词边界", "先定义每个站的角色，后面分词才不会互抢。你可以把示例替换成自己的真实域名。");
widths(sites, { A: 16, B: 28, C: 26, D: 28, E: 30, F: 30, G: 30, H: 24 });
sites.getRange("A4:H4").values = [["站点", "定位", "主攻搜索意图", "适合关键词", "不适合关键词", "推荐页面类型", "链接主站规则", "备注"]];
header(sites.getRange("A4:H4"));
sites.getRange("A5:H9").values = [
  ["主站", "品牌/商城/成交站", "Transactional + 高商业Commercial", "buy, sale, price, shop, product, collection, brand", "泛知识词、百科定义词", "分类页/集合页/商品页/核心购买指南", "主站不需要反链自己；承接其他站自然导流", "成交优先"],
  ["博客站A", "知识教程站", "Informational", "what is, how to, care, guide, benefits", "强交易词、品牌词", "教程文/百科解释/FAQ/护理指南", "只在用户需要下一步购买时链接主站", "负责教育"],
  ["博客站B", "人群场景站", "Informational + Commercial Investigation", "for curly hair, for acne, for gifts, problem, use case", "纯交易词、泛定义词", "场景解决方案/人群指南/问题解决文", "链接到对应集合页或商品页", "负责场景"],
  ["博客站C", "对比评测站", "Commercial Investigation", "best, vs, alternative, comparison, review, checklist", "品牌导航词、售后教程词", "对比文/榜单/评测/替代方案", "链接到主站购买页时必须自然披露/自然表达", "负责决策"],
  ["暂不做", "低价值或高风险词", "不匹配", "弱相关、超高难度、无商业路径、重复意图", "无", "不建页面", "不链接", "进入观察池"],
];
block(sites.getRange("A5:H9"));
sites.getRange("A5:A9").format = { fill: theme.green2, font: { bold: true, color: theme.ink }, wrapText: true };

const rules = addSheet("分配规则");
title(rules, "A1:H1", "关键词分站规则", "按搜索意图、SERP获胜类型、商业价值和站点角色来决定关键词归属。");
widths(rules, { A: 22, B: 26, C: 24, D: 30, E: 30, F: 24, G: 28, H: 24 });
rules.getRange("A4:H4").values = [["关键词/SERP信号", "搜索意图", "推荐站点", "推荐页面类型", "是否链接主站", "锚文本建议", "风险提示", "示例"]];
header(rules.getRange("A4:H4"));
rules.getRange("A5:H14").values = [
  ["buy / sale / price / shop", "Transactional", "主站", "分类页/集合页/商品页", "不适用", "不适用", "不要给博客站抢成交词", "buy silk pillowcase"],
  ["best / top / recommended", "Commercial", "博客站C", "榜单/购买指南", "可链接", "品牌词/集合页自然短语", "避免每篇都精确匹配锚文本", "best silk pillowcase for hair"],
  ["vs / comparison / alternative", "Commercial", "博客站C", "对比文", "可链接", "see product options / 品牌名", "要有真实比较价值", "silk vs satin pillowcase"],
  ["for + user group", "Mixed", "博客站B", "人群场景文", "可链接", "相关集合页自然短语", "不要与博客C的best词重复", "silk pillowcase for curly hair"],
  ["problem / pain point", "Informational", "博客站B", "问题解决文", "可链接", "低门槛CTA", "避免夸大功效", "pillowcase for frizzy hair"],
  ["how to / care / clean / use", "Informational", "博客站A", "教程文/护理指南", "少量链接", "product care guide / 裸链", "不要硬塞购买链接", "how to wash silk pillowcase"],
  ["what is / benefits / guide", "Informational", "博客站A", "知识文/价值解释", "少量链接", "learn more / 品牌名", "泛定义词要谨慎", "what is mulberry silk"],
  ["brand name / coupon", "Navigational", "主站", "品牌页/优惠页", "不适用", "不适用", "博客站不要截流品牌词", "yourbrand silk pillowcase"],
  ["论坛/百科大站占满SERP", "High Difficulty", "暂不做", "观察/拆长尾", "否", "否", "小站不要硬冲", "what is silk"],
  ["同一词多个站都想写", "Conflict", "只保留一个主攻站点", "重新拆分长尾", "按需要", "多样化", "避免站群内耗", "silk pillowcase benefits"],
];
block(rules.getRange("A5:H14"));

const pool = addSheet("关键词分站表");
title(pool, "A1:AH1", "关键词分站与内容规划表", "把 Semrush 关键词粘进来后，按规则选择主攻站点、目标URL、内容类型和外链策略。");
const poolHeaders = [
  "关键词", "中文含义/备注", "主题簇", "搜索量", "CPC", "KD", "Semrush意图", "SERP获胜类型",
  "商业价值(1-5)", "产品相关度(1-5)", "内容深度(1-5)", "站点适配(1-5)", "竞争风险(1-5)",
  "推荐站点", "人工确认站点", "最终主攻站点", "推荐页面类型", "文章类型", "主攻URL", "父级商业页URL",
  "是否允许链接主站", "推荐锚文本类型", "链接频率", "内容角度", "冲突组", "已有排名URL", "备注",
  "需求分", "商业分", "适配分", "风险扣分", "总分", "优先级", "推荐动作"
];
pool.getRange("A3:AH3").values = [poolHeaders];
header(pool.getRange("A3:AH3"));
widths(pool, {
  A: 28, B: 24, C: 18, D: 11, E: 9, F: 9, G: 14, H: 18,
  I: 14, J: 14, K: 14, L: 14, M: 14, N: 16, O: 16, P: 16,
  Q: 18, R: 18, S: 34, T: 34, U: 16, V: 20, W: 14, X: 30,
  Y: 18, Z: 30, AA: 30, AB: 10, AC: 10, AD: 10, AE: 10, AF: 10, AG: 10, AH: 24,
});
const sample = [
  ["buy silk pillowcase", "购买词", "silk pillowcase", 1300, 2.4, 45, "Transactional", "商品/分类页", 5, 5, 3, 5, 1, "", "", "", "", "", "/collections/silk-pillowcases", "/collections/silk-pillowcases", "否", "不适用", "不适用", "主站成交页", "silk-pillowcase-buy", "", ""],
  ["best silk pillowcase for hair", "榜单/导购", "silk pillowcase", 2400, 1.8, 38, "Commercial", "博客/榜单", 5, 5, 5, 5, 2, "", "", "", "", "", "/blog/best-silk-pillowcase-for-hair", "/collections/silk-pillowcases", "是", "品牌词/自然短语", "1-2次/篇", "按头发类型推荐", "silk-pillowcase-best", "", ""],
  ["silk pillowcase vs satin", "对比词", "silk pillowcase", 1900, 1.2, 32, "Commercial", "博客/对比", 4, 5, 5, 5, 2, "", "", "", "", "", "/blog/silk-vs-satin-pillowcase", "/collections/silk-pillowcases", "是", "自然短语", "1-2次/篇", "差异+适合人群+购买建议", "silk-vs-satin", "", ""],
  ["how to wash silk pillowcase", "护理教程", "silk care", 1600, 0.7, 28, "Informational", "教程/FAQ", 3, 4, 5, 5, 1, "", "", "", "", "", "/blog/how-to-wash-silk-pillowcase", "/products/mulberry-silk-pillowcase", "少量", "裸链/品牌词", "0-1次/篇", "护理步骤+注意事项", "silk-care", "", ""],
  ["silk pillowcase for curly hair", "人群场景", "curly hair", 590, 1.4, 31, "Mixed", "博客/场景", 5, 5, 5, 5, 2, "", "", "", "", "", "/blog/silk-pillowcase-for-curly-hair", "/collections/silk-pillowcases", "是", "相关集合页短语", "1次/篇", "卷发人群痛点解决", "curly-hair", "", ""],
  ["mulberry silk benefits", "价值解释", "mulberry silk", 720, 0.9, 35, "Informational", "博客/指南", 3, 4, 4, 4, 2, "", "", "", "", "", "/blog/mulberry-silk-benefits", "/collections/mulberry-silk", "少量", "learn more/品牌词", "0-1次/篇", "材质教育", "mulberry-silk-info", "", ""],
  ["silk pillowcase coupon", "优惠/品牌截流", "silk pillowcase", 300, 2.1, 44, "Transactional", "优惠页/品牌页", 4, 5, 2, 5, 1, "", "", "", "", "", "/pages/offers", "/pages/offers", "否", "不适用", "不适用", "主站优惠页", "coupon", "", ""],
  ["what is silk", "泛定义词", "silk basics", 5400, 0.2, 78, "Informational", "百科/大站", 1, 2, 2, 2, 5, "", "", "", "", "", "", "", "否", "不适用", "不适用", "暂不做或拆长尾", "silk-definition", "", ""],
];
pool.getRange("A4:AA11").values = sample;
block(pool.getRange("A4:AH203"));
pool.getRange("D4:D203").format.numberFormat = "#,##0";
pool.getRange("E4:E203").format.numberFormat = "0.00";
pool.getRange("F4:M203").format.numberFormat = "0";
pool.getRange("AB4:AF203").format.numberFormat = "0.0";
listValidation(pool, "G4:G203", ["Informational", "Commercial", "Transactional", "Navigational", "Mixed", "Unknown"]);
listValidation(pool, "H4:H203", ["商品/分类页", "集合页", "博客/榜单", "博客/对比", "博客/场景", "教程/FAQ", "博客/指南", "百科/大站", "论坛/社区", "品牌页", "混合"]);
listValidation(pool, "N4:P203", ["主站", "博客站A-知识教程", "博客站B-人群场景", "博客站C-对比评测", "暂不做"]);
listValidation(pool, "Q4:Q203", ["分类页/集合页/商品页", "购买指南", "对比文", "教程文", "场景解决方案", "价值解释文", "FAQ/段落", "品牌页/优惠页", "暂不做"]);
listValidation(pool, "R4:R203", ["不写文章", "榜单/购买指南", "对比文", "教程文", "场景解决方案", "价值解释文", "FAQ/段落", "评测文", "暂不做"]);
listValidation(pool, "U4:U203", ["是", "少量", "否"]);
listValidation(pool, "V4:V203", ["品牌词/自然短语", "自然短语", "裸链/品牌词", "相关集合页短语", "learn more/品牌词", "不适用"]);
listValidation(pool, "W4:W203", ["不适用", "0-1次/篇", "1次/篇", "1-2次/篇"]);
wholeValidation(pool, "I4:M203", 1, 5);

const formulas = [];
for (let r = 4; r <= 203; r += 1) {
  formulas.push([
    `=IF($A${r}="","",IF(OR($G${r}="Transactional",$H${r}="商品/分类页",$H${r}="集合页",$H${r}="品牌页"),"主站",IF(OR($H${r}="博客/榜单",$H${r}="博客/对比",$G${r}="Commercial"),"博客站C-对比评测",IF($H${r}="博客/场景","博客站B-人群场景",IF(OR($H${r}="教程/FAQ",$H${r}="博客/指南",$G${r}="Informational"),"博客站A-知识教程","暂不做")))))`,
    `=IF($A${r}="","",IF($O${r}<>"",$O${r},$N${r}))`,
    `=IF($A${r}="","",IF($P${r}="主站","分类页/集合页/商品页",IF($P${r}="博客站C-对比评测",IF($H${r}="博客/对比","对比文","购买指南"),IF($P${r}="博客站B-人群场景","场景解决方案",IF($P${r}="博客站A-知识教程",IF($H${r}="教程/FAQ","教程文","价值解释文"),"暂不做")))))`,
    `=IF($A${r}="","",IF($Q${r}="分类页/集合页/商品页","不写文章",IF($Q${r}="暂不做","暂不做",$Q${r})))`,
    `=IF($A${r}="","",IF($D${r}>=1000,15,IF($D${r}>=300,12,IF($D${r}>=100,9,IF($D${r}>0,5,0)))))`,
    `=IF($A${r}="","",(($I${r}+$J${r})/10)*25)`,
    `=IF($A${r}="","",(($K${r}+$L${r})/10)*25)`,
    `=IF($A${r}="","",$M${r}*5)`,
    `=IF($A${r}="","",MAX(0,AB${r}+AC${r}+AD${r}-AE${r}))`,
    `=IF($A${r}="","",IF(AF${r}>=70,"P0",IF(AF${r}>=55,"P1",IF(AF${r}>=40,"P2","P3"))))`,
    `=IF($A${r}="","",IF(AG${r}="P0","立即规划",IF(AG${r}="P1","进入本批内容日历",IF(AG${r}="P2","观察/做FAQ或长尾","暂不做或合并"))))`,
  ]);
}
pool.getRange("N4:N203").formulas = formulas.map((row) => [row[0]]);
pool.getRange("P4:R203").formulas = formulas.map((row) => row.slice(1, 4));
pool.getRange("AB4:AH203").formulas = formulas.map((row) => row.slice(4));
pool.getRange("AF4:AF203").conditionalFormats.add("colorScale", {
  criteria: [
    { type: "lowestValue", color: theme.red2 },
    { type: "percentile", value: 50, color: theme.amber },
    { type: "highestValue", color: theme.green2 },
  ],
});
pool.freezePanes.freezeRows(3);
pool.freezePanes.freezeColumns(3);

const link = addSheet("外链导流规则");
title(link, "A1:H1", "博客站到主站的外链/导流规则", "把外链当成用户路径，而不是排名操纵工具。每个链接都要回答：为什么用户此刻需要去主站？");
widths(link, { A: 20, B: 30, C: 30, D: 26, E: 26, F: 30, G: 28, H: 24 });
link.getRange("A4:H4").values = [["规则", "允许做法", "不建议做法", "锚文本", "频率", "适用场景", "风险信号", "备注"]];
header(link.getRange("A4:H4"));
link.getRange("A5:H12").values = [
  ["相关性", "只有文章主题与主站产品高度相关才链接", "无关文章也硬塞主站链接", "自然短语", "按需", "购买前下一步", "链接与正文无关", ""],
  ["锚文本", "品牌词、裸链、自然短语、产品集合自然名", "大量重复精确商业关键词", "品牌词优先", "多样化", "所有博客站", "锚文本高度重复", ""],
  ["频率", "一篇文章 0-2 个主站链接即可", "每篇多处链接同一商业页", "自然", "0-2次/篇", "长文可多一点", "全站模板化插入", ""],
  ["链接位置", "正文中解决下一步问题的位置", "页脚/侧边栏全站链接", "上下文链接", "按需", "教程/对比/榜单", "站群侧边栏互链", ""],
  ["主站承接", "链接到最相关集合页/商品页/指南页", "所有文章都指向首页", "相关页面名", "按需", "用户需要购买/比较", "大量首页链接", ""],
  ["披露", "评测/推荐内容保持真实、公正", "伪装独立评测硬推主站", "自然表达", "按需", "对比评测站", "内容明显自卖自夸", ""],
  ["互链", "少量相关上下文互链", "站点之间大量互相链接", "自然", "少量", "主题相关", "环形站群链接", ""],
  ["复盘", "看链接点击、转化辅助、排名URL冲突", "只看链接数量", "不适用", "每月", "所有站", "博客抢主站交易词", ""],
];
block(link.getRange("A5:H12"));

const calendar = addSheet("内容日历");
title(calendar, "A1:L1", "站点矩阵内容日历", "只把 P0/P1 的关键词排期，每个站点最好先打透一个主题簇。");
widths(calendar, { A: 12, B: 14, C: 16, D: 28, E: 18, F: 18, G: 24, H: 34, I: 28, J: 18, K: 18, L: 26 });
calendar.getRange("A4:L4").values = [["周次", "发布日期", "站点", "主关键词", "主题簇", "文章类型", "父级商业页", "标题草案", "主站链接策略", "Brief状态", "发布状态", "复盘指标"]];
header(calendar.getRange("A4:L4"));
calendar.getRange("A5:L13").values = [
  ["Week 1", "", "主站", "buy silk pillowcase", "silk pillowcase", "分类页优化", "/collections/silk-pillowcases", "Silk Pillowcases Collection", "不适用", "待优化", "待发布", "加购/订单/排名"],
  ["Week 1", "", "博客站C-对比评测", "silk pillowcase vs satin", "silk pillowcase", "对比文", "/collections/silk-pillowcases", "Silk vs Satin Pillowcase: Which One Is Better?", "1个自然链接到集合页", "待写", "待发布", "排名/链接点击"],
  ["Week 2", "", "博客站A-知识教程", "how to wash silk pillowcase", "silk care", "教程文", "/products/mulberry-silk-pillowcase", "How to Wash a Silk Pillowcase Without Ruining It", "0-1个品牌/裸链", "待写", "待发布", "点击/FAQ展现"],
  ["Week 2", "", "博客站B-人群场景", "silk pillowcase for curly hair", "curly hair", "场景解决方案", "/collections/silk-pillowcases", "Are Silk Pillowcases Good for Curly Hair?", "1个相关集合页链接", "待写", "待发布", "点击/商品页点击"],
  ["Week 3", "", "博客站C-对比评测", "best silk pillowcase for hair", "silk pillowcase", "榜单/购买指南", "/collections/silk-pillowcases", "Best Silk Pillowcases for Hair: Selection Guide", "1-2个自然链接", "待写", "待发布", "排名/链接点击"],
  ["Week 3", "", "博客站A-知识教程", "mulberry silk benefits", "mulberry silk", "价值解释文", "/collections/mulberry-silk", "Mulberry Silk Benefits: What Makes It Different?", "0-1个自然链接", "待写", "待发布", "展现/点击"],
  ["Week 4", "", "", "", "", "", "", "", "", "", "", ""],
  ["Week 4", "", "", "", "", "", "", "", "", "", "", ""],
  ["Week 5", "", "", "", "", "", "", "", "", "", "", ""],
];
block(calendar.getRange("A5:L50"));
calendar.getRange("B5:B50").format.numberFormat = "yyyy-mm-dd";
listValidation(calendar, "C5:C50", ["主站", "博客站A-知识教程", "博客站B-人群场景", "博客站C-对比评测", "暂不做"]);
listValidation(calendar, "J5:J50", ["待写", "待补SERP", "待补证据", "已完成Brief", "需更新"]);
listValidation(calendar, "K5:K50", ["待发布", "已发布", "待更新", "已合并"]);
calendar.freezePanes.freezeRows(4);

const dash = addSheet("仪表盘");
title(dash, "A1:H1", "站点矩阵分词仪表盘", "用于检查关键词是否分配均衡、是否存在站点冲突和外链风险。");
widths(dash, { A: 22, B: 14, C: 22, D: 16, E: 22, F: 18, G: 22, H: 18 });
dash.getRange("A4:B4").values = [["指标", "结果"]];
header(dash.getRange("A4:B4"));
dash.getRange("A5:A13").values = [
  ["关键词总数"],
  ["主站关键词"],
  ["博客A关键词"],
  ["博客B关键词"],
  ["博客C关键词"],
  ["暂不做"],
  ["允许链接主站"],
  ["P0关键词"],
  ["P1关键词"],
];
dash.getRange("B5:B13").formulas = [
  ["=COUNTA('关键词分站表'!$A$4:$A$203)"],
  ["=COUNTIF('关键词分站表'!$P$4:$P$203,\"主站\")"],
  ["=COUNTIF('关键词分站表'!$P$4:$P$203,\"博客站A-知识教程\")"],
  ["=COUNTIF('关键词分站表'!$P$4:$P$203,\"博客站B-人群场景\")"],
  ["=COUNTIF('关键词分站表'!$P$4:$P$203,\"博客站C-对比评测\")"],
  ["=COUNTIF('关键词分站表'!$P$4:$P$203,\"暂不做\")"],
  ["=COUNTIF('关键词分站表'!$U$4:$U$203,\"是\")"],
  ["=COUNTIF('关键词分站表'!$AG$4:$AG$203,\"P0\")"],
  ["=COUNTIF('关键词分站表'!$AG$4:$AG$203,\"P1\")"],
];
block(dash.getRange("A5:B13"));
dash.getRange("D4:H4").merge();
dash.getRange("D4:H4").values = [["使用检查清单"]];
dash.getRange("D4:H4").format = { fill: theme.amber, font: { bold: true, color: theme.ink }, wrapText: true };
dash.getRange("D5:H12").values = [
  ["每个关键词是否只有一个最终主攻站点？", "", "", "", ""],
  ["主站是否优先承接交易词和品牌词？", "", "", "", ""],
  ["博客A/B/C是否有清晰不同内容角度？", "", "", "", ""],
  ["是否有博客站抢主站成交词？", "", "", "", ""],
  ["是否每篇文章都有真实独立价值？", "", "", "", ""],
  ["是否避免大量重复精确匹配锚文本？", "", "", "", ""],
  ["是否记录父级商业页和主攻URL？", "", "", "", ""],
  ["是否每月复盘排名URL冲突？", "", "", "", ""],
];
block(dash.getRange("D5:H12"));

for (const sheet of [guide, sites, rules, pool, link, calendar, dash]) {
  const used = sheet.getUsedRange();
  used.format.wrapText = true;
  used.format.verticalAlignment = "top";
}

const inspections = [];
inspections.push(await workbook.inspect({
  kind: "table",
  sheetId: "关键词分站表",
  range: "A3:AH12",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 34,
  maxChars: 9000,
}));
inspections.push(await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
  maxChars: 4000,
}));
await fs.writeFile(path.join(outputDir, "verification.ndjson"), inspections.map((x) => x.ndjson).join("\n"));

for (const sheetName of ["使用说明", "站点定位", "分配规则", "关键词分站表", "外链导流规则", "内容日历", "仪表盘"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, `${sheetName}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path.join(outputDir, "blog_network_keyword_allocation_template.xlsx"));
