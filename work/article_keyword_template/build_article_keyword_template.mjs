import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "..", "..");
const outputDir = path.join(rootDir, "outputs/article_keyword_framework");
const previewDir = path.join(outputDir, "previews");
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const workbook = Workbook.create();

const theme = {
  ink: "#172019",
  muted: "#56615A",
  green: "#275E45",
  green2: "#DDEFE5",
  mint: "#F2F8F4",
  amber: "#F4B942",
  amber2: "#FFF3D3",
  red: "#C2410C",
  red2: "#FEE2D5",
  blue: "#2563EB",
  blue2: "#EAF1FF",
  gray: "#E6E8E6",
  light: "#FBFCF9",
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
    sheet.getRange(`A${row}:H${row}`).format.rowHeight = 34;
  }
}

function section(sheet, range, text) {
  sheet.getRange(range).merge();
  sheet.getRange(range).values = [[text]];
  sheet.getRange(range).format = {
    fill: theme.amber2,
    font: { bold: true, color: theme.ink },
    wrapText: true,
    borders: { preset: "outside", style: "thin", color: theme.gray },
  };
}

function styleHeader(range) {
  range.format = {
    fill: theme.green,
    font: { bold: true, color: theme.white },
    wrapText: true,
    horizontalAlignment: "center",
    verticalAlignment: "middle",
  };
}

function styleBlock(range) {
  range.format = {
    fill: theme.light,
    borders: { preset: "inside", style: "thin", color: theme.gray },
    wrapText: true,
    verticalAlignment: "top",
  };
}

function setWidths(sheet, widths) {
  for (const [col, width] of Object.entries(widths)) {
    sheet.getRange(`${col}:${col}`).format.columnWidth = width;
  }
}

function setValidation(sheet, range, values) {
  sheet.getRange(range).dataValidation = {
    rule: { type: "list", values },
  };
}

function setWholeNumberValidation(sheet, range, min, max) {
  sheet.getRange(range).dataValidation = {
    rule: { type: "whole", operator: "between", formula1: min, formula2: max },
  };
}

const standard = addSheet("标准骨架");
title(
  standard,
  "A1:H1",
  "关键词到文章规划标准骨架",
  "这张表用于交接给人或 AI：先理解网站定位，再做关键词分流、文章评分、Brief 和内容日历。"
);
setWidths(standard, { A: 16, B: 24, C: 34, D: 34, E: 30, F: 28, G: 28, H: 26 });
standard.getRange("A4:H4").merge();
standard.getRange("A4:H4").values = [["核心原则：不要把所有关键词都拿来写文章。先判断这个关键词在 Google 里应该由哪种页面承接，再决定写博客、做分类页、做产品页、合并到 FAQ，还是暂时不做。"]];
standard.getRange("A4:H4").format = { fill: theme.amber2, font: { bold: true, color: theme.ink }, wrapText: true };
standard.getRange("A6:H6").values = [["阶段", "目标", "操作", "判断口径", "输出物", "AI必须遵守", "常见错误", "通过标准"]];
styleHeader(standard.getRange("A6:H6"));
standard.getRange("A7:H15").values = [
  ["0. 网站定位", "明确商业模型和内容边界", "填写「网站定位输入卡」", "网站是 2C 商城、B2B 询盘站，还是内容站；目标是下单、加购、询盘还是订阅", "网站定位说明", "没有定位信息时，先让用户补齐，不要直接规划文章", "套用别人的 B2B 方法到 2C 商城", "能说清楚核心产品、目标人群、成交页面"],
  ["1. 关键词收集", "建立完整关键词池", "从 Semrush/GSC/竞品/站内搜索导入词", "保留搜索量、KD、CPC、Intent、URL、国家/语言", "原始关键词池", "不要只按搜索量排序", "删掉低搜索量但高转化长尾词", "每个词至少有主题簇或产品线归属"],
  ["2. 关键词分流", "决定承接页面类型", "人工查看 Google 前 10 名 SERP", "前排是什么页面：商品/分类/集合/博客/指南/对比/FAQ/品牌首页", "页面类型判断", "SERP 文章占比低于 4 时，不建议单独写博客", "买词写博客，信息词做商品页", "每个词有明确页面类型"],
  ["3. 商业映射", "让内容服务成交", "给每个候选文章词指定父级商业页", "文章能否自然链接到分类页、集合页、商品页", "父级商业页 + 目标URL", "没有父级商业页的文章默认降级", "博客孤岛化", "每篇文章至少支撑 1 个成交页面"],
  ["4. 文章评分", "筛出值得写的文章词", "按 7 维 100 分评分", "SERP匹配、商业支撑、需求、难度、内容深度、主题内链、更新价值", "P0/P1/P2/P3", "P0/P1 才进入内容日历；P2 多数做 FAQ/段落；P3 不单独写", "为了凑数量写定义文", "总分和风险提示一致"],
  ["5. 主题簇规划", "形成可积累的权重", "把文章挂到产品线/主题簇下面", "一个父级商业页周围应有比较、教程、场景、标准、FAQ 等内容", "主题簇地图", "文章之间要有上下游内链", "东一篇西一篇", "能看出 pillar page 和 supporting content"],
  ["6. 文章 Brief", "把关键词变成可写内容", "填写「文章Brief模板」", "先回答用户问题，再补对比、数据、图片、表格、FAQ、CTA；如有图片，必须输出 Image Placement Map；如触发外部事实/高风险主题，再加 References", "文章 Brief", "不要只输出标题，要输出结构、证据、内链、CTA、图片位置表、引用触发判断", "AI 定义型水文、图片只说放正文、每篇机械加同一套引用", "编辑拿到 Brief 可以直接写"],
  ["7. 内容日历", "安排生产节奏", "把 P0/P1 放入「内容日历」", "小站先聚焦一个主题簇，资源少时少而深", "发布计划", "优先连续打透一个产品线", "无节奏日更", "每篇文章有发布日期、状态、内链"],
  ["8. 发布复盘", "用数据决定更新", "30-60 天看 GSC 查询、页面、排名", "有展现没点击改标题；有排名没进前10补内容/内链；没展现重查意图", "更新/合并任务", "发布不是结束，复盘后更新才是闭环", "只发不改", "每篇文章有复盘指标"],
];
styleBlock(standard.getRange("A7:H15"));
standard.getRange("A7:A15").format = { fill: theme.green2, font: { bold: true, color: theme.ink }, wrapText: true };
section(standard, "A17:H17", "关键词分流决策树");
standard.getRange("A18:H24").values = [
  ["SERP信号", "搜索意图", "优先页面", "什么时候写文章", "什么时候不写文章", "2C商城迁移", "输出动作", "备注"],
  ["前排多为商品页/分类页/集合页", "Transactional", "分类页/商品页/集合页", "可在商业页内增加 FAQ 或购买指南段落", "不要单独写博客抢商业页意图", "用商业页承接加购/下单", "商业页优化", "buy/sale/price/shop 等词常见"],
  ["前排多为 best/top/recommended", "Commercial Investigation", "榜单/购买指南", "文章能自然推荐产品并内链到集合页", "没有商品可承接时不写", "适合写导购文，导向集合页", "写文章", "适合 P0/P1"],
  ["前排多为 vs/comparison", "Commercial Investigation", "对比文", "用户在购买前做选择", "无法给出明确购买建议时不写", "对比后引导到优势品类/商品", "写文章", "强转化辅助"],
  ["前排多为 how-to/care/tutorial", "Informational", "教程文/FAQ", "能降低购买顾虑或售后问题", "与产品弱相关时只做 FAQ", "教程中低门槛推荐产品", "写文章或FAQ", "适合长期更新"],
  ["前排多为 what is/definition/百科", "Informational", "FAQ/商业页段落", "只有当 SERP 有商业文章机会且能做深", "多数不单独写", "放到品类页解释或 FAQ", "合并/不写", "防止定义型水文"],
  ["前排多为品牌/权威大站", "Navigational/High Authority", "暂缓或长尾切入", "找到更长尾、更具体场景", "不要硬冲大词", "从人群、场景、材质长尾切入", "降级/拆长尾", "小站尤其重要"],
];
styleHeader(standard.getRange("A18:H18"));
styleBlock(standard.getRange("A19:H24"));
standard.freezePanes.freezeRows(6);

