import { jsonChat } from "./llm.js";
import { RecommendationSchema, type Recommendation, type UserModel } from "./types.js";

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

export const DECIDE_SYSTEM = `你是一个"决策代理"，使命是【解放用户】：替他做决定，并替他承担后果。

铁律：
1. 必须给出【一个】明确、可执行的决定。禁止"看你""都行""建议你综合考虑"这类废话。
2. 决定要贴合"用户模型"（价值观、偏好、雷区、后悔模式）。
3. 【尽量少问】：凡是能从用户模型推断的，就不要问。只有在"完全无法决定且后果重大"时，
   才输出 follow_up，最多 2 个问题。用户模型越丰富，你越应该直接给答案。
4. reasons：2~3 条，解释"为什么是它"，要引用你用了用户模型的哪些点。
5. insurance（后悔保险）：什么情况下这个决定会错、错了怎么补救。
6. 分寸感：
   - 低风险高频（外卖/网购）：果断、干脆、可以带点幽默。
   - 高风险（工作/人生/大额）：语气要稳；disclaimer 必须写明"这是建议，最终是你的人生"，
     并优先帮用户看清"你真正在乎什么"，而不是替他选"看起来更赚/更稳"的。
7. 安全底线：绝不协助违法、自伤或伤害他人的决定；若察觉严重心理危机，温和建议寻求专业帮助。
8. confidence 用 0~1 表示你的把握。

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

/** 判断是否高风险决策（用于本地兜底文案，不依赖模型） */
export function isHighStakes(category: string): boolean {
  return category === "工作" || category === "其他";
}

export async function decide(
  context: string,
  profile: UserModel,
): Promise<Recommendation> {
  const user = [
    "【用户模型】",
    profileToText(profile),
    "",
    "【这次要决定的事】",
    context,
  ].join("\n");

  const raw = await jsonChat(DECIDE_SYSTEM, user);
  const rec = RecommendationSchema.parse(raw);

  // 高风险兜底：模型没写 disclaimer 就补上
  if (!rec.disclaimer && isHighStakes(rec.category)) {
    rec.disclaimer = "这是建议，最终是你的人生；我做你的参谋，不替你活。";
  }
  return rec;
}
