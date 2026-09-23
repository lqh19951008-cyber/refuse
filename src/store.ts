import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  UserModelSchema,
  DecisionRecordSchema,
  type UserModel,
  type DecisionRecord,
} from "./types.js";

const DATA_DIR = process.env.DECISION_DATA_DIR ?? "data";
const PROFILE_PATH = join(DATA_DIR, "profile.json");
const LOG_PATH = join(DATA_DIR, "decisions.jsonl");

export async function ensureDataDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
}

export function emptyProfile(): UserModel {
  return UserModelSchema.parse({});
}

export async function loadProfile(): Promise<UserModel> {
  await ensureDataDir();
  if (!existsSync(PROFILE_PATH)) return emptyProfile();
  const raw = await readFile(PROFILE_PATH, "utf8");
  return UserModelSchema.parse(JSON.parse(raw));
}

export async function saveProfile(profile: UserModel): Promise<void> {
  await ensureDataDir();
  await writeFile(PROFILE_PATH, JSON.stringify(profile, null, 2), "utf8");
}

export async function resetProfile(): Promise<void> {
  await saveProfile(emptyProfile());
}

export async function appendDecision(record: DecisionRecord): Promise<void> {
  await ensureDataDir();
  await appendFile(LOG_PATH, JSON.stringify(record) + "\n", "utf8");
}

export async function readDecisions(): Promise<DecisionRecord[]> {
  if (!existsSync(LOG_PATH)) return [];
  const raw = await readFile(LOG_PATH, "utf8");
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => DecisionRecordSchema.parse(JSON.parse(l)));
}

export async function overwriteDecisions(
  records: DecisionRecord[],
): Promise<void> {
  await ensureDataDir();
  await mkdir(dirname(LOG_PATH), { recursive: true }).catch(() => {});
  await writeFile(
    LOG_PATH,
    records.map((r) => JSON.stringify(r)).join("\n") + "\n",
    "utf8",
  );
}

export async function findDecision(
  id: string,
): Promise<DecisionRecord | undefined> {
  const all = await readDecisions();
  // 支持按完整 id 或末尾片段匹配
  return all.find((d) => d.id === id || d.id.endsWith(id));
}

/** 取最近的决定（可按类别过滤），用于给代理做“避免重复/轮换”的参考 */
export async function recentDecisions(
  category?: string,
  limit = 6,
): Promise<DecisionRecord[]> {
  const all = await readDecisions();
  const filt = category ? all.filter((d) => d.rec.category === category) : all;
  return filt.slice(-limit).reverse();
}

export function newId(): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}

export { PROFILE_PATH, LOG_PATH, DATA_DIR };