const positioning = addSheet("网站定位输入卡");
title(
  positioning,
  "A1:H1",
  "网站定位输入卡",
  "把这页填好后，再让 AI 做关键词筛选和文章规划。没有这些信息，AI 很容易把页面类型和内容策略判断错。"
);
setWidths(positioning, { A: 20, B: 36, C: 34, D: 30, E: 26, F: 26, G: 28, H: 28 });
positioning.getRange("A4:H4").values = [["信息项", "你需要填写", "为什么重要", "示例", "AI使用方式", "是否必填", "常见错误", "备注"]];
styleHeader(positioning.getRange("A4:H4"));
positioning.getRange("A5:H20").values = [
  ["网站类型", "2C商城 / B2B询盘站 / SaaS / 内容站 / 本地服务", "决定关键词承接页面", "2C Shopify 商城", "判断博客和商业页边界", "必填", "把 B2B 线索逻辑套到商城", ""],
  ["商业目标", "下单、加购、询盘、注册、订阅、下载", "决定文章 CTA 和内链", "加购 + 下单购买", "每篇文章要支撑该目标", "必填", "只追流量不追转化", ""],
  ["核心产品/品类", "列出 3-10 个优先产品线", "决定主题簇", "silk pillowcase, silk eye mask", "按产品线归类关键词", "必填", "关键词和产品线脱节", ""],
  ["目标市场/语言", "国家、语言、币种、地区限制", "SERP 和词意图会变", "US / English / USD", "选择对应国家 SERP 判断", "必填", "拿中文直觉判断英文 SERP", ""],
  ["目标人群", "用户是谁、痛点是什么、购买前顾虑是什么", "决定文章角度", "curly hair users, skincare buyers", "生成场景文和 FAQ", "必填", "只写产品，不写人群", ""],
  ["成交页面", "分类页、集合页、商品页 URL", "文章必须能导流", "/collections/silk-pillowcases", "作为父级商业页", "必填", "博客没有目标 URL", ""],
  ["站点阶段", "DA/DR、Semrush流量、GSC展现/点击、上线时间", "决定难度阈值和发文量", "新站，Semrush流量<300", "小站先长尾和低 KD", "建议填", "小站硬冲大词", ""],
  ["内容资源", "是否有实拍图、测评、数据、专家、客户案例", "决定内容深度和 E-E-A-T", "有产品图和材质参数，无实验数据", "决定哪些词能写深", "建议填", "AI 空写无证据", ""],
  ["竞品网站", "3-10 个竞品 URL", "用于 SERP 和内容缺口分析", "competitor.com", "提取竞品页面类型和 H2", "建议填", "只看工具数据不看竞品", ""],
  ["品牌定位", "高端/性价比/专业/礼品/环保等", "决定标题和 CTA", "premium mulberry silk", "保持内容口径一致", "建议填", "文章风格和商品定位冲突", ""],
  ["禁止表达", "医疗承诺、夸大功效、敏感词", "降低合规风险", "不承诺治愈 acne/hair loss", "写作时规避", "建议填", "为了转化夸大功效", ""],
  ["内容产能", "每月可写几篇、是否有人审稿、是否能拍图", "决定内容日历", "每月 8-12 篇", "控制发文节奏", "建议填", "计划超过执行能力", ""],
  ["当前已有内容", "已有博客、分类页、产品页、排名 URL", "避免重复和内耗", "已有 20 篇 blog", "判断更新/合并/新写", "建议填", "重复写相同意图文章", ""],
  ["优先业务", "未来 1-3 个月最想推的品类", "决定先打哪个主题簇", "silk pillowcase", "优先规划该主题簇", "必填", "所有品类同时推进", ""],
  ["衡量指标", "点击、排名、内链点击、加购、订单、询盘", "决定复盘方式", "GSC点击 + 商品页点击", "输出复盘指标", "建议填", "只看文章流量", ""],
  ["交付要求", "需要关键词表、内容日历、Brief、标题、文章草稿", "决定 AI 输出粒度", "先输出评分表和 Brief", "控制交付格式", "必填", "直接让 AI 写全文", ""],
];
styleBlock(positioning.getRange("A5:H20"));
positioning.getRange("A5:A20").format = { fill: theme.green2, font: { bold: true, color: theme.ink }, wrapText: true };
setValidation(positioning, "F5:F20", ["必填", "建议填", "可选"]);
positioning.freezePanes.freezeRows(4);

