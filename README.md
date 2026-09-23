# 替我决定 (decision-agent)

一个**会成长、越用越少输入**的决策代理。使命：**解放用户**——替你做决定，并替你承担后果。

> 核心原则：
> - **零输入（输入递减）**：第一次可以麻烦，之后越来越少。靠"结果"被动学习，不靠你主动维护。
> - **是代理，不是工具**：它主动替你决定，不等你操作。
> - **替你决定 + 替你扛**："错了算我的"。
> - **防后悔**：给出"后悔保险"。
> - **越用越懂你**：每次结果都会更新"用户模型"。
> - **本地优先**：数据都在本地 `data/`，可查看、可修改、可删除。
> - **分寸感**：外卖果断；工作/人生要稳，绝不替你活。

## 快速开始

```bash
pnpm install
cp .env.example .env      # 填入你的 DEEPSEEK_API_KEY（Windows: copy .env.example .env）
```

## 用法

```bash
# 1) 把纠结交给代理
pnpm dev decide "点外卖，预算30，想吃清淡的，三个备选：沙拉/粥/日料"

# 2) 做完之后，回来告诉它结果 —— 它就会学
pnpm dev outcome <记录号> --result accepted --regret no
pnpm dev outcome <记录号> --result rejected --chose "自己煮面" --regret yes

# 3) 看看它眼中的你（可查看 / 可修改 / 可删除）
pnpm dev profile

# 4) 评估：建议被接受率、后悔率
pnpm dev stats

# 5) 清空重来（数据主权）
pnpm dev forget
```

`decide` 也支持 `--json` 输出结构化结果。

## 它怎么"越用越少输入"

```
你（第一次）说清想法
     ↓
它替你做决定  ──►  看结果（接受/拒绝/后悔）
     ↑                      │
     └──── 更新"用户模型" ◄──┘
     （下次需要更少的输入）
```

用户模型（`data/profile.json`）包含：价值观权重、偏好、雷区、后悔模式、决策统计。
每次 `outcome`，代理会据此提炼新的稳定结论并合并进去。

## 技术栈
- TypeScript + Node + `tsx`
- DeepSeek（`deepseek-flash`，OpenAI 兼容）
- Zod 做结构化校验
- 本地 JSON/JSONL 存储（无数据库）

## 接下来可以做
- 低风险的集成：网购链接解析、外卖历史导入（进一步降低输入）
- Web UI / 浏览器插件
- 把"接受率 / 后悔率"做成评估面板（Evals）
