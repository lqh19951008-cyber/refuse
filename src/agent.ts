import { jsonChat } from "./llm.js";
import {
  RecommendationSchema,
  type Recommendation,
  type UserModel,
  type DecisionRecord,
} from "./types.js";

/** 把用户模型压成给模型看的简洁文本 */
export function profileToText(p: UserModel): string {
  const values = p.values.length
    ? p.values
        .slice()
        .sort((a, b) => b.weight - a.weight)
        .map((v) => `${v.name}(${v.weight.toFixed(2)})`)
        .join(", ")
    : "（还没有，第一次可以多推断）";
  const list = (arr: string[]) => (arr.length ? arr.join("；") : "（暂无）");
  return [
    `价值观权重：${values}`,
    `明确偏好：${list(p.preferences)}`,
    `雷区：${list(p.dealbreakers)}`,
    `后悔模式：${list(p.regretPatterns)}`,
    `历史：共 ${p.stats.decisions} 次决定，采纳 ${p.stats.accepted}，拒绝 ${p.stats.rejected}，后悔 ${p.stats.regretted}`,
  ].join("\n");
}

/** 当前时间/餐次（让用户少说一句话） */
export function nowLine(): string {
  const now = new Date();
  const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const h = now.getHours();
  const meal =
    h < 10 ? "早餐" : h < 15 ? "午餐" : h < 17 ? "下午" : "晚餐/夜宵";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate(),
  )} ${days[now.getDay()]} ${pad(h)}:${pad(now.getMinutes())}（约${meal}时间）`;
}

/** 最近决定 → 给模型看的简短历史 */
export function decisionsToHistory(records: DecisionRecord[]): string {
  return records
    .map((d) => {
      const o = d.outcome;
      const actual = o?.chose ?? d.rec.recommendation;
      const tail = o
        ? ` → 实际：${actual}（${o.result}${
            o.regret ? `，后悔:${o.regret}` : ""
          }）`
        : "（还没反馈）";
      return `- [${d.rec.category}] 建议「${d.rec.recommendation}」${tail}`;
    })
    .join("\n");
}

export const DECIDE_SYSTEM = `你是一个"决策代理"，使命是【解放用户】：替他做决定，并替他承担后果。

铁律：
1. 必须给出【一个】明确、可执行的决定。禁止"看你""都行""建议你综合考虑"这类废话。
2. 决定要贴合"用户模型"（价值观、偏好、雷区、后悔模式）以及【最近的决定】。
3. 【尽量少问】：凡是能从用户模型、时间、历史推断的，就不要问。只有在"完全无法决定且后果重大"时，
   才输出 follow_up，最多 2 个问题。用户模型越丰富、你越应该直接给答案。
4. 注意"最近的决定"：不要短期内重复推荐同一样东西，尽量做健康的轮换；但用户明显偏爱某类时尊重偏好。
5. reasons：2~3 条，解释"为什么是它"，引用你用了用户模型的哪些点。
6. insurance（后悔保险）：什么情况下这个决定会错、错了怎么补救。
7. 分寸感：
   - 低风险高频（外卖/网购）：果断、干脆、可以带点幽默。
   - 高风险（工作/人生/大额）：语气要稳；disclaimer 必须写明"这是建议，最终是你的人生"，
     并优先帮用户看清"你真正在乎什么"，而不是替他选"看起来更赚/更稳"的。
8. 安全底线：绝不协助违法、自伤或伤害他人的决定；若察觉严重心理危机，温和建议寻求专业帮助。
9. confidence 用 0~1 表示你的把握。

只输出 JSON：
{
  "category": "外卖|网购|工作|其他",
  "recommendation": "一句话明确决定",
  "reasons": ["...", "..."],
  "insurance": "...",
  "disclaimer": "...",
  "confidence": 0.0,
  "follow_up": [],
  "signals_used": ["用到了模型里的哪些点"]
}`;

export const FOOD_EXTRA = `

【外卖模式补充】
- 目标是"别让用户思考"。根据时间、预算、用户模型和历史，直接给【一个具体到可下单】的选择。
- 尽量给"吃什么类型 + 怎么点/备注"，而不是泛泛的"吃点清淡的"。
- 别每次都给同一种，注意轮换；但用户反复接受某类就稳定推荐。
- 如果用户没说预算，按用户模型里的预算习惯（没有就按这类场景的常见水平）决定。`;

/** 判断是否高风险决策（用于本地兜底文案，不依赖模型） */
export function isHighStakes(category: string): boolean {
  return category === "工作" || category === "其他";
}

export interface DecideExtras {
  /** 最近的决定，帮助避免重复/做轮换 */
  history?: string;
  /** 把类别强制成某个值（如外卖快捷模式） */
  categoryHint?: string;
  /** 追加到系统提示的场景化补充 */
  systemExtra?: string;
}

export async function decide(
  context: string,
  profile: UserModel,
  extras: DecideExtras = {},
): Promise<Recommendation> {
  const user = [
    "【用户模型】",
    profileToText(profile),
    extras.history ? `\n【最近的决定（避免重复、可轮换）】\n${extras.history}` : "",
    `\n【当前时间】${nowLine()}`,
    extras.categoryHint ? `\n【场景】${extras.categoryHint}` : "",
    "\n【这次要决定的事】",
    context.trim() ||
      "（用户没多说什么，请结合当前时间、用户模型和最近历史，直接替他决定。）",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await jsonChat(DECIDE_SYSTEM + (extras.systemExtra ?? ""), user);
  const rec = RecommendationSchema.parse(raw);

  if (extras.categoryHint) rec.category = extras.categoryHint as never;

  // 高风险兜底：模型没写 disclaimer 就补上
  if (!rec.disclaimer && isHighStakes(rec.category)) {
    rec.disclaimer = "这是建议，最终是你的人生；我做你的参谋，不替你活。";
  }
  return rec;
}
