import OpenAI from "openai";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-flash"; // 2026: 支持文本与图像输入

let _client: OpenAI | null = null;

export function client(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error(
      "缺少 DEEPSEEK_API_KEY。请在 .env 中配置（参考 .env.example）。",
    );
  }
  _client = new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL ?? DEFAULT_BASE_URL,
  });
  return _client;
}

export function modelName(): string {
  return process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL;
}

/** 调用模型并返回 JSON 对象（容错解析 Markdown 代码块） */
export async function jsonChat(
  system: string,
  user: string,
): Promise<unknown> {
  const res = await client().chat.completions.create({
    model: modelName(),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  } as never);

  const raw = res.choices[0]?.message?.content ?? "{}";
  return parseJson(raw);
}

export function parseJson(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  return JSON.parse(cleaned);
}