const aiPrompt = addSheet("AI协作Prompt");
title(
  aiPrompt,
  "A1:H1",
  "给其他 AI 的协作提示词",
  "复制这页内容给其他 AI，并同时上传本 Excel。要求它按本标准输出，不要直接跳到写文章。"
);
setWidths(aiPrompt, { A: 18, B: 74, C: 36, D: 30, E: 28, F: 24, G: 24, H: 24 });
aiPrompt.getRange("A4:H4").values = [["模块", "提示词内容", "目的", "输出要求", "检查点", "状态", "备注", ""]];
styleHeader(aiPrompt.getRange("A4:H4"));
aiPrompt.getRange("A5:H18").values = [
  ["角色", "你是 Google SEO 内容策略师，任务不是直接写文章，而是根据网站定位、关键词数据和 SERP 页面类型，完成关键词到页面/文章的规划。", "限定 AI 角色", "先规划，后写作", "是否先问定位", "", "", ""],
  ["输入", "我会提供：网站定位输入卡、Semrush/GSC 关键词数据、现有页面 URL、竞品/目标市场。你必须先读取这些信息。", "统一上下文", "列出已读取信息和缺失信息", "是否遗漏目标国家/产品线", "", "", ""],
  ["总原则", "不要把所有关键词都拿来写文章。先判断关键词应由哪种页面承接：分类页、集合页、商品页、博客文章、FAQ/段落，或暂时不做。", "防止误写文章", "输出页面类型分流", "是否每个词有页面类型", "", "", ""],
  ["SERP规则", "每个候选词必须人工或基于 SERP 信息判断前 10 名页面类型。如果 SERP 文章占比低于 4/10，默认不单独写博客，除非有明确商业理由。", "锁定判断顺序", "填写 SERP文章占比和获胜类型", "是否看 SERP", "", "", ""],
  ["商业规则", "每个文章词必须指定父级商业页。没有父级商业页、无法自然内链到产品/分类/集合页的词，默认降级为 P2/P3。", "让文章服务转化", "输出父级商业页和目标URL", "是否博客孤岛", "", "", ""],
  ["评分规则", "按 100 分模型评分：SERP文章匹配20、商业支撑20、需求15、难度机会15、内容深度15、主题内链10、更新价值5。", "统一量化标准", "输出各维度分和总分", "是否可追溯", "", "", ""],
  ["优先级", "P0>=75 立即写；P1=60-74 排入内容日历；P2=45-59 做 FAQ/段落或低优先文章；P3<45 不单独写。", "统一动作", "输出推荐动作", "动作是否和分数一致", "", "", ""],
  ["文章类型", "根据关键词和 SERP 选择文章类型：榜单/购买指南、对比文、教程文、价值解释文、标准/规格文、场景解决方案、FAQ/段落。", "避免模板化", "输出推荐文章类型", "是否匹配意图", "", "", ""],
  ["Brief要求", "每篇 P0/P1 文章必须输出：主关键词、父级商业页、用户问题、一句话答案、H2结构、原创证据、竞品缺口、内链、CTA、FAQ、复盘指标；并判断是否需要 References。", "让文章可执行", "输出文章 Brief", "是否包含证据、内链和引用触发判断", "", "", ""],
  ["引用触发规则", "References 不是每篇文章固定模块。只有正文使用外部事实、官方定义、法律/年龄、健康风险、安全、电池/回收、行业标准、平台规则或研究数据时，才加 ## References。普通经验、口味、场景、产品灵感文可以 0 引用。", "避免模板化引用", "需要时输出 References；不需要时写明不触发", "是否避免每篇重复同一套来源", "", "", ""],
  ["图片位置规则", "如果文章需要图片或已经生成图片，必须输出 Image Placement Map：Image、File、Exact placement、Purpose、Alt tag。Exact placement 必须写到 H2/H3、段落后、表格前后，或 CMS featured image，不能只写“放正文中”。", "统一配图落点", "输出图片位置表", "是否写清楚插入点和 alt", "", "", ""],
  ["2C商城迁移", "如果网站是 2C 商城，博客负责购买前教育、比较、教程和顾虑解除；分类页/集合页/商品页负责成交。不要让博客替代应该成交的商业页。", "适配用户网站", "明确每篇文章如何导向加购/下单", "是否导向成交页", "", "", ""],
  ["输出格式", "请按以下顺序输出：1 网站定位摘要；2 关键词分流表；3 文章关键词评分表；4 P0/P1 内容日历；5 每篇文章 Brief；6 风险和需要人工确认的问题。", "固定交付", "不要只给建议，要给表格", "是否完整", "", "", ""],
  ["质量门槛", "不要输出泛泛定义文。每篇文章都要说明如何比前排内容更好：数据、图片、表格、经验、对比、FAQ、真实产品信息或独特视角。", "避免 AI 水文", "输出可差异化模块", "是否能超越竞品", "", "", ""],
];
styleBlock(aiPrompt.getRange("A5:H18"));
aiPrompt.getRange("A5:A18").format = { fill: theme.green2, font: { bold: true, color: theme.ink }, wrapText: true };
section(aiPrompt, "A19:H19", "可直接复制的完整 Prompt");
aiPrompt.getRange("A20:H26").merge();
aiPrompt.getRange("A20:H26").values = [[
  "请你作为 Google SEO 内容策略师，基于我提供的 Excel 标准和关键词数据，完成关键词到页面/文章的规划。你不能直接开始写文章。你必须先读取网站定位输入卡，确认网站类型、商业目标、核心产品、目标市场、成交页面、站点阶段和内容资源。然后对每个关键词进行页面类型分流：分类页、集合页、商品页、博客文章、FAQ/段落或暂时不做。每个候选文章词必须判断 SERP 前 10 名页面类型，并给出 SERP文章占比(0-10)。如果 SERP文章占比低于4，默认不单独写博客。每个文章词必须指定父级商业页和目标URL，没有父级商业页则降级。请按 100 分模型评分：SERP文章匹配20、商业支撑20、需求15、难度机会15、内容深度15、主题内链10、更新价值5。P0>=75 立即写，P1=60-74 排入内容日历，P2=45-59 做 FAQ/段落或低优先文章，P3<45 不单独写。如果文章需要图片或已经生成图片，必须输出 Image Placement Map，字段包括 Image、File、Exact placement、Purpose、Alt tag；Exact placement 必须写清楚放在哪个 H2/H3、哪段后、哪个表格前后，或是否作为 CMS featured image，不能只写“放正文中”。References 不是每篇文章固定模块：只有正文使用外部事实、官方定义、法律/年龄、健康风险、安全、电池/回收、行业标准、平台规则或研究数据时，才添加 ## References；普通经验、口味、场景、产品灵感文可以 0 引用。若触发引用，必须使用描述性锚文本，例如 [FDA overview of e-cigarettes, vapes, and other ENDS products](URL)，不要展示裸 URL，也不要使用 source/click here/read more 这类泛锚文本；不要每篇文章机械复用同一套来源。最后输出：网站定位摘要、关键词分流表、文章关键词评分表、P0/P1 内容日历、每篇文章 Brief、References 触发判断、Image Placement Map（如有图片）、风险和需要人工确认的问题。"
]];
aiPrompt.getRange("A20:H26").format = { fill: theme.amber2, font: { color: theme.ink }, wrapText: true, borders: { preset: "outside", style: "thin", color: theme.gray } };
aiPrompt.freezePanes.freezeRows(4);

