# agent

自动抓取帖子、按 filter prompt 筛选后写进 Supabase，并根据标注迭代 filter prompt。独立于 `app/` 和 `supabase/`，只通过 Supabase 交互。

## 流程

1. `collect.mjs`（搜索）：用登录态在 X 的 Latest 里搜每个 topic 的关键词，展开全文、引用、链接，图片和音视频总结成文字，追加到 `pool_<topic>.jsonl`。每个关键词往下滚，碰到比上次看到的最新帖子更早的帖子就停（`search_keywords.last_posted_at`），最多抓的条数由 channel 设置决定（`strategy.posts_per_keyword`，5–50 条）。
2. `filter.mjs`（filter agent）：对 pool 里没判断过的帖子，用该 channel 的 filter prompt 判断 yes / no / explore。
   - explore：帖子信息不足以判断时，说明缺什么，交给一个带 WebSearch 的 Claude 去找，再根据结果判断 yes / no，信息还不够可以继续 explore，最多 5 轮，第 5 轮后必须判断。不重复查帖子里已经写了的内容。
   - yes 写进 channel；no 不进 Supabase，只随机放入相当于 kept 数量 5% 的帖子，标为 dropped，用来发现误杀。
   - 所有判断记在 `filter_log.jsonl`，判断过的不会重判。
   - yes 的帖子由 agent 写一个 Reddit 风格的标题；写进 Supabase 时带发帖时间（`created_at`）和抓取时间（`collected_at`）。
   - 每个 channel 一批跑完，把这批帖子和这个 channel 当天（本机时区 0 点起）已保留的帖子放在一起，agent 按标题判断哪些是同一件事；脚本保留最先抓到的，删掉其余的，把它们的 X 链接加进保留帖子的 `sources`。
3. `refine.mjs`（refine agent）：读取一个 channel 里 owner 点过大拇指或写过 feedback 的帖子，从分歧中找 pattern，配 case，改写 filter prompt；再按每个关键词的收集数、通过数和赞踩数增删搜索关键词。两者都直接生效，改动记在 `refine_log.jsonl`。每次只读还没学过的标注帖子，学过的在 Supabase 里标 `posts.learned`；之后改了赞踩或 feedback 会自动变回没学过。

```
node collect.mjs         # 按抓取强度抓
node filter.mjs          # 可加数字限制每个 channel 处理几条
node refine.mjs startup  # 按 channel 迭代 prompt
```

## Prompt

- `prompts/template.md`：所有 channel 的 filter prompt 都按这个结构写（Reader / Keep / Drop / Explore），refine 也按它输出。
- `prompts/filter.md`、`explore.md`、`note.md`、`title.md`、`dedup.md`、`refine.md`：各 agent 的固定说明，`{{x}}` 由脚本填入。
- channel 的 filter prompt 存在 Supabase 的 `strategy.filter_prompt`，网页上可直接编辑。

## 配置

- 关键词存在 Supabase 的 `search_keywords`，`collect.mjs` 每次运行时读取。
- 脚本从仓库根目录的 `.env` 读 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`；Claude 通过本机 `claude -p` 调用。
- 定时任务：launchd `com.dave.collect`，每天 8:00–19:00 每小时整点跑一次 collect 后接 filter。
