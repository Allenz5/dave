# agent

自动抓取帖子、按 filter prompt 筛选后写进 Supabase，并根据标注迭代 filter prompt。独立于 `app/` 和 `supabase/`，只通过 Supabase 交互。

## 流程

1. `collect.mjs`（搜索）：用登录态在 X 的 Latest 里搜每个 topic 的关键词，展开全文、引用、链接，图片和音视频总结成文字，追加到 `pool_<topic>.jsonl`。目前手动运行。
2. `filter.mjs`（filter agent）：对 pool 里没判断过的帖子，用该 channel 的 filter prompt 判断 yes / no / explore。
   - explore：帖子内容不足以判断，或需要核实某个说法时，说明要搜什么，交给一个带 WebSearch 的 Claude 去查，再根据结果判断 yes / no。
   - yes 写进 channel；no 不进 Supabase，只随机放 10% 进去，标为 dropped，用来发现误杀。
   - 所有判断记在 `filter_log.jsonl`，判断过的不会重判。
3. `refine.mjs`（refine agent）：读取一个 channel 里被点赞、踩或评论过的帖子，从分歧中找 pattern，配 case，改写 filter prompt 并直接生效；改动记在 `refine_log.jsonl`。

```
node collect.mjs 10      # 每个关键词抓 10 条
node filter.mjs          # 可加数字限制每个 channel 处理几条
node refine.mjs startup  # 按 channel 迭代 prompt
```

## Prompt

- `prompts/template.md`：所有 channel 的 filter prompt 都按这个结构写（Reader / Keep / Drop / Verify），refine 也按它输出。
- `prompts/filter.md`、`explore.md`、`refine.md`：三个 agent 的固定说明，`{{x}}` 由脚本填入。
- channel 的 filter prompt 存在 Supabase 的 `strategy.filter_prompt`，网页上可直接编辑。

## 配置

- 关键词写在 `collect.mjs` 的 `TOPICS` 里，和 Supabase 的 `search_keywords` 目前靠手动同步。
- 脚本从仓库根目录的 `.env` 读 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`；Claude 通过本机 `claude -p` 调用。
- 定时任务：launchd `com.dave.collect`，跑 collect 后接 filter，目前已暂停（disabled）。
