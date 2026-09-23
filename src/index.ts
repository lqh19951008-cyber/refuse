#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { decide, decisionsToHistory, FOOD_EXTRA } from "./agent.js";
import {
  loadProfile,
  saveProfile,
  resetProfile,
  appendDecision,
  findDecision,
  readDecisions,
  overwriteDecisions,
  recentDecisions,
  newId,
  PROFILE_PATH,
} from "./store.js";
import { applyOutcomeToStats, reflect, mergeLearning } from "./learn.js";
import type { Category, Recommendation } from "./types.js";

const program = new Command();
program
  .name("decide")
  .description("替我决定 —— 一个会成长、越用越少输入的决策代理")
  .version("0.1.0");

function printRecommendation(rec: Recommendation, id: string): void {
  console.log("");
  console.log(`💡 决定：${rec.recommendation}`);
  console.log("");
  console.log("为什么：");
  for (const r of rec.reasons) console.log(`  · ${r}`);
  if (rec.insurance) {
    console.log("");
    console.log(`🛟 后悔保险：${rec.insurance}`);
  }
  if (rec.disclaimer) {
    console.log("");
    console.log(`⚠️  ${rec.disclaimer}`);
  }
  if (rec.follow_up.length) {
    console.log("");
    console.log("🤔 要更准的话，告诉我：");
    for (const q of rec.follow_up) console.log(`  - ${q}`);
  }
  console.log("");
  console.log(
    `（把握 ${(rec.confidence * 100).toFixed(0)}% · 类别 ${rec.category} · 记录号 ${id}）`,
  );
}

program
  .command("decide", { isDefault: true })
  .description("把纠结交给代理，拿一个明确决定")
  .argument("<context>", "描述你的纠结与选项")
  .option("--json", "只输出 JSON", false)
  .action(async (context: string, opts) => {
    const profile = await loadProfile();
    if (profile.stats.decisions === 0 && profile.values.length === 0) {
      console.log(
        "（第一次使用，用户模型还是空的。我会先凭这单次信息决定，\n 之后把结果反馈给我，我就会越来越懂你。）\n",
      );
    }
    const rec = await decide(context, profile, {
      history: decisionsToHistory(await recentDecisions(undefined, 6)),
    });
    const id = newId();
    await appendDecision({
      id,
      createdAt: new Date().toISOString(),
      context,
      rec,
    });
    if (opts.json) {
      console.log(JSON.stringify({ id, ...rec }, null, 2));
    } else {
      printRecommendation(rec, id);
      console.log(
        `\n做完之后，回来告诉我结果，我会学：\n  pnpm dev outcome ${id} --result accepted --regret no\n`,
      );
    }
  });

program
  .command("eat")
  .alias("吃")
  .description("外卖快捷模式：尽量少说话，直接替你做决定（自动带时间/历史）")
  .argument("[hint]", "可选，一句话补充（如 '想吃辣' / '吃不下饭'）", "")
  .option("--budget <n>", "预算（元）")
  .option("--json", "只输出 JSON", false)
  .action(async (hint: string, opts) => {
    const profile = await loadProfile();
    const history = decisionsToHistory(await recentDecisions("外卖", 6));
    const ctx = [hint, opts.budget ? `预算约 ${opts.budget} 元` : ""]
      .filter(Boolean)
      .join("；");
    const rec = await decide(ctx, profile, {
      history,
      categoryHint: "外卖",
      systemExtra: FOOD_EXTRA,
    });
    const id = newId();
    await appendDecision({
      id,
      createdAt: new Date().toISOString(),
      context: ctx || "（外卖快捷模式）",
      rec,
    });
    if (opts.json) {
      console.log(JSON.stringify({ id, ...rec }, null, 2));
    } else {
      printRecommendation(rec, id);
      console.log(
        `\n吃完回来记一笔（可选）：\n  pnpm dev outcome ${id} --result accepted --chose "实际吃的" --regret no\n`,
      );
    }
  });