const guide = addSheet("使用说明");
title(
  guide,
  "A1:H1",
  "Google SEO 文章关键词评分表",
  "用途：把 Semrush / GSC / 人工 SERP 判断合在一张表里，筛出真正值得写博客的关键词，并生成文章规划。"
);
setWidths(guide, { A: 20, B: 28, C: 26, D: 28, E: 26, F: 24, G: 24, H: 24 });
guide.getRange("A4:H4").merge();
guide.getRange("A4:H4").values = [["先记住一句话：关键词不是都拿来写文章。先判断页面类型，再决定写博客、分类页、产品页，还是只放到 FAQ/段落里。"]];
guide.getRange("A4:H4").format = { fill: theme.amber2, font: { bold: true, color: theme.ink }, wrapText: true };
guide.getRange("A6:H6").values = [["步骤", "你要做什么", "判断标准", "输出结果", "适合 2C 商城怎么迁移", "常见错误", "复盘指标", "备注"]];
styleHeader(guide.getRange("A6:H6"));
guide.getRange("A7:H13").values = [
  ["1. 导入词", "从 Semrush 导出 Keyword、Volume、CPC、KD、Intent", "先不急着删词，保留原始数据", "关键词池", "按产品线/集合页分组，如 silk pillowcase、silk eye mask", "只看搜索量，忽略意图", "词数、主题簇覆盖", "原始数据可粘到「文章关键词池」"],
  ["2. 看 SERP", "手动搜 Google 前 10 名", "前排是否有 guide、best、vs、how-to、FAQ、list 文章", "SERP文章占比 0-10", "如果前排多是 collection/product，就不要硬写博客", "不看页面类型就写文章", "目标词前排页面类型", "这是最关键的人工校正"],
  ["3. 分配页面", "给关键词指定父级商业页", "文章必须能支撑一个分类页/商品页/集合页", "父级商业页 + 目标URL", "博客负责解释、比较、教育，商业页负责成交", "博客孤岛，没有内链", "内链点击、商业页排名", "每篇文章至少链接 1 个成交页"],
  ["4. 打分筛选", "按 7 个维度评分", "总分 >=75 优先写，60-74 排入内容日历", "优先级 P0/P1/P2/P3", "小站先做长尾、商业支撑强、内容能做深的词", "把定义词当高价值文章", "排名、点击、转化辅助", "评分会自动计算"],
  ["5. 写 Brief", "根据推荐文章类型生成写作提纲", "不要只写定义，要有对比、数据、经验、表格、图片、FAQ；有图片时必须写 Image Placement Map；需要外部事实背书时才加 References", "文章 Brief", "2C 要加入购买场景、材质、尺码、护理、适用人群；引用要有触发原因；图片要写具体插入位置", "AI 水文、无证据、无 CTA、图片只写放正文、每篇机械加引用", "阅读时长、跳出、内链点击", "见「文章Brief模板」"],
  ["6. 发布频率", "按网站阶段发文", "起步 10篇/月，成长 20篇/月，发展约 30篇/月，成熟不超过 5篇/天", "内容日历", "资源少时宁可少发，也要围绕主题簇持续更新", "无节奏日更低质内容", "收录、展现、点击", "来自视频中的发文阶段逻辑"],
  ["7. 复盘迭代", "用 GSC 看查询、页面、排名", "有展现没点击改标题；有排名没进前 10 补内容/内链；没展现重查意图", "更新任务", "保留能带来辅助成交的内容，合并无价值薄内容", "只发布不复盘", "GSC 点击、展示、平均排名", "每 30-60 天复盘一次"],
];
styleBlock(guide.getRange("A7:H13"));
guide.getRange("A7:A13").format = { fill: theme.green2, font: { bold: true, color: theme.ink } };
guide.getRange("A15:H15").merge();
guide.getRange("A15:H15").values = [["视频里可迁移出来的博客规则"]];
guide.getRange("A15:H15").format = { fill: theme.green2, font: { bold: true, color: theme.ink } };
guide.getRange("A16:H22").values = [
  ["规则1", "博客不是流量玄学，必须拿到“对应的词”。", "先查 SERP，再写文章。", "", "", "", "", ""],
  ["规则2", "文章要服务核心聚合页/商业页。", "每篇文章要明确链接到哪个分类页、产品页或集合页。", "", "", "", "", ""],
  ["规则3", "不要堆定义。", "AI 时代要补数据、标准、对比、场景、经验、图片和表格。", "", "", "", "", ""],
  ["规则3.1", "引用是触发式，不是固定模板。", "只有涉及外部事实、官方定义、法律/年龄、健康、安全、电池/回收、行业标准等内容才加 References；普通经验、口味、场景文可以 0 引用。", "", "", "", "", ""],
  ["规则3.2", "图片必须有具体位置。", "生成图片或规划配图时，必须输出 Image Placement Map，写清楚放在哪个 H2/H3、哪段后、哪个表格前后，或是否作为 CMS featured image。", "", "", "", "", ""],
  ["规则4", "文章页面也可能抢核心词排名。", "如果 Google 更喜欢文章，就让文章排名，再把流量导向商业页。", "", "", "", "", ""],
  ["规则5", "内容规划要按阶段。", "小站先长尾和质量，成长后补核心词矩阵。", "", "", "", "", ""],
];
styleBlock(guide.getRange("A16:H22"));
guide.freezePanes.freezeRows(6);

const rules = addSheet("评分规则");
title(rules, "A1:G1", "文章关键词 100 分评分规则", "分数不是替代判断，而是帮助你稳定筛出“值得单独写文章”的关键词。");
setWidths(rules, { A: 20, B: 18, C: 46, D: 32, E: 34, F: 26, G: 26 });
rules.getRange("A4:G4").values = [["维度", "权重", "高分标准", "低分信号", "你怎么判断", "适合写文章的例子", "不适合单独写的例子"]];
styleHeader(rules.getRange("A4:G4"));
rules.getRange("A5:G11").values = [
  ["SERP文章匹配", 20, "Google 前排有大量 guide / best / vs / how-to / list / FAQ", "前排几乎都是商品页、分类页、品牌首页", "搜索关键词，看前 10 个自然结果页面类型", "best silk pillowcase for hair", "silk pillowcase sale"],
  ["商业支撑", 20, "文章能自然导向分类页/商品页/集合页", "与产品弱相关，读完也不会买", "给每个词指定父级商业页", "silk vs satin pillowcase -> silk pillowcase", "history of silk in ancient china"],
  ["需求强度", 15, "有搜索量，CPC 或商业意图不为 0", "无人搜，且没有购买辅助意义", "看 Volume、CPC、GSC 展现", "how to wash silk pillowcase", "random poetic keyword"],
  ["难度机会", 15, "KD 适合当前网站阶段，SERP 有弱内容可超越", "KD 极高且前排都是强站强内容", "看 KD、竞品内容薄弱点、站点权重", "silk pillowcase for curly hair", "best pillow"],
  ["内容深度", 15, "能加入实测、表格、图片、对比、FAQ、经验", "只能写定义，无法做出差异", "能不能列出至少 5 个有价值小节", "silk pillowcase size guide", "what is silk"],
  ["主题内链价值", 10, "能加入主题簇，向上支撑商业页，向下链接相关文章", "孤立文章，无内链关系", "是否属于一个清晰 topic cluster", "silk pillowcase benefits for skin", "unrelated lifestyle topic"],
  ["更新价值", 5, "可以每季度/半年更新，能跟产品、场景、趋势变化", "一次性短答案，长期无更新价值", "是否适合加新案例、新产品、新 FAQ", "best silk pillowcases 2026", "silk definition"],
];
styleBlock(rules.getRange("A5:G11"));
rules.getRange("B5:B11").format.numberFormat = "0";
section(rules, "A13:G13", "推荐动作阈值");
rules.getRange("A14:D18").values = [
  ["总分", "等级", "动作", "解释"],
  [75, "P0", "立即写独立文章", "搜索意图适合文章，商业价值明确，内容能做深。"],
  [60, "P1", "排入本批内容日历", "值得写，但需要人工补 SERP 或内容证据。"],
  [45, "P2", "先做 FAQ/段落/低优先文章", "可能有价值，但独立文章风险较高。"],
  [0, "P3", "不单独写", "合并到商业页、FAQ，或暂时放弃。"],
];
styleHeader(rules.getRange("A14:D14"));
styleBlock(rules.getRange("A15:D18"));
section(rules, "A20:G20", "文章类型选择规则");
rules.getRange("A21:E29").values = [
  ["SERP/关键词信号", "推荐文章类型", "文章目的", "必须包含", "导向页面"],
  ["best / top / recommended", "榜单/购买指南", "辅助选择并导向商品", "筛选标准、对比表、推荐人群、CTA", "集合页/分类页/产品页"],
  ["vs / comparison", "对比文", "帮助用户做决策", "差异表、适用场景、结论、内链", "胜出产品页/分类页"],
  ["how to / care / clean", "教程文", "解决使用问题并降低顾虑", "步骤、注意事项、图片、FAQ", "相关产品页"],
  ["benefits / good for", "价值解释文", "教育用户为什么买", "机制解释、证据、适合人群、反例", "品类页/产品页"],
  ["size / material / standard", "标准/规格文", "帮助用户避免买错", "尺寸表、材质表、适配建议", "分类页/变体页"],
  ["problem / for + user group", "场景解决方案", "对齐具体人群痛点", "痛点、选购标准、推荐组合", "集合页/产品页"],
  ["what is / definition", "通常不建议单独写", "除非 SERP 显示有商业机会", "定义外必须有购买决策信息", "FAQ/商业页段落"],
  ["coupon / sale / buy", "商业页优先", "直接成交", "价格、库存、优惠、评价", "分类页/产品页"],
];
styleHeader(rules.getRange("A21:E21"));
styleBlock(rules.getRange("A22:E29"));

