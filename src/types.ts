import { z } from "zod";

/**
 * 用户模型 —— 产品的核心资产。
 * 它随着每次决策的"结果"被动更新，用户无需主动维护。
 * 文件位置：data/profile.json（本地优先，可查看、可修改、可删除）
 */
export const ValueWeightSchema = z.object({
  name: z.string(), // 例如 "省钱"、"质量"、"新鲜感"、"稳定"
  weight: z.number().min(0).max(1), // 0~1，越大越在乎
  note: z.string().optional(),
});

export const UserModelSchema = z.object({
  /** 价值观权重：决定时优先满足哪些 */
  values: z.array(ValueWeightSchema).default([]),
  /** 明确偏好 */
  preferences: z.array(z.string()).default([]),
  /** 雷区：绝对不能碰的 */
  dealbreakers: z.array(z.string()).default([]),
  /** 后悔模式：什么类型的决定他事后容易后悔 */
  regretPatterns: z.array(z.string()).default([]),
  /** 决策统计（用于评估 suggesion 被接受率/后悔率） */
  stats: z
    .object({
      decisions: z.number().default(0),
      accepted: z.number().default(0),
      rejected: z.number().default(0),
      regretted: z.number().default(0),
    })
    .default({ decisions: 0, accepted: 0, rejected: 0, regretted: 0 }),
  /** 最近一次学习到的东西，方便回看 */
  lastLearned: z.string().optional(),
});

export type UserModel = z.infer<typeof UserModelSchema>;
export type ValueWeight = z.infer<typeof ValueWeightSchema>;

export const CategorySchema = z
  .enum(["外卖", "网购", "工作", "其他"])
  .catch("其他");
export type Category = z.infer<typeof CategorySchema>;

/** 代理给出的决定 */
export const RecommendationSchema = z.object({
  category: CategorySchema,
  recommendation: z.string(),
  reasons: z.array(z.string()).default([]),
  insurance: z.string().default(""),
  disclaimer: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.6),
  follow_up: z.array(z.string()).default([]),
  signals_used: z.array(z.string()).default([]),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

/** 决策日志里的一条记录 */
export const DecisionRecordSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  context: z.string(),
  rec: RecommendationSchema,
  outcome: z
    .object({
      recordedAt: z.string(),
      result: z.enum(["accepted", "rejected", "other"]),
      chose: z.string().optional(),
      regret: z.enum(["no", "maybe", "yes"]).optional(),
      note: z.string().optional(),
    })
    .optional(),
});
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;

/** 学习阶段，LLM 提炼出的"对用户的稳定结论" */
export const LearningSchema = z.object({
  learned: z.string().default(""),
  preferences: z.array(z.string()).default([]),
  dealbreakers: z.array(z.string()).default([]),
  regretPatterns: z.array(z.string()).default([]),
  values: z.array(ValueWeightSchema).default([]),
});
export type Learning = z.infer<typeof LearningSchema>;
