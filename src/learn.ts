import { jsonChat } from "./llm.js";
import {
  LearningSchema,
  type Learning,
  type DecisionRecord,
  type UserModel,
} from "./types.js";

export const LEARN_SYSTEM = `你在维护一个"用户模型"——用来帮这个用户做决策。
现在给你一次完整的决策记录（他的纠结、代理的建议、他最终的选择与是否后悔）。
请提炼关于这个用户的【稳定、可复用】的结论。不要记录一次性细节。

原则：
- preferences：他稳定表现出的偏好。例："网购更看重质量而非价格"。
- dealbreakers：他明确拒绝/反感的东西。
- regretPatterns：他事后容易后悔的决定类型。
- values：价值观权重（name + weight 0~1）。若与已有冲突，给出你更新的判断。
- 只写有证据支持的；没有把握就留空数组。宁缺毋滥。

只输出 JSON：
{ "learned": "一句话总结这次学到了什么", "preferences": [], "dealbreakers": [], "regretPatterns": [], "values": [{"name":"", "weight":0.0, "note":""}] }`;

export function applyOutcomeToStats(
  profile: UserModel,
  rec: DecisionRecord["outcome"],
): void {
  if (!rec) return;
  profile.stats.decisions += 1;
  if (rec.result === "accepted") profile.stats.accepted += 1;
  else if (rec.result === "rejected") profile.stats.rejected += 1;
  if (rec.regret === "yes" || rec.regret === "maybe") {
    profile.stats.regretted += 1;
  }
}

export async function reflect(
  record: DecisionRecord,
  profile: UserModel,
): Promise<Learning> {
  const o = record.outcome!;
  const user = [
    "【当前用户模型】",
    JSON.stringify(profile, null, 2),
    "",
    "【决策记录】",
    `纠结：${record.context}`,
    `代理建议：${record.rec.recommendation}`,
    `建议理由：${record.rec.reasons.join(" / ")}`,
    `他的选择：${o.chose ?? "（未填）"}`,
    `结果：${o.result}；后悔：${o.regret ?? "（未填）"}`,
    o.note ? `备注：${o.note}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await jsonChat(LEARN_SYSTEM, user);
  return LearningSchema.parse(raw);
}

/** 把学习结果合并进用户模型（去重、按名字更新价值观权重） */
export function mergeLearning(profile: UserModel, l: Learning): UserModel {
  const uniq = (a: string[], b: string[]) => Array.from(new Set([...a, ...b]));
  profile.preferences = uniq(profile.preferences, l.preferences);
  profile.dealbreakers = uniq(profile.dealbreakers, l.dealbreakers);
  profile.regretPatterns = uniq(profile.regretPatterns, l.regretPatterns);

  for (const v of l.values) {
    const existing = profile.values.find((x) => x.name === v.name);
    if (existing) {
      existing.weight = v.weight;
      if (v.note) existing.note = v.note;
    } else {
      profile.values.push(v);
    }
  }
  if (l.learned) profile.lastLearned = l.learned;
  return profile;
}