const pagePlan = addSheet("页面规划");
title(
  pagePlan,
  "A1:J1",
  "页面规划",
  "这是全站页面主数据。文章关键词池里的父级商业页和目标URL，应该优先从这里匹配，避免博客文章孤岛化。"
);
setWidths(pagePlan, { A: 10, B: 30, C: 26, D: 30, E: 24, F: 20, G: 18, H: 14, I: 14, J: 42 });
pagePlan.getRange("A4:J4").values = [[
  "层级",
  "页面名称",
  "主关键词",
  "URL路径",
  "父页面",
  "页面类型",
  "搜索意图",
  "建议优先级",
  "审计状态",
  "内容要求",
]];
styleHeader(pagePlan.getRange("A4:J4"));
pagePlan.getRange("A5:J17").values = [
  ["L1", "Silk Pillowcase", "silk pillowcase", "/collections/silk-pillowcases", "-", "分类页/集合页", "Commercial", "P0", "Draft", "类目介绍、材质、Momme、适用人群、FAQ、产品集合"],
  ["L2", "Mulberry Silk Pillowcase", "mulberry silk pillowcase", "/collections/mulberry-silk", "Silk Pillowcase", "可索引筛选集合页", "Commercial", "P0", "Draft", "解释材质差异、Momme、证书、护理和购买建议"],
  ["L2", "Queen Silk Pillowcase", "queen silk pillowcase", "/collections/silk-pillowcases/queen-size", "Silk Pillowcase", "可索引筛选集合页", "Transactional", "P1", "Draft", "尺寸、适配床品、商品列表、FAQ"],
  ["L2", "Pink Silk Pillowcase", "pink silk pillowcase", "/collections/silk-pillowcases/pink", "Silk Pillowcase", "可索引筛选集合页", "Transactional", "P1", "Draft", "颜色页、商品列表、材质说明、FAQ"],
  ["L1", "Silk Eye Mask", "silk eye mask", "/collections/silk-eye-masks", "-", "分类页/集合页", "Commercial", "P0", "Draft", "类目页、睡眠场景、材质、遮光、商品集合"],
  ["L2", "Travel Silk Eye Mask", "travel silk eye mask", "/collections/silk-eye-masks/travel", "Silk Eye Mask", "专题集合页", "Transactional", "P1", "Draft", "旅行场景、便携性、产品推荐、FAQ"],
  ["L1", "Silk Hair Scrunchies", "silk hair scrunchies", "/collections/silk-scrunchies", "-", "分类页/集合页", "Commercial", "P0", "Draft", "类目页、发质场景、颜色、套装和护理"],
  ["Blog", "Best Silk Pillowcase for Hair", "best silk pillowcase for hair", "/blogs/best-silk-pillowcase-for-hair", "Silk Pillowcase", "购买指南", "Commercial", "P1", "Draft", "榜单/选购标准/对比表/内链到 Silk Pillowcase"],
  ["Blog", "Silk Pillowcase vs Satin", "silk pillowcase vs satin", "/blogs/silk-pillowcase-vs-satin", "Silk Pillowcase", "对比文章", "Commercial", "P1", "Draft", "对比表、材质差异、适合人群、内链到集合页"],
  ["Help", "How to Wash Silk Pillowcase", "how to wash silk pillowcase", "/blogs/how-to-wash-silk-pillowcase", "Silk Pillowcase", "帮助/FAQ", "Informational", "P2", "Draft", "护理步骤、注意事项、FAQ、内链到产品页"],
  ["L2", "Silk Pillowcase Set", "silk pillowcase set", "/collections/silk-pillowcases/sets", "Silk Pillowcase", "集合页/商品页", "Transactional", "P1", "Draft", "套装商品、礼品场景、价格和FAQ"],
  ["Observe", "Silk Pillowcase Amazon", "silk pillowcase amazon", "", "-", "暂缓", "Navigational", "P3", "Hold", "SERP偏平台导航，暂不独立做"],
  ["Commercial", "Mulberry Silk Pillowcase Product", "mulberry silk pillowcase", "/products/mulberry-silk-pillowcase", "Silk Pillowcase", "产品页", "Transactional", "P1", "Draft", "商品详情、材质参数、评价、护理说明"],
];
styleBlock(pagePlan.getRange("A5:J104"));
pagePlan.getRange("A5:A104").format = { fill: theme.green2, font: { bold: true, color: theme.ink }, wrapText: true };
setValidation(pagePlan, "A5:A104", ["L1", "L2", "L3", "Blog", "Help", "Commercial", "Observe"]);
setValidation(pagePlan, "F5:F104", ["分类页/集合页", "可索引筛选集合页", "专题集合页", "产品页", "集合页/商品页", "购买指南", "对比文章", "帮助/FAQ", "暂缓"]);
setValidation(pagePlan, "G5:G104", ["Informational", "Commercial", "Transactional", "Navigational", "Mixed", "Unknown"]);
setValidation(pagePlan, "H5:H104", ["P0", "P1", "P2", "P3"]);
setValidation(pagePlan, "I5:I104", ["Draft", "Live", "Update", "Hold"]);
pagePlan.getRange("A4:J104").format.borders = { preset: "inside", style: "thin", color: theme.gray };
pagePlan.getRange("A4:J104").format.borders = { preset: "outside", style: "medium", color: "#B7C2BA" };
pagePlan.freezePanes.freezeRows(4);