program
  .command("outcome")
  .description("记录这次决定的真实结果，代理据此学习（越用越懂你）")
  .argument("<id>", "决定记录号（decide 输出里那个）")
  .requiredOption(
    "--result <r>",
    "结果：accepted=听了它的 / rejected=没听 / other=其他",
  )
  .option("--chose <text>", "你最终选了什么（可选）")
  .option("--regret <r>", "后悔吗：no | maybe | yes")
  .option("--note <text>", "备注")
  .action(async (id: string, opts) => {
    const record = await findDecision(id);
    if (!record) {
      console.error(`✗ 找不到记录：${id}`);
      process.exit(1);
    }
    const result = opts.result as "accepted" | "rejected" | "other";
    if (!["accepted", "rejected", "other"].includes(result)) {
      console.error("✗ --result 只能是 accepted / rejected / other");
      process.exit(1);
    }
    record.outcome = {
      recordedAt: new Date().toISOString(),
      result,
      chose: opts.chose,
      regret: opts.regret,
      note: opts.note,
    };

    const profile = await loadProfile();
    applyOutcomeToStats(profile, record.outcome);

    process.stdout.write("🧠 正在从这次结果里学习...");
    const learning = await reflect(record, profile);
    mergeLearning(profile, learning);
    await saveProfile(profile);

    // 更新日志
    const all = await readDecisions();
    const idx = all.findIndex((d) => d.id === record.id);
    if (idx >= 0) {
      all[idx] = record;
      await overwriteDecisions(all);
    }

    console.log(" 完成");
    if (learning.learned) console.log(`\n学到：${learning.learned}`);
    const changed = [
      learning.preferences.length && `新偏好 +${learning.preferences.length}`,
      learning.dealbreakers.length && `新雷区 +${learning.dealbreakers.length}`,
      learning.regretPatterns.length && `后悔模式 +${learning.regretPatterns.length}`,
      learning.values.length && `价值观更新 ${learning.values.length}`,
    ].filter(Boolean);
    if (changed.length) console.log(`（${changed.join("，")}）`);
  });

program
  .command("profile")
  .description("查看代理眼中的你（可查看 / 可修改 / 可删除）")
  .action(async () => {
    const p = await loadProfile();
    console.log(`\n用户模型（${PROFILE_PATH}）:\n`);
    console.log(JSON.stringify(p, null, 2));
    console.log(
      `\n价值观：
${p.values
  .slice()
  .sort((a, b) => b.weight - a.weight)
  .map((v) => `  ${v.name.padEnd(8)} ${"█".repeat(Math.round(v.weight * 10))} ${v.weight.toFixed(2)}`)
  .join("\n") || "  （空）"}`,
    );
  });

program
  .command("forget")
  .description("清空用户模型（数据主权）")
  .action(async () => {
    await resetProfile();
    console.log("✓ 已清空用户模型。代理已经忘了你。");
  });

program
  .command("stats")
  .description("评估：建议被接受率 / 后悔率（也是这个项目的 Evals）")
  .action(async () => {
    const decisions = await readDecisions();
    const done = decisions.filter((d) => d.outcome);
    const accepted = done.filter((d) => d.outcome!.result === "accepted").length;
    const rejected = done.filter((d) => d.outcome!.result === "rejected").length;
    const regretted = done.filter(
      (d) => d.outcome!.regret === "yes" || d.outcome!.regret === "maybe",
    ).length;
    const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(0)}%` : "—");
    console.log(`\n决策共 ${decisions.length} 次，已反馈 ${done.length} 次：`);
    console.log(`  接受率：${pct(accepted, done.length)}（${accepted}/${done.length}）`);
    console.log(`  拒绝率：${pct(rejected, done.length)}`);
    console.log(`  后悔率：${pct(regretted, done.length)}`);
    console.log(
      `\n提示：接受率升高、后悔率下降 = 它越来越懂你。`,
    );
  });

program.parseAsync().catch((err) => {
  console.error(`\n✗ 出错: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