const pool = addSheet("文章关键词池");
const headers = [
  "关键词",
  "中文含义/备注",
  "父级商业页",
  "主题簇",
  "搜索量",
  "CPC",
  "KD",
  "Semrush意图",
  "SERP文章占比(0-10)",
  "SERP获胜类型",
  "推荐文章类型",
  "产品相关度(1-5)",
  "转化支撑(1-5)",
  "独特证据(1-5)",
  "内容深度(1-5)",
  "主题簇匹配(1-5)",
  "内链机会(1-5)",
  "更新价值(1-5)",
  "已有URL",
  "目标商品/分类URL",
  "备注",
  "SERP文章匹配分",
  "商业支撑分",
  "需求分",
  "难度机会分",
  "内容深度分",
  "主题内链分",
  "更新价值分",
  "总分",
  "等级",
  "推荐动作",
  "文章Brief提示",
  "风险提示",
  "父级页匹配",
  "匹配页面名称",
  "匹配页面类型",
  "匹配优先级",
  "关联动作",
];
pool.getRange("A1:AL1").values = [headers];
styleHeader(pool.getRange("A1:AL1"));
setWidths(pool, {
  A: 28,
  B: 24,
  C: 24,
  D: 18,
  E: 11,
  F: 10,
  G: 9,
  H: 14,
  I: 16,
  J: 18,
  K: 18,
  L: 14,
  M: 14,
  N: 14,
  O: 14,
  P: 14,
  Q: 14,
  R: 14,
  S: 28,
  T: 28,
  U: 30,
  V: 14,
  W: 13,
  X: 11,
  Y: 13,
  Z: 13,
  AA: 13,
  AB: 12,
  AC: 10,
  AD: 10,
  AE: 22,
  AF: 48,
  AG: 44,
  AH: 16,
  AI: 24,
  AJ: 18,
  AK: 14,
  AL: 34,
});
const sampleRows = [
  ["best silk pillowcase for hair", "适合写购买指南/榜单", "/collections/silk-pillowcases", "silk pillowcase", 2400, 1.8, 38, "Commercial", 8, "博客/榜单", "榜单/购买指南", 5, 5, 4, 5, 5, 5, 4, "", "/collections/silk-pillowcases", "可导向多个 SKU"],
  ["silk pillowcase vs satin", "对比真丝与缎面", "/collections/silk-pillowcases", "silk pillowcase", 1900, 1.2, 32, "Commercial", 9, "博客/对比", "对比文", 5, 4, 4, 5, 5, 5, 4, "", "/collections/silk-pillowcases", "强购买决策词"],
  ["how to wash silk pillowcase", "护理教程", "/products/mulberry-silk-pillowcase", "silk care", 1600, 0.7, 28, "Informational", 10, "教程/FAQ", "教程文", 4, 3, 5, 5, 4, 4, 5, "", "/products/mulberry-silk-pillowcase", "可降低售后疑虑"],
  ["silk pillowcase benefits for skin", "功效解释", "/collections/silk-pillowcases", "silk pillowcase", 880, 1.1, 42, "Informational", 8, "博客/指南", "价值解释文", 5, 4, 3, 4, 5, 5, 4, "", "/collections/silk-pillowcases", "需要避免夸大功效"],
  ["mulberry silk pillowcase benefits", "材质教育", "/collections/mulberry-silk", "mulberry silk", 720, 0.9, 35, "Informational", 8, "博客/指南", "价值解释文", 5, 4, 4, 4, 5, 5, 4, "", "/collections/mulberry-silk", "可解释 19/22/25 momme"],
  ["silk pillowcase for curly hair", "人群场景词", "/collections/silk-pillowcases", "curly hair", 590, 1.4, 31, "Commercial", 8, "博客/场景", "场景解决方案", 5, 5, 4, 5, 5, 5, 4, "", "/collections/silk-pillowcases", "可做强转化"],
  ["silk pillowcase size guide", "规格选择", "/collections/silk-pillowcases", "size guide", 210, 0.5, 18, "Informational", 7, "指南/规格", "标准/规格文", 5, 4, 5, 4, 4, 5, 4, "", "/collections/silk-pillowcases", "表格型内容"],
  ["silk eye mask benefits", "眼罩功效", "/collections/silk-eye-masks", "silk eye mask", 480, 0.8, 29, "Informational", 7, "博客/指南", "价值解释文", 5, 4, 4, 4, 4, 4, 4, "", "/collections/silk-eye-masks", "可做睡眠场景"],
  ["buy silk pillowcase", "购买词", "/collections/silk-pillowcases", "silk pillowcase", 1300, 2.4, 45, "Transactional", 2, "分类/商品", "商业页优先", 5, 5, 2, 2, 4, 5, 2, "", "/collections/silk-pillowcases", "不要单独写博客，做商业页"],
  ["what is silk", "泛定义词", "/pages/about-silk", "silk basics", 5400, 0.2, 78, "Informational", 5, "百科/大站", "通常不建议单独写", 2, 1, 1, 2, 2, 1, 2, "", "/pages/about-silk", "泛词难度高，商业弱"],
];
pool.getRange("A2:U11").values = sampleRows;
styleBlock(pool.getRange("A2:AL101"));
pool.getRange("E2:E101").format.numberFormat = "#,##0";
pool.getRange("F2:F101").format.numberFormat = "0.00";
pool.getRange("G2:I101").format.numberFormat = "0";
pool.getRange("L2:R101").format.numberFormat = "0";
pool.getRange("V2:AC101").format.numberFormat = "0.0";
pool.getRange("AD2:AE101").format = { fill: theme.green2, font: { bold: true, color: theme.ink }, wrapText: true };
pool.getRange("AF2:AL101").format.wrapText = true;
pool.freezePanes.freezeRows(1);
pool.freezePanes.freezeColumns(4);

setValidation(pool, "H2:H101", ["Informational", "Commercial", "Transactional", "Navigational", "Mixed", "Unknown"]);
setValidation(pool, "J2:J101", ["博客/榜单", "博客/对比", "博客/指南", "教程/FAQ", "指南/规格", "博客/场景", "分类/商品", "品牌/首页", "百科/大站", "混合"]);
setValidation(pool, "K2:K101", ["榜单/购买指南", "对比文", "教程文", "价值解释文", "标准/规格文", "场景解决方案", "FAQ/段落", "商业页优先", "通常不建议单独写"]);
setWholeNumberValidation(pool, "I2:I101", 0, 10);
setWholeNumberValidation(pool, "L2:R101", 1, 5);

const scoreFormulas = [];
for (let r = 2; r <= 101; r += 1) {
  scoreFormulas.push([
    `=IF($A${r}="","",MIN(20,MAX(0,$I${r}*2)))`,
    `=IF($A${r}="","",(($L${r}+$M${r})/10)*20)`,
    `=IF($A${r}="","",IF($E${r}>=1000,10,IF($E${r}>=300,8,IF($E${r}>=100,6,IF($E${r}>=30,4,IF($E${r}>0,2,0)))))+IF($F${r}>=2,5,IF($F${r}>=1,4,IF($F${r}>=0.3,3,IF($F${r}>0,2,0)))))`,
    `=IF($A${r}="","",IF($G${r}<=20,15,IF($G${r}<=35,12,IF($G${r}<=50,9,IF($G${r}<=65,6,IF($G${r}<=80,3,1))))))`,
    `=IF($A${r}="","",(($N${r}+$O${r})/10)*15)`,
    `=IF($A${r}="","",(($P${r}+$Q${r})/10)*10)`,
    `=IF($A${r}="","",$R${r})`,
    `=IF($A${r}="","",SUM($V${r}:$AB${r}))`,
    `=IF($A${r}="","",IF($AC${r}>=75,"P0",IF($AC${r}>=60,"P1",IF($AC${r}>=45,"P2","P3"))))`,
    `=IF($A${r}="","",IF($AC${r}>=75,"立即写独立文章",IF($AC${r}>=60,"排入本批内容日历",IF($AC${r}>=45,"先做FAQ/段落或低优先文章","不单独写，合并到商业页/FAQ"))))`,
    `=IF($A${r}="","",$K${r}&" | 父级页: "&$C${r}&" | 目标URL: "&$T${r}&" | 必补: 竞品结构+原创证据+对比表+FAQ+内链CTA")`,
    `=IF($A${r}="","",IF($I${r}<4,"SERP不支持文章，优先做商业页/FAQ",IF($L${r}<3,"产品相关弱，谨慎写",IF($N${r}<3,"证据不足，容易变AI水文",IF($G${r}>70,"难度偏高，需要更强外链/权威",IF($Q${r}<3,"内链弱，先补主题簇","可进入规划"))))))`,
  ]);
}
pool.getRange("V2:AG101").formulas = scoreFormulas;
const pageLinkFormulas = [];
for (let r = 2; r <= 101; r += 1) {
  pageLinkFormulas.push([
    `=IF($A${r}="","",IF($T${r}="","缺少目标URL",IF(COUNTIF('页面规划'!$D$5:$D$104,$T${r})>0,"已匹配","未匹配")))`,
    `=IF($A${r}="","",IFERROR(INDEX('页面规划'!$B$5:$B$104,MATCH($T${r},'页面规划'!$D$5:$D$104,0)),""))`,
    `=IF($A${r}="","",IFERROR(INDEX('页面规划'!$F$5:$F$104,MATCH($T${r},'页面规划'!$D$5:$D$104,0)),""))`,
    `=IF($A${r}="","",IFERROR(INDEX('页面规划'!$H$5:$H$104,MATCH($T${r},'页面规划'!$D$5:$D$104,0)),""))`,
    `=IF($A${r}="","",IF($AH${r}="已匹配","OK：文章可内链到页面规划中的父级页","先到【页面规划】新增/修正目标URL，再排文章"))`,
  ]);
}
pool.getRange("AH2:AL101").formulas = pageLinkFormulas;
pool.getRange("AH2:AH101").format = { fill: theme.blue2, font: { bold: true, color: theme.ink }, wrapText: true };
pool.getRange("A1:AL101").format.borders = { preset: "inside", style: "thin", color: theme.gray };
pool.getRange("A1:AL101").format.borders = { preset: "outside", style: "medium", color: "#B7C2BA" };
pool.getRange("AC2:AC101").conditionalFormats.add("colorScale", {
  criteria: [
    { type: "lowestValue", color: theme.red2 },
    { type: "percentile", value: 50, color: theme.amber2 },
    { type: "highestValue", color: theme.green2 },
  ],
});
pool.getRange("AD2:AD101").conditionalFormats.add("containsText", { text: "P0", format: { fill: theme.green2, font: { bold: true, color: theme.green } } });
pool.getRange("AD2:AD101").conditionalFormats.add("containsText", { text: "P3", format: { fill: theme.red2, font: { bold: true, color: theme.red } } });
pool.getRange("AH2:AH101").conditionalFormats.add("containsText", { text: "未匹配", format: { fill: theme.red2, font: { bold: true, color: theme.red } } });
pool.getRange("AH2:AH101").conditionalFormats.add("containsText", { text: "已匹配", format: { fill: theme.green2, font: { bold: true, color: theme.green } } });

const calendar = addSheet("内容日历");
title(calendar, "A1:L1", "内容日历", "把 P0/P1 的文章排期。小站建议先围绕一个主题簇连续写，避免东一篇西一篇。");
setWidths(calendar, { A: 12, B: 14, C: 12, D: 28, E: 18, F: 18, G: 26, H: 34, I: 16, J: 16, K: 30, L: 30 });
calendar.getRange("A4:L4").values = [["周次", "发布日期", "优先级", "主关键词", "主题簇", "文章类型", "父级商业页", "标题草案", "Brief状态", "写作状态", "必须内链", "复盘指标"]];
styleHeader(calendar.getRange("A4:L4"));
calendar.getRange("A5:L16").values = [
  ["Week 1", "", "P0", "silk pillowcase vs satin", "silk pillowcase", "对比文", "/collections/silk-pillowcases", "Silk vs Satin Pillowcase: Which One Is Better for Hair and Skin?", "待确认SERP", "待写", "/collections/silk-pillowcases", "GSC 查询、点击、平均排名"],
  ["Week 1", "", "P0", "best silk pillowcase for hair", "silk pillowcase", "榜单/购买指南", "/collections/silk-pillowcases", "Best Silk Pillowcases for Hair: How to Choose the Right One", "待补证据", "待写", "/collections/silk-pillowcases", "排名、内链点击、辅助转化"],
  ["Week 2", "", "P0", "how to wash silk pillowcase", "silk care", "教程文", "/products/mulberry-silk-pillowcase", "How to Wash a Silk Pillowcase Without Ruining It", "待补图片", "待写", "/products/mulberry-silk-pillowcase", "点击、FAQ 展现、售后问题下降"],
  ["Week 2", "", "P1", "silk pillowcase for curly hair", "curly hair", "场景解决方案", "/collections/silk-pillowcases", "Are Silk Pillowcases Good for Curly Hair?", "待确认竞品", "待写", "/collections/silk-pillowcases", "点击、商品页点击"],
  ["Week 3", "", "P1", "silk pillowcase size guide", "size guide", "标准/规格文", "/collections/silk-pillowcases", "Silk Pillowcase Size Guide: Standard, Queen, and King Explained", "待补表格", "待写", "/collections/silk-pillowcases", "收录、排名、咨询问题"],
  ["Week 3", "", "", "", "", "", "", "", "", "", "", ""],
  ["Week 4", "", "", "", "", "", "", "", "", "", "", ""],
  ["Week 4", "", "", "", "", "", "", "", "", "", "", ""],
  ["Week 5", "", "", "", "", "", "", "", "", "", "", ""],
  ["Week 5", "", "", "", "", "", "", "", "", "", "", ""],
  ["Week 6", "", "", "", "", "", "", "", "", "", "", ""],
  ["Week 6", "", "", "", "", "", "", "", "", "", "", ""],
];
styleBlock(calendar.getRange("A5:L16"));
calendar.getRange("B5:B16").format.numberFormat = "yyyy-mm-dd";
setValidation(calendar, "C5:C50", ["P0", "P1", "P2", "P3"]);
setValidation(calendar, "I5:I50", ["待确认SERP", "待补证据", "待补图片", "已完成Brief", "已发布", "需更新"]);
setValidation(calendar, "J5:J50", ["待写", "写作中", "待编辑", "待发布", "已发布", "需更新"]);
calendar.freezePanes.freezeRows(4);

const brief = addSheet("文章Brief模板");
title(brief, "A1:F1", "文章 Brief 模板", "每篇文章开写前先填这个 Brief，避免写成泛泛而谈的 AI 水文。");
setWidths(brief, { A: 20, B: 44, C: 28, D: 42, E: 30, F: 30 });
brief.getRange("A4:F4").values = [["模块", "填写内容", "判断标准", "示例", "负责人/状态", "复盘"]];
styleHeader(brief.getRange("A4:F4"));
brief.getRange("A5:F22").values = [
  ["主关键词", "从「文章关键词池」选择 P0/P1 词", "一个主词，一个明确意图", "silk pillowcase vs satin", "", ""],
  ["父级商业页", "这篇文章最终要支撑哪个分类/商品页", "必须能自然内链", "/collections/silk-pillowcases", "", ""],
  ["用户问题", "用户搜索这个词真正想解决什么", "用一句话说清楚", "不知道真丝和缎面哪个更适合头发/皮肤", "", ""],
  ["搜索意图", "Informational / Commercial / Mixed", "以 SERP 为准，不只看工具标签", "Commercial Investigation", "", ""],
  ["文章类型", "对比文/榜单/教程/标准/场景方案", "匹配 Google 前排获胜类型", "对比文", "", ""],
  ["一句话答案", "开头先给结论", "不要绕半天才回答", "Silk is a natural fiber; satin is a weave, so they are not the same category.", "", ""],
  ["H2结构", "按用户决策顺序排，不按自己想说的排", "先结论，再差异，再适合谁，再选购", "What is silk? What is satin? Key differences table...", "", ""],
  ["原创证据", "图片、表格、实测、商品经验、材质参数、FAQ", "至少 2-3 个非泛泛模块", "momme 对比表、洗护图片、用户场景", "", ""],
  ["竞品缺口", "前排文章缺什么", "找到能超越的角度", "缺少尺码/护理/购买建议", "", ""],
  ["内链", "文章正文中链接到哪些商业页/相关文章", "上链商业页，下链相关博客", "/collections/silk-pillowcases; /blogs/how-to-wash-silk", "", ""],
  ["CTA", "低门槛 CTA，不要太硬", "教程文轻 CTA，购买指南强 CTA", "See our 22 momme mulberry silk pillowcases", "", ""],
  ["图片/表格", "需要哪些视觉资产", "表格比纯文字更容易留下来", "Silk vs Satin comparison table", "", ""],
  ["图片插入位置", "如果需要图片，必须输出 Image Placement Map：图片用途、文件名、精确插入位置、目的、alt", "不能只写“放正文中”；要写 H2/H3、段落后、表格前后或 CMS featured image", "Cover: CMS featured image; comparison image: before comparison table", "", ""],
  ["FAQ", "从 People Also Ask / Semrush / GSC 提取", "每篇 3-6 个", "Is satin the same as silk?", "", ""],
  ["References触发判断", "判断本文是否需要外部引用：只有外部事实、官方定义、法律/年龄、健康、安全、电池/回收、行业标准、平台规则或研究数据才触发", "不需要时写“0引用，不添加References”；需要时用描述性锚文本，不展示裸 URL", "触发：FDA ENDS definition; EPA battery disposal guidance / 不触发：口味经验文", "", ""],
  ["E-E-A-T", "作者经验、来源、证据、可验证事实", "能降低 AI 味", "材质说明、护理测试、真实产品图", "", ""],
  ["发布后复盘", "30-60 天看 GSC", "没展现看意图，没点击改标题，没排名补内容/内链", "Clicks, impressions, avg position", "", ""],
  ["是否更新", "有排名苗头就更新", "不要只发不改", "补 FAQ、补对比表、补内部链接", "", ""],
];
styleBlock(brief.getRange("A5:F22"));
brief.getRange("A5:A22").format = { fill: theme.green2, font: { bold: true, color: theme.ink }, wrapText: true };
brief.freezePanes.freezeRows(4);

const dashboard = addSheet("仪表盘");
title(dashboard, "A1:H1", "文章关键词筛选仪表盘", "把关键词池的状态汇总成可复盘的内容生产看板。");
setWidths(dashboard, { A: 22, B: 16, C: 20, D: 18, E: 24, F: 18, G: 18, H: 18 });
dashboard.getRange("A4:B4").values = [["指标", "结果"]];
styleHeader(dashboard.getRange("A4:B4"));
dashboard.getRange("A5:A12").values = [
  ["关键词总数"],
  ["P0 立即写"],
  ["P1 排期写"],
  ["P2 低优先/FAQ"],
  ["P3 不单独写"],
  ["平均分"],
  ["SERP文章占比均值"],
  ["商业支撑均值"],
];
dashboard.getRange("B5:B12").formulas = [
  ["=COUNTA('文章关键词池'!$A$2:$A$101)"],
  ["=COUNTIF('文章关键词池'!$AD$2:$AD$101,\"P0\")"],
  ["=COUNTIF('文章关键词池'!$AD$2:$AD$101,\"P1\")"],
  ["=COUNTIF('文章关键词池'!$AD$2:$AD$101,\"P2\")"],
  ["=COUNTIF('文章关键词池'!$AD$2:$AD$101,\"P3\")"],
  ["=IFERROR(AVERAGE('文章关键词池'!$AC$2:$AC$101),0)"],
  ["=IFERROR(AVERAGE('文章关键词池'!$I$2:$I$101),0)"],
  ["=IFERROR(AVERAGE('文章关键词池'!$W$2:$W$101),0)"],
];
dashboard.getRange("A5:B12").format = { fill: theme.light, borders: { preset: "inside", style: "thin", color: theme.gray }, wrapText: true };
dashboard.getRange("B5:B9").format.numberFormat = "#,##0";
dashboard.getRange("B10:B12").format.numberFormat = "0.0";
section(dashboard, "D4:H4", "判断口径");
dashboard.getRange("D5:H12").values = [
  ["先看 SERP", "文章占比低于 4 的词，不要急着写博客。", "", "", ""],
  ["再看商业页", "每篇文章必须支撑一个分类/商品/集合页。", "", "", ""],
  ["再看内容深度", "能否做出表格、图片、对比、经验、FAQ。", "", "", ""],
  ["最后排期", "P0/P1 进入内容日历，P2 可做 FAQ，P3 不单独写。", "", "", ""],
  ["2C迁移", "博客负责教育和决策，分类/商品页负责转化。", "", "", ""],
  ["发文节奏", "起步 10篇/月，成长 20篇/月，发展约30篇/月。", "", "", ""],
  ["复盘", "30-60 天看 GSC，有苗头就补内容和内链。", "", "", ""],
  ["风险", "不要为了凑数量写定义文，也不要让博客孤岛化。", "", "", ""],
];
styleBlock(dashboard.getRange("D5:H12"));
dashboard.getRange("A14:H14").merge();
dashboard.getRange("A14:H14").values = [["建议使用节奏"]];
dashboard.getRange("A14:H14").format = { fill: theme.green2, font: { bold: true, color: theme.ink } };
dashboard.getRange("A15:H18").values = [
  ["网站阶段", "参考指标", "建议发文", "关键词选择", "文章类型", "内容要求", "复盘重点", "备注"],
  ["起步期", "DA 0-10 / Semrush流量<300", "10篇/月", "长尾 + 商业支撑强", "教程/对比/场景", "少而深", "收录/展现", "不要为了日更牺牲质量"],
  ["成长期", "DA≤15 / 流量500以内", "20篇/月", "补核心词 + 长尾矩阵", "榜单/标准/指南", "形成主题簇", "点击/排名", "围绕一个产品线扩展"],
  ["发展期+", "DA>15 / 流量>1000", "约30篇/月", "核心词矩阵 + 高价值深度文", "深度指南/数据文", "权威和转化", "商业页排名", "优先更新已有内容"],
];
styleHeader(dashboard.getRange("A15:H15"));
styleBlock(dashboard.getRange("A16:H18"));

for (const sheet of [standard, positioning, aiPrompt, guide, rules, pagePlan, pool, calendar, brief, dashboard]) {
  const used = sheet.getUsedRange();
  used.format.wrapText = true;
  used.format.verticalAlignment = "top";
}

const inspections = [];
inspections.push(await workbook.inspect({
  kind: "table",
  sheetId: "文章关键词池",
  range: "A1:AL12",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 38,
  maxChars: 8000,
}));
inspections.push(await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
  maxChars: 4000,
}));
await fs.writeFile(path.join(outputDir, "verification.ndjson"), inspections.map((x) => x.ndjson).join("\n"));

for (const sheetName of ["标准骨架", "网站定位输入卡", "AI协作Prompt", "使用说明", "评分规则", "页面规划", "文章关键词池", "内容日历", "文章Brief模板", "仪表盘"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, `${sheetName}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path.join(outputDir, "google_seo_article_keyword_standard_framework_linked.xlsx"));
