# OpenCodeReview (`ocr`) 使用手册

AI 驱动的代码审查 CLI，读取 git diff（或整个文件），发送给可配置的 LLM，生成审查意见。

顶层命令见 `cmd/opencodereview/root.go:56-65`。

---

## 1. `ocr review`（diff 审查，别名 `r`）

基于 diff 的代码审查。

```bash
ocr review                                              # 审查当前工作区（staged+unstaged+untracked）
ocr review --from master --to dev-ref                   # 分支合并基模式审查
ocr review --commit abc123                              # 单提交审查（-c）
ocr review --resume <session-id>                        # 断点续跑
ocr review --format json                                # JSON 输出（-f；也有 text/sarif）
ocr review --provider anthropic --model claude-opus-4-6 # 本次运行指定 provider/model
ocr review --audience agent                             # 代理模式（仅摘要，无进度行）
ocr review --preview                                    # 只预览将被审查的文件（-p）
ocr review --exclude '**/generated/*,**/testdata/*'     # 排除文件
ocr review --background "Adding rate limiting to login API"           # 业务背景（-b）
ocr review --background-file ./docs/requirements.md     # 背景 Markdown（-B）
ocr review --effort high --no-filter -o result.sarif    # 力度 + 不过滤 + 写文件(-o)
```

## 2. `ocr scan`（全文件扫描，别名 `s`）

无需 diff，扫描整个文件。

```bash
ocr scan                                                # 扫描整个仓库
ocr scan --path internal/agent                          # 扫描单目录
ocr scan --path internal/agent/agent.go,internal/diff/scan.go  # 扫多个文件
ocr scan --provider openai --model gpt-5.4 --format json
ocr scan --exclude '**/generated/*,**/testdata/*'
ocr scan --preview                                      # 不调用 LLM 预览
ocr scan --no-plan --no-dedup --no-summary              # 跳过 plan/dedup/summary 阶段
ocr scan --batch by-language                            # 批次策略 none|by-language|by-directory
ocr scan --resume <session-id>                          # 续跑
```

## 3. `ocr config`（配置管理）

配置文件默认位于 `~/.opencodereview/config.json`（可用 `OCR_CONFIG_PATH` 覆盖）。

```bash
ocr config provider                                    # 交互式选 provider
ocr config model                                       # 交互式选模型
ocr config set provider anthropic
ocr config set model claude-opus-4-6
ocr config set providers.anthropic.api_key "$ANTHROPIC_API_KEY"
ocr config set providers.anthropic.api_key_cmd "op read op://vault/key"
ocr config set language Chinese                         # 报告用中文
ocr config set max_tokens 8192
ocr config set effort high                              # low|medium|high
ocr config set custom_providers.my-gw.url https://gateway.internal.com/v1
ocr config set custom_providers.my-gw.protocol openai
ocr config set mcp_servers.playwright.command npx
ocr config set llm.url https://api.example.com/v1
ocr config set telemetry.enabled false
ocr config unset provider                               # 删除配置
ocr config unset custom_providers.my-provider
```

### 配置项结构

定义在 `cmd/opencodereview/config_cmd.go:350-384`，有效键清单见 `config_cmd.go:420-444`。

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-5",
  "max_tokens": 8192,
  "effort": "medium",
  "language": "Chinese",
  "providers": {
    "anthropic": {
      "api_key": "sk-ant-xxx",
      "protocol": "anthropic",
      "model": "claude-sonnet-4-5",
      "auth_header": "x-api-key",
      "timeout_sec": 120,
      "extra_body": { "thinking": { "type": "enabled" } },
      "extra_headers": { "X-Client": "ocr" },
      "retry_codes": [429, 500, 502, 503, 504]
    }
  },
  "custom_providers": {
    "my-gateway": {
      "url": "https://gateway.example.com/v1",
      "api_key": "sk-xxx",
      "protocol": "openai",
      "model": "llama-3-70b",
      "models": ["llama-3-70b", "llama-3-8b"]
    }
  },
  "llm": {
    "url": "https://api.example.com/v1",
    "auth_token": "sk-xxx",
    "auth_header": "bearer",
    "model": "gpt-4o",
    "protocol": "openai",
    "timeout_sec": 120,
    "retry_codes": [429, 500]
  },
  "telemetry": {
    "enabled": false,
    "exporter": "console",
    "otlp_endpoint": "http://localhost:4318",
    "content_logging": false
  },
  "mcp_servers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"],
      "env": ["BROWSER=chromium"],
      "tools": ["browser_navigate", "browser_click"]
    },
    "remote-api": {
      "type": "remote",
      "url": "https://mcp.example.com",
      "headers": { "Authorization": "Bearer xxx" }
    }
  }
}
```

| 键                                 | 说明               | 取值                                                                                                                                    |
| --------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `provider`                        | 激活的 provider     | 预设：`anthropic`、`openai`、`bedrock`、`gemini`、`dashscope`、`deepseek`、`kimi` 等（见 `internal/llm/providers.go`）；非预设名自动归入 `custom_providers` |
| `model`                           | 模型名              | 写入当前 provider 下                                                                                                                       |
| `max_tokens`                      | 最大 token         | 正整数                                                                                                                                   |
| `effort`                          | 审查力度（审查轮数）       | `low`(1 轮) / `medium`(2 轮, 默认) / `high`(3 轮)，见 `internal/config/template/effort.go`                                                   |
| `language`                        | 报告输出语言           | 默认为 `English`，如 `Chinese`                                                                                                             |
| `providers.<name>.<field>`        | 预设 provider 详细配置 | 字段见下                                                                                                                                  |
| `custom_providers.<name>.<field>` | 自定义 provider     | 同上                                                                                                                                    |
| `llm.*`                           | 独立 LLM 端点配置      | 与 provider 二选一的路线                                                                                                                     |
| `telemetry`                       | 遥测               | `enabled`/`exporter`(`console`/`otlp`)/`otlp_endpoint`/`content_logging`                                                              |
| `mcp_servers.<name>`              | MCP 服务器          | `type`(`stdio` 默认/`remote`), `command`, `args`, `env`, `url`, `headers`, `tools`, `setup`                                             |

**provider 字段**（`config_cmd.go:617-690`）：`api_key`、`api_key_cmd`、`url`、`protocol`(`anthropic`/`anthropic-bedrock`/`openai`/`openai-responses`)、`model`、`models`、`auth_header`、`timeout_sec`、`extra_body`、`extra_headers`、`retry_codes`、`aws_region`、`aws_profile`（仅 bedrock）。

## 4. `ocr llm`（LLM 工具）

```bash
ocr llm test                                            # 测试 LLM 连通性
ocr llm providers                                       # 列出内置 provider
```

## 5. `ocr session`（会话，别名 `sessions`）

```bash
ocr session list                                        # 列出会话（ls）
ocr session list --limit 50 --repo /path/to/repo        # 带限制/指定仓库
ocr session show <session-id>                           # 查看单会话元数据
ocr session comments <session-id>                       # 查看评论
ocr session comments <id> --severity high,medium --category bug,security  # 过滤
ocr session compare <before-id> <after-id>              # 对比两次评论（diff）
# 以上均支持 --json 输出
```

## 6. `ocr delegate`（托管代理委派，不调 LLM，别名 `d`）

```bash
ocr delegate preview --from main --to feature           # 输出待审文件清单（元数据）
ocr delegate preview                                    # 工作区模式
ocr delegate rule internal/agent/agent.go internal/llm/client.go  # 按内容分组输出规则
ocr delegate preview --format json                      # 支持 -f text|json
```

## 7. `ocr rules`（规则调试）

```bash
ocr rules check src/main/java/com/example/Foo.java           # 该文件命中哪条规则
ocr rules check --rule custom.json src/main/resources/mapper/UserMapper.xml
```

命中结果即第 10 节规则链（custom → project → global → system）中第一条命中的规则；未显式指定规则文本时，输出中的规则原文可在第 10.3 节查到。

## 8. `ocr viewer`（Web UI，别名 `v`）

```bash
ocr viewer                    # 启动并打开浏览器（默认 localhost:5483）
ocr viewer --addr <ip>:3000       # 绑定所有网卡 3000 端口
ocr viewer --open=never       # 只打印 URL（auto/always/never）
```

## 9. 其他

```bash
ocr version                  # 版本信息（-V）
ocr completion               # shell 补全脚本
ocr help <command>           # 子命令帮助
```

---

## 通用 flags（review / scan / delegate 共用）

定义见 `cmd/opencodereview/shared_flags.go:202-259`。

| 标志                             | 说明                   |
| ------------------------------ | -------------------- |
| `--repo <dir>`                 | 仓库根目录                |
| `--rule <json>`                | 自定义审查规则文件            |
| `--exclude <patterns>`         | 逗号分隔 gitignore 风格排除  |
| `--concurrency N`              | 并发子任务（默认 8）          |
| `--timeout N`                  | 并发任务超时分钟（默认 15）      |
| `--max-tools N`                | 每子任务工具调用轮数上限（min 50） |
| `--max-tokens N`               | 单组/单文件 token 上限      |
| `--max-tokens-budget N`        | 总 token 预算上限         |
| `--max-git-procs N`            | 并发 git 子进程（默认 16）    |
| `--provider` / `--model`       | 本次运行覆盖 provider/模型   |
| `--output` / `-o <file>`       | 结果写入文件               |
| `--from` / `--to` / `--commit` | 审查范围（三者互斥）           |

## 报告语言设置为中文

CLI 方式：

```bash
ocr config set language Chinese
```

配置文件方式（`~/.opencodereview/config.json`）：

```json
{
  "language": "Chinese"
}
```

原理：`shared.go:255-259` 读取配置并调用 `tpl.ApplyLanguage(lang)`；`testconnection.go:42-46` 中 `resolveLang()` 默认值为 `"English"`，未设置时使用英文；`ApplyLanguage()` 会在所有 system-role 消息末尾追加 `\n\nAlways respond in <language>.`。

---

## `ocr review` 性能调优

慢的根因：**每个 group 内部是串行的 LLM 调用链**。默认 medium 力度跑 2 轮，每轮 MAIN_TASK 最多 100 次工具调用，每轮后还有一次 filter 调用。因此耗时 ≈ 组数 × 轮数 × 单轮调用数 × 模型延迟。并行只发生在 group 之间（`agent.go:665-672`）。

| 手段                    | 效果                              | 依据                         |
| --------------------- | ------------------------------- | -------------------------- |
| `--effort low`        | **最有效**，轮数 2→1，主循环 + filter 约减半 | `template/effort.go:34-38` |
| `--no-filter`         | 去掉每 group 每轮一次大 filter 调用       | `agent.go:1787-1791`       |
| `--exclude` 排掉生成/测试夹具 | 减少 group 数，直接减少并行单元             | `selection.go:84`          |
| `--concurrency 16`    | 仅当 group 数 >8 才有效，单组无加速         | `agent.go:667`             |
| `--model` 换低延迟模型      | 延迟由模型决定，最直接的墙钟来源                | —                          |
| `--max-tokens 60000`  | 降低单 group prompt 上限，触发更早压缩/丢文件  | `selection.go:44,56`       |

组合示例：

```bash
ocr review --effort low --no-filter --concurrency 16 \
  --exclude '**/generated/*,**/testdata/*,**/*.pb.go' \
  --model claude-haiku-4-5
```

避坑：

- `--max-tools` **只能调高不能调低**（默认 100，传 50 会被抬到 50/100 仍无效），无法减负（`shared.go:116-118`）。
- `--no-plan` / `--no-dedup` / `--no-summary` **是 scan 专属**，对 `review` 无效（`shared_flags.go:239-241`）。
- 只看文件清单不跑 LLM 用 `--preview`；复用上次结果用 `--resume <id>`。
- 每次 LLM 请求默认超时 5 分钟、默认重试 5 次退避；网络不稳会放大延迟（`llm/client.go:534-536,550`）。
- 可用 `--max-tokens-budget N` 设总 token 预算，超预算即停（部分结果、退出码 0）。

---

## 流式输出（stream）

`ocr` 的“流式”是**协议层 streaming**：客户端消费 SSE 再组装成完整响应，**不会把 token 实时打到终端**。目前**只支持 OpenAI Chat Completions 协议**（`protocol: "openai"`）。

触发方式：在 provider 的 `extra_body` 里设 `"stream": true`。

```json
{
  "provider": "my-gateway",
  "custom_providers": {
    "my-gateway": {
      "url": "https://gateway.example.com/v1",
      "api_key": "sk-xxx",
      "protocol": "openai",
      "model": "gpt-4o",
      "extra_body": { "stream": true }
    }
  }
}
```

CLI 等价写法（`extra_body` 是整体替换，不是合并）：

```bash
ocr config set custom_providers.my-gateway.extra_body '{"stream":true}'
```

若走 `llm.*` 路线：`"llm": { "url": "...", "protocol": "openai", "extra_body": { "stream": true } }`。

关键点与坑：

- **协议限制**：`anthropic`（`client.go:1300`）和 `openai-responses`（`responses_client.go:126`）会直接**丢弃** `stream` 键，不生效。
- **自动补 `stream_options.include_usage=true`**（`client.go:633-639`），否则流式响应不带用量统计。
- gateway 报错 `stream_options` 不被支持时，显式设 null 可彻底不发送：`"extra_body": { "stream": true, "stream_options": null }`（`client.go:640-655`）。
- 非流式请求里的 `stream` 字段会被剥除，避免误触 SSE（issue #647）。

## temperature

`temperature` 没有专门配置键，作为厂商参数通过 `extra_body` 透传到请求体（`client.go:1295-1317`、`client.go:620-631`）。

```json
{
  "provider": "my-gateway",
  "custom_providers": {
    "my-gateway": {
      "url": "https://gateway.example.com/v1",
      "protocol": "openai",
      "model": "gpt-4o",
      "extra_body": { "temperature": 0.2 }
    }
  }
}
```

```bash
ocr config set custom_providers.my-gateway.extra_body '{"temperature":0.2}'
```

注意：`temperature` 与 `stream` 同属 `extra_body`，**设置会整体替换**，要同时保留时须写在同一个 JSON 里，如 `{"stream":true,"temperature":0.2}`。`anthropic` 协议的 `thinking` 字段在 `tool_choice=required` 或预算冲突时会被自动丢弃（`client.go:1303-1316`），`temperature` 无此限制。

## `--audience`（输出读者）

指定输出的消费者，默认 `human`。定义见 `shared_flags.go:36`，行为见 `newQuietHandle`（`shared.go:394`）。

| 取值          | 行为                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| `human`（默认） | 打印实时进度行 `[ocr] ...`；配 `--format json/sarif` 时进度转到 **stderr**，保证 stdout 是干净可解析的文档（`shared.go:399-400`） |
| `agent`     | **完全丢弃进度输出**，只输出最终结果（`shared.go:397-398`）；text 格式下 trace summary 仍会打印（`shared.go:850-851`）            |

它不改结果格式，只改进度噪音多少——给上游 agent/脚本消费时用：

```bash
ocr review --audience agent --format json   # 只出 JSON，无进度噪音
ocr scan --audience agent                   # 只出结果
```

---

## 10. 内置审查规则（built-in system rules）

`ocr` 为每种语言/文件类型内置了一套审查规则（system rules），作为 system prompt 的一部分发给 LLM。没有命中的文件使用 `default.md` 兜底规则。

**源码位置**：规则本体 embed 在 `internal/config/rules/rule_docs/*.md`（57 个），glob → 规则的映射定义在 `internal/config/rules/system_rules.json`，加载与解析逻辑在 `internal/config/rules/system_rules.go`。

### 10.1 规则分层与优先级

规则解析按以下优先级链（first match wins）：

1. **custom**：`--rule <file>` 指定的自定义规则文件（最高）
2. **project**：仓库根目录 `.opencodereview/rule.json`
3. **global**：`~/.opencodereview/rule.json`
4. **system**：内置规则（本节收录的 `rule_docs/*`，最低）

要点：

- 用户规则默认**替换**命中的 system 规则；entry 设 `"merge_system_rule": true` 时，用户规则与命中的 system 规则按"System-Specific Rules (Mandatory) + User-Specific Rules (Mandatory)"两段合并（`composedResolver.Resolve`，`system_rules.go:444-504`）。
- 匹配大小写不敏感；`{a,b}` 花括号会先展开成多个 glob 再逐个匹配（`system_rules.go:166-177`）。
- `.m` 扩展名歧义（MATLAB 与 Objective-C 共用）：路径规则默认映射到 `matlab.md`，但 system 层包了一个内容嗅探器（`internal/config/rules/sniffer.go`）：读取 `.m` 文件的首个非空行（review 模式下按 `--to`/`--commit` 指定的 ref 用 `git show` 读取，否则读工作区），命中 `#import`/`#include`/`#pragma`/`#if`/`#define`/`@interface`/`@implementation`/`@class`/`@protocol`/`@import`/`//`/`/*` 等前缀即判为 Objective-C，改用 `objc.md`；读取失败或无结论时保留 `matlab.md`。嗅探只包在 system 层，用户层优先级始终高于嗅探，`merge_system_rule` 时合并的也是嗅探后的 system 规则。
- 规则文件引用（`.md`/`.txt`/`.markdown` 后缀、单行无空格）会被读取并替换为文件内容；大小上限 512 KB，project 层路径必须留在仓库内。
- 调试某文件命中哪条规则：`ocr rules check <path>`（见第 7 节）。

### 10.2 文件路径 → 规则映射表

声明顺序即优先顺序（`system_rules.json` 中 first match wins）。完整 mapping 见下表，规则原文见 10.3。

| # | 文件路径 glob | 规则文件 |
|---|---|---|
| 1 | `(兜底：未被任何模式命中的文件)` | `default.md` |
| 2 | `**/*.properties` | `properties.md` |
| 3 | `**/*{mapper,dao}*.xml` | `mapper_dao_xml.md` |
| 4 | `**/pom.xml` | `pom_xml.md` |
| 5 | `**/build.gradle` | `build_gradle.md` |
| 6 | `**/package.json` | `package_json.md` |
| 7 | `**/Cargo.toml` | `cargo_toml.md` |
| 8 | `**/composer.json` | `composer_json.md` |
| 9 | `**/*.{json,json5}` | `json.md` |
| 10 | `.github/workflows/**/*.{yaml,yml}` | `github_workflows.md` |
| 11 | `.github/**/*.{yaml,yml}` | `github_config.md` |
| 12 | `**/*.{yaml,yml}` | `yaml.md` |
| 13 | `**/*.java` | `java.md` |
| 14 | `**/*.go` | `go.md` |
| 15 | `**/*.{ftl,ftlh,ftlx}` | `freemarker.md` |
| 16 | `**/*.{hbs,mustache}` | `handlebars_mustache.md` |
| 17 | `**/*.{jinja2,j2}` | `jinja.md` |
| 18 | `**/*.pug` | `pug.md` |
| 19 | `**/*.ets` | `arkts.md` |
| 20 | `**/*.astro` | `astro.md` |
| 21 | `**/*.{ts,js,tsx,jsx,mjs,cjs}` | `ts_js_tsx_jsx.md` |
| 22 | `**/*.{kt,kts}` | `kotlin.md` |
| 23 | `**/*.{fs,fsi,fsx}` | `fsharp.md` |
| 24 | `**/*.rs` | `rust.md` |
| 25 | `**/*.{cpp,cc,cxx,hpp,hxx}` | `cpp.md` |
| 26 | `**/*.c` | `c.md` |
| 27 | `**/*.{py,pyi,ipynb}` | `python.md` |
| 28 | `**/*.{php,phtml}` | `php.md` |
| 29 | `**/*.proto` | `protobuf.md` |
| 30 | `**/*.po` | `po.md` |
| 31 | `**/*.pot` | `pot.md` |
| 32 | `**/*.{graphql,gql}` | `graphql.md` |
| 33 | `**/*.prisma` | `prisma.md` |
| 34 | `**/*.jl` | `julia.md` |
| 35 | `**/*.R` | `r.md` |
| 36 | `**/*.{tf,tofu,hcl,tfvars}` | `terraform.md` |
| 37 | `**/*.bicep` | `bicep.md` |
| 38 | `**/*.nix` | `nix.md` |
| 39 | `**/*.{hs,lhs}` | `haskell.md` |
| 40 | `**/*.{nim,nims,nimble}` | `nim.md` |
| 41 | `**/*.swift` | `swift.md` |
| 42 | `**/*.nu` | `nushell.md` |
| 43 | `**/*.elm` | `elm.md` |
| 44 | `**/*.{jsonnet,libsonnet}` | `jsonnet.md` |
| 45 | `**/*.zig` | `zig.md` |
| 46 | `**/*.thrift` | `thrift.md` |
| 47 | `**/*.capnp` | `capnp.md` |
| 48 | `**/*.{ml,mli} ／ **/*.{re,rei}` | `ocaml.md` |
| 49 | `**/*.{v,sv,vh}` | `verilog.md` |
| 50 | `**/*.{vhd,vhdl}` | `vhdl.md` |
| 51 | `**/*.m（路径匹配）` | `matlab.md` |
| 52 | `**/*.mm（路径匹配）；**/*.m（内容嗅探命中 Objective-C 时）` | `objc.md` |
| 53 | `**/*.sol` | `solidity.md` |
| 54 | `**/*.vy` | `vyper.md` |
| 55 | `**/*.rego` | `rego.md` |
| 56 | `**/*.{glsl,hlsl,wgsl,metal}` | `shader.md` |
| 57 | `**/*.{ps1,psm1,psd1}` | `powershell.md` |

### 10.3 各规则原文

以下为 `rule_docs/*.md` 原文，顺序同映射表（`*.m` 内容嗅探相关的 `objc.md` 附在 matlab 之后）。

#### 1. default.md

`````markdown
#### Correctness
Is the logic correct? Are there missing boundary conditions?
Are exceptions handled properly?
Is it thread-safe in concurrent scenarios?

#### Security
Are there security vulnerabilities such as SQL injection or XSS?
Is sensitive information handled correctly?
Is permission validation complete?

#### Performance
Are there obvious performance issues (e.g., N+1 queries, unnecessary loops)?
Are resources properly released?

#### Maintainability
Is the code clear and easy to understand?
Do names accurately express intent?
Does it follow the project’s existing code style and architecture patterns?

#### Test Coverage
Do critical logic paths have corresponding test cases?
Do test cases cover boundary conditions?
`````

#### 2. properties.md

`````markdown
#### Obvious Typos or Spelling Errors
- Spelling errors in key names, especially the standard spelling of common configuration items

#### Configuration Error Detection
- Duplicate key definitions within the visible scope of the current file causing configuration override issues
- Malformed key-value pairs (missing equals sign, extra whitespace, etc.)
- Special characters not properly escaped (e.g., backslashes in paths, Unicode characters, etc.)

#### Critical Security Issues
- Sensitive information (passwords, API keys, database connection strings, etc.) stored in plaintext
`````

#### 3. mapper_dao_xml.md

`````markdown
#### Obvious Spelling Error Detection
- Spelling errors in SQL keywords
- Spelling mismatches between mapper interface method names and XML `id` attributes
- Spelling errors in attribute names within dynamic SQL tags (e.g., field names in `test` conditions)

#### SQL Logic Error Detection
- **Condition Errors**: Misuse of logical operators in WHERE conditions (AND/OR confusion)
- **JOIN Condition Errors**: Incorrect fields used in join conditions or missing required join conditions
- **Dynamic SQL Logic Errors**: Incorrect `<if test="">` condition evaluation, such as null check errors or type check errors
- **SQL Syntax Errors**: Obvious syntax errors such as missing commas or unmatched parentheses

#### Critical Performance Issues
- **Full Table Scan Risk**: Missing WHERE conditions
- **Large Query Without Pagination**: Queries that may return large datasets without using LIMIT or pagination
- **Repeated Subqueries**: The same subquery used in multiple places; recommend extracting to a temporary table or optimizing SQL structure

#### SQL Injection Security Risk Detection

**Real security risks that should be reported:**
- **Direct String Concatenation**: Using `${}` to concatenate user input parameters into SQL statements poses SQL injection risks
- **LIKE Query Concatenation**: Directly concatenating LIKE conditions instead of using safe parameter binding

**Cases that should NOT be reported:**
- **Proper Use of #{} Parameter Binding**: MyBatis automatically escapes parameters, ensuring security
- **Static SQL Statements**: Fixed SQL statements that do not involve dynamic parameters

**Review Principles:**
- Focus on critical issues that may cause data corruption, performance problems, or security risks
- Consider the actual execution efficiency of SQL statements and their impact on database performance
- Prioritize identifying critical issues that could cause production failures
- Exercise caution when context is unclear: when the full execution context of SQL cannot be determined, choose to ignore rather than report a false positive
- Require sufficient evidence: only report issues when there is clear evidence of a problem
- Prefer false negatives over false positives: maintain high-precision issue identification to avoid drowning real issues in excessive false reports
`````

#### 4. pom_xml.md

`````markdown
In newly added code, the version must not contain the snapshot qualifier; any other version is allowed. Note: when no version is declared in the code, it is because the version is managed in the parent POM. Ignore this rule when the version number is not on a newly added line of code.
`````

#### 5. build_gradle.md

`````markdown
Avoid introducing snapshot version dependencies in production environments; use specific version numbers instead. Note: ignore this rule when the version number is not on a newly added line of code.
`````

#### 6. package_json.md

`````markdown
- Avoid introducing dependencies with a version of `latest` or `*`; use specific version numbers instead. Note: ignore this rule when the version number is not on a newly added line of code
- Dependency conflicts or duplicate declarations: the same dependency exists in both `dependencies` and `devDependencies`
- Required tool dependencies not declared: tool names such as eslint, jest, or prettier appear in `scripts` but are not listed in `devDependencies`
`````

#### 7. cargo_toml.md

`````markdown
#### Cargo Manifest Hygiene
- Avoid introducing wildcard dependency versions such as `*`; use an explicit compatible version requirement
- Avoid unpinned `git` dependencies in production crates unless a `rev`, `tag`, or documented policy makes the source reproducible
- Keep dependencies in the narrowest appropriate section: `dependencies`, `dev-dependencies`, `build-dependencies`, or target-specific dependencies
- Prefer workspace-managed versions and features in multi-crate repositories when the surrounding manifest already uses workspace inheritance

#### Edition, MSRV, and Resolver
- New packages should declare an explicit `edition`
- Library crates should declare `rust-version` when the repository has a minimum supported Rust version policy
- Workspaces using feature resolver v2 or newer should avoid accidentally falling back to legacy feature unification

#### Feature Flags
- Features should be additive and should not disable behavior in dependent crates
- Optional dependencies should be exposed through intentional feature names rather than leaking internal dependency names when that would become public API
- Default features should stay small for libraries; avoid enabling heavy optional integrations by default without a clear reason

#### Release and Metadata
- Published crates should include accurate `license` or `license-file`, `repository`, `description`, and relevant include/exclude settings
- Avoid accidentally packaging generated artifacts, credentials, local paths, test fixtures with secrets, or large binary assets
`````

#### 8. composer_json.md

`````markdown
#### Composer Manifest Review Principles
> Focus on newly introduced correctness, reproducibility, security, and deployment defects. Inspect source usage, CI, containers, deployment configuration, and nearby workspace manifests before claiming a dependency or platform incompatibility. Do not turn preferences about exact pins versus compatible ranges into findings.

#### Dependency Constraints and Resolution
- Wildcard constraints such as `*`, unconstrained `dev-*` branches, or mutable VCS references introduced without a committed, current lock file where application builds must be reproducible, or in a reusable library where consumers resolve dependencies themselves. Compatible version ranges are normal for libraries and should not be flagged by default.
- A changed constraint that unintentionally permits an incompatible major version, excludes the repository's supported range, or conflicts with another direct requirement.
- The same package declared inconsistently across `require` and `require-dev`, or a production package available only through development dependencies.
- A newly used package or mandatory PHP extension absent from `require`, causing clean production installs to fail.
- Do not report a known vulnerability without reliable advisory evidence applicable to the resolved version range.

#### PHP and Platform Compatibility
- The `php` constraint contradicts syntax or APIs used by the changed code, the framework's supported range, or the runtime configured in CI and deployment.
- A required native extension missing from `ext-*` requirements, or an extension requirement made mandatory even though the code has a working optional fallback.
- `config.platform` masking a runtime or extension mismatch that will occur in production. Confirm the actual deployment platform before reporting.
- Composer or plugin API requirements incompatible with the Composer version used by CI, containers, or release tooling.

#### Autoloading and Package Layout
- Incorrect PSR-4 namespace prefixes or paths, overlapping prefixes that resolve the wrong class, or moved classes left unreachable by autoload configuration.
- Production classes placed only in `autoload-dev`, or test-only helpers exposed through production autoloading when that changes packaged behavior.
- `autoload.files` additions that execute side effects on every Composer bootstrap or rely on an unsafe initialization order.
- Classmap, exclusion, or files entries left stale after directories are moved or renamed.

#### Scripts and Plugin Execution
- Lifecycle scripts that run destructive commands, interpolate untrusted environment values into a shell, require interactive input in CI, or invoke tools not available from declared dependencies.
- Composer scripts that recursively invoke Composer or make production installation depend on development-only packages or local state.
- A newly required Composer plugin without an intentional `config.allow-plugins` decision, or wildcard/broad authorization that permits unexpected plugin code to execute during install or update.
- Do not flag scripts or plugins solely because they execute code; establish a concrete unsafe command, trust-boundary change, or installation failure.

#### Repositories and Supply Chain
- `secure-http` disabled, plaintext repository URLs, embedded credentials, or newly introduced package sources without appropriate integrity and access controls.
- Repository priority or canonical settings that can cause a private/public package to resolve from an unintended source.
- `package` or VCS repositories pointing to mutable or unverifiable artifacts where reproducible source selection is required.
- Secrets, tokens, or private repository credentials exposed in committed manifest data. Report an internal URL only when the manifest is publicly distributed and the URL itself reveals sensitive infrastructure information.

#### Stability, Package Semantics, and Release Metadata
- `minimum-stability` weakened so unrelated development packages can enter resolution, especially without `prefer-stable`; verify whether a narrowly constrained development dependency would suffice.
- Incorrect `replace`, `provide`, or `conflict` declarations that can make Composer omit a required implementation or accept an incompatible package.
- Changes to `type`, `bin`, installer paths, archive include/exclude rules, or framework `extra` metadata that break installation or packaging.
- Published packages missing or invalid required metadata only when the repository is actually distributed as a package; do not apply publishing requirements to private applications.
`````

#### 9. json.md

`````markdown
Check JSON files for spelling errors in json-keys; ignore the content of json-values.
`````

#### 10. github_workflows.md

`````markdown
#### Security
- **pull_request_target misuse**: Using `pull_request_target` with `actions/checkout` referencing PR head code is dangerous — it runs untrusted code with write permissions. Flag if checkout ref points to PR head without isolation
- **Secrets exposure**: Secrets must not be printed to logs (e.g., `echo ${{ secrets.X }}`). Verify secrets are only passed via `env:` blocks to steps that need them
- **Excessive permissions**: Check if `permissions` is set to least-privilege. Flag `permissions: write-all` or missing `permissions` key (defaults to broad access). Each job should declare only the permissions it needs
- **Unpinned action versions**: Third-party actions should be pinned to a full commit SHA (e.g., `uses: actions/checkout@<sha>`), not just a tag. Tags are mutable and can be hijacked. First-party (`actions/*`) pinned to `v4` is acceptable
- **Script injection**: Expressions like `${{ github.event.issue.title }}` used directly in `run:` blocks enable code injection. These must be passed through environment variables instead
- **Hardcoded credentials**: Tokens, passwords, or API keys directly in the workflow file (not via secrets)

#### Correctness
- **Missing `fetch-depth: 0`**: When a workflow needs git history (tags, merge-base, changelog generation), verify `actions/checkout` uses `fetch-depth: 0`
- **Incorrect condition logic**: Verify `if:` conditions are correct (e.g., `github.event_name == 'pull_request'` vs `'pull_request_target'`); ensure boolean expressions are properly quoted
- **Matrix strategy gaps**: Check that matrix combinations cover required platforms. Flag if `fail-fast` is true (default) but all matrix legs must succeed
- **Missing `shell` specification**: When using `run:` with multi-line scripts on self-hosted runners, shell should be explicit (bash vs sh vs pwsh)
- **Broken job dependencies**: Verify `needs:` references exist as actual job IDs in the same workflow. Check for circular dependencies
- **Typos in action inputs**: Misspelled input names for actions (e.g., `fetch-detph` instead of `fetch-depth`) are silently ignored

#### Reliability
- **Missing timeout**: Jobs without `timeout-minutes` can run indefinitely and consume runner resources. Flag jobs that lack timeout (especially on self-hosted runners)
- **No concurrency control**: Workflows triggered by push/PR without `concurrency` group may create redundant runs. Suggest `concurrency` with `cancel-in-progress` where appropriate
- **Uncached dependencies**: Build workflows that install dependencies without caching (no `actions/cache` or built-in caching) on every run

#### Best Practices
- **Deprecated features**: Flag usage of deprecated syntax (`set-output`, `save-state`, `::set-output`, `actions/checkout@v2/v3` when v4 is available)
- **Missing `continue-on-error` awareness**: If a step failure should not fail the whole job, it needs `continue-on-error: true`; conversely, verify non-critical steps don't silently swallow failures with `|| true` hiding real errors
- **Container image tags**: Using `latest` tag for container images is unreliable; prefer specific version tags
`````

#### 11. github_config.md

`````markdown
#### Issue Template Validation
- **Missing required fields**: Issue templates should have `name`, `description`, and `body` fields
- **Invalid input types**: Verify `type` values in body inputs are valid (dropdown, input, textarea, checkboxes, markdown)
- **Empty options in dropdowns**: Dropdown type inputs must have non-empty `options` list
- **Missing `id` on inputs**: Form inputs without `id` cannot be parsed programmatically

#### Release Configuration
- **Undefined category labels**: Labels referenced in `categories[].labels` should exist in the repository (note: this is a warning, as labels may be created separately)
- **Missing default category**: A `release.yml` without a catch-all category (using `*`) may omit some PRs from release notes

#### General Structure
- **YAML syntax correctness**: Indentation consistency, proper quoting of special characters, valid anchors/aliases usage
- **Spelling errors in YAML keys**: Check for typos in configuration keys that would be silently ignored
`````

#### 12. yaml.md

`````markdown
Check for spelling errors in yaml-keys within YAML files; ignore the content of yaml-values.
`````

#### 13. java.md

`````markdown
#### Obvious Typos or Spelling Errors
- Spelling errors in variable names, method names, or class names at their declaration sites (confirm by searching for naming conventions of similar identifiers using `code_search`)
- Strings in log messages or exception messages containing spelling errors that affect readability
- Do not report spelling errors at reference sites, as these are typically determined by the declaration

#### Dead Code
- Code blocks that can never be reached (e.g., branches where the condition is always false, code after a return statement)
- Variables that are declared but never read or referenced
- Large blocks of commented-out code (with no apparent intent to preserve)

#### Logic Error Detection
- Incorrect if-condition logic (use `file_read` to examine surrounding context and confirm expected logic)
- Boundary condition handling errors (pay special attention to index and array length checks)
- Misuse of boolean logic operators (precedence and short-circuit evaluation issues)
- Obvious infinite loops or recursion without termination conditions
- Use of return/break/continue where exiting is not intended
- Missing break statements in switch cases causing unintended fall-through
- Intentional fall-through lacking explanatory comments
- Code patterns that may cause NPE (confirm risk by inspecting the data source call chain using `file_read` and `code_search`)
- Missing parentheses in logical expressions that may cause execution order to differ from intent

#### Severe Performance Issues
- Database queries executed inside loops (use `code_search` to confirm whether the method call involves database operations)
- N+1 query problems (suggest batch query optimizations)
- Processing large datasets without pagination (use `file_read` to understand data scale and processing context)
- Inefficient algorithm implementations in nested loops (O(n^2) or higher complexity where a more optimal solution exists)

#### Thread Safety Issue Detection
Only flag thread safety issues in the following cases:
- **Race conditions**: A "check-then-act" pattern exists where intermediate state may be altered by another thread
- **Non-atomic compound operations**: Multi-step operations that require atomicity but lack synchronization mechanisms
- **Unsafe lazy initialization**: Double-checked locking defects in singleton patterns or cache implementations
- **Concurrent writes to thread-unsafe collections**: Modifications to non-thread-safe collections such as ArrayList or HashMap in a multi-threaded environment

Do not report in the following cases:
- **Local variables within methods**: These are inherently thread-safe, as each thread has its own copy
- **Single-threaded context usage**: No evidence of multi-threaded invocation (confirm by searching for relevant call contexts using `code_search`)
- **Read-only operations**: Even with non-thread-safe data structures, if only read operations are performed
- **Immutable objects**: References to final fields pointing to immutable objects
- **Proper synchronization already in place**: Code already uses synchronized, Lock, atomic classes, or other correct synchronization mechanisms
- **Components designed for single-threaded use**: Such as the building phase of a Builder pattern, temporary data transfer objects, etc.
`````

#### 14. go.md

`````markdown
#### Go Review Principles
> Favor precision over recall: report only defects that are likely real in the changed code and its reachable context. A false positive costs reviewer trust. Treat correctness and security findings as blocking; style-only suggestions are non-blocking. Focus on language-specific risks that ordinary formatting and deterministic tooling do not already cover.

Before reporting a non-local claim, use `file_read` and `code_search` to establish the relevant call sites, ownership, synchronization, and input boundaries. Do not infer concurrent invocation, attacker control, resource ownership, or an error contract solely from a function name or package import. Do not duplicate findings that `go vet`, Staticcheck, `go test -race`, the compiler, or `gofmt` can determine reliably unless the diff shows a concrete user-visible consequence those tools will not express.

#### Errors, Panics, and API Contracts
- Errors returned from calls that are ignored, overwritten, or converted into success/default values that hide a failed operation. A deliberately best-effort operation is acceptable only when the ignored failure is safe and documented or evident from the context.
- Error wrapping that loses the original cause (`fmt.Errorf("...: %v", err)` when callers need `errors.Is`/`errors.As`), wraps nil, returns a misleading sentinel, or exposes internal/sensitive details at a public boundary. Prefer `%w` when preserving identity is required.
- `panic`, `log.Fatal`, `os.Exit`, or a must-style helper in request, worker, library, or cleanup paths where a recoverable error can be returned. Do not flag an impossible internal invariant or documented programmer contract.
- Deferred cleanup that overwrites a primary error, drops a meaningful `Close`/`Commit`/`Rollback` error, or returns success after cleanup makes the result invalid.

#### Nil, Interfaces, and Value Semantics
- A typed nil pointer, map, slice, function, channel, or error stored in a non-nil interface and later treated as absent. Check the concrete assignment and all interface checks first.
- Nil maps written to, nil channels used unintentionally (which block forever), or nil pointers dereferenced on paths inputs or constructors can actually produce.
- Copying a value after first use when it contains `sync.Mutex`, `sync.RWMutex`, `sync.Once`, `sync.Pool`, `atomic` state, or another non-copyable synchronization primitive. Flag copies through value receivers, assignment, return, append, map values, or serialization only when the value can have been used first.
- Value receivers or copies that silently mutate only a copy when callers expect shared state, especially for structs holding maps, slices, pointers, locks, or atomic state. Do not flag intentional immutable value objects.
- `sync.Once` used for work that must retry after failure. `Once.Do` considers its `func()` complete even if it panics; an error captured by that closure also does not make a later `Do` retry it.

#### Context, Goroutines, and Cancellation
- Request-scoped work started with `context.Background()`/`TODO()` or a fresh context when it should inherit the caller's deadline, cancellation, values, or tracing. Independent background work is valid.
- `context.Context` stored in a struct or replaced with a custom context interface when it should be passed explicitly as the first parameter. Allow it only where a required external interface fixes the signature or ownership/lifetime is unambiguous.
- `context.WithCancel`, `WithTimeout`, or `WithDeadline` whose cancel function is not called once the derived context is no longer needed, unless ownership transfer and eventual cancellation are evident.
- Blocking I/O, waits, retries, selects, or loops on a request/worker path that lack cancellation or deadline where the dependency can stall. Confirm the operation can outlive its caller first.
- Goroutines that can outlive their owner because they wait forever on a channel, lock, I/O operation, or unbounded retry; lack shutdown; or have no way for errors/completion to be observed when that matters.
- Fire-and-forget goroutines that capture request-local mutable data, write to a response after the handler returns, panic without recovery at a process boundary, or race with cleanup. Do not require joining independent background work.
- Loop-variable or mutable outer-variable captures in goroutines/callbacks where a closure can observe a later value. Verify the module's `go` directive and whether a new variable is created per iteration; Go 1.22 language semantics changed range-loop variables while older-module semantics can retain the shared variable.

#### Channels, Locks, and Shared State
Only report races or deadlocks with evidence that state is reachable concurrently; inspect surrounding call sites where that is not local. Do not flag immutable data, per-goroutine locals, or synchronization guaranteed by ownership.

- Unsynchronized concurrent reads/writes of maps, slices, pointers, counters, caches, or compound state; check-then-act sequences that can interleave.
- Holding a mutex/RWMutex across blocking I/O, channel operations, callbacks, network/database calls, or long CPU work when another path needs the lock to progress. Check lock ordering before claiming deadlock.
- `RLock` used while mutating protected data; unlocked mutation of a field whose peers protect it; or atomic and non-atomic access mixed for the same state.
- Sends/receives that can block indefinitely because a peer may stop, a buffer may fill, or shutdown/cancellation is not selected. Do not flag a synchronous handoff with a proven peer.
- Multiple possible channel closers, send-on-closed-channel risk, or double-close. Establish sender/owner responsibility first.
- `select` defaults that busy-spin, drop required work, or bypass cancellation; unbounded retries without backoff/cancellation.
- WaitGroups with `Add` racing with `Wait`, missing `Done`, copies after first use, or counters that cannot reach completion.

#### Timers, Tickers, and Resource Lifecycle
- A timer/ticker retained by its owner and left running after work ends, so it can fire, tick, retain reachable state, or keep associated work alive. Do not report missing `Stop` solely as a GC leak: Go 1.23+ can recover unreferenced unstopped timers/tickers; older semantics and `GODEBUG=asynctimerchan=1` differ.
- `time.After` in a repeated/select loop only with evidence of cost: pre-Go-1.23 semantics with many unexpired timers, a high-frequency allocation path, or retained timer owners. Do not call it a leak by itself on Go 1.23+.
- Timer reset/stop code that assumes one behavior across Go versions. Channel timers on Go 1.23+ eliminate stale values after `Reset`/`Stop`; older semantics require stop-and-drain coordination. `AfterFunc` reset/stop does not wait for an already-started callback, so callbacks can overlap unless synchronized.
- `http.Response.Body`, `sql.Rows`, files, sockets, compression readers/writers, transactions, locks, or other closable resources not closed on all reachable paths after acquisition. Do not flag resources handed to a caller/framework that owns closure.
- `defer` inside a loop whose surrounding function can run many iterations or indefinitely, especially when it delays closing files, response bodies, rows, locks, or transactions until function return. Do not flag small statically bounded loops or helpers returning per iteration.
- `sql.Rows` iteration that omits `rows.Err()` after the loop, or rows not closed when iteration can stop early.
- Outbound HTTP calls missing body cleanup, request context, or timeout on a server path that can hang; transactions with a return path after `Begin` lacking rollback/commit.

#### Collections, Slices, Bytes, and Numeric Boundaries
- Returning, caching, or passing a slice/map/byte buffer whose backing storage is later reused/mutated, changing data observed by another owner. Confirm ownership; zero-copy APIs can be intentional.
- `append` to a slice that aliases caller/shared backing storage where mutation escapes; retaining a tiny subslice of a huge buffer where retained memory matters.
- Reachable indexing, slicing, length arithmetic, or capacity assumptions that exceed bounds on empty/boundary input.
- Integer conversion, narrowing, signed/unsigned comparison, size calculation, allocation, or offset arithmetic that can overflow, truncate, wrap, or turn negative input into huge size. Consider architecture-dependent `int` width.
- Reusing mutable buffers, encoders, decoders, scanners, or package/global state concurrently or after returned output depends on their lifetime.

#### Security-Sensitive Boundaries
Confirm attacker control or a trust boundary before reporting. Prefer a concrete exploit path and remediation.

- SQL, shell commands, URLs, paths, headers, templates, regexes, or serialized data assembled from untrusted input without appropriate parameterization, validation, escaping, allowlisting, or scheme/host/path restrictions. `os/exec` argument arrays are safer than a shell but arguments may still need validation.
- Path traversal, symlink-following, unsafe archive extraction, insecure temp files, or permission/ownership assumptions that expose or overwrite files.
- `html/template` replaced with `text/template` for HTML, trusted-template types constructed from untrusted content, or context-inappropriate escaping. Do not flag `text/template` for non-HTML output by default.
- SSRF or credential leakage through outbound URLs: untrusted destinations, absent required allowlists, redirects to internal services, or sensitive headers forwarded cross-host.
- Secrets, credentials, tokens, authorization headers, private keys, or sensitive personal data logged, returned in errors, or embedded in source/configuration.
- `math/rand` or `math/rand/v2` used for security-sensitive keys, tokens, session IDs, reset codes, nonces, or salts; require `crypto/rand` or a vetted cryptographic construction. Do not flag simulation, sampling, load-balancing, or tests.
- `reflect`, `unsafe`, cgo, unsafe pointer conversion, manual memory/layout assumptions, or custom cryptography without narrow documented invariants and required bounds/lifetime checks. Do not flag ordinary reflection alone.

#### Tests and Review Scope
- Review production Go changes by default. `*_test.go` files remain excluded by OCR's default path filter and are reviewed only when user configuration explicitly includes them.
- Suggest tests only for concrete changed correctness, concurrency, error, or boundary failure modes. Favor deterministic tests; do not demand flaky timing-based race tests.
- Do not make formatting, import ordering, naming preferences, simplification, or advice already enforced by `gofmt`, `go vet`, Staticcheck, linters, or the compiler into blocking findings.
`````

#### 15. freemarker.md

`````markdown
#### Obvious Typos or Spelling Errors
- Spelling errors in macro names, assigned variable names, or user-facing text at their declaration sites; do not report at reference sites
- Typos in `<#assign>`/`<#macro>`/`<#function>` names that surface only at render time (`InvalidReferenceException` / macro not found), or that are silently masked by `!` defaults and `??` guards

#### Output Escaping and XSS
- Interpolations (`${...}`) that reach HTML without escaping: flag only when auto-escaping is not already active — i.e. the template lacks `<#ftl output_format="HTML">` (FreeMarker 2.3.24+) AND does not use the `.ftlh`/`.ftlx` extension (which auto-activate HTML/XML escaping via `recognize_standard_file_extensions`, on by default since 2.3.24) — and the value is not passed through `?html`/`?url`/`?js_string` appropriate to its sink (HTML body, attribute, URL, JS, CSS)
- Explicit `?no_esc` or `<#noautoesc>` on values that carry user-controlled data — treat as a high-risk escape hatch; flag unless the source is clearly trusted or already sanitized
- Escaping with the wrong context builtin (e.g. `?html` for a value placed inside a URL or inline `<script>`)
- Do not report missing `?html` when auto-escaping is active for the file's output format and no override disables it

#### Template Injection / RCE (SSTI)
- User-controlled data concatenated into template source, or templates whose name/body derives from request input (`<#include>`, `<#import>`, `.get_optional_template(userValue)`) — enables server-side template injection
- Use of the `?new()` builtin to instantiate `TemplateModel` classes, especially `freemarker.template.utility.Execute` or `ObjectConstructor` — arbitrary code execution; flag unless the class is a vetted internal type
- `?api` / `?eval` on untrusted input, or exposing raw `Class`/`ClassLoader`/`ProcessBuilder`-reachable objects into the data model
- Templates authored from untrusted input without a restricted `TemplateClassResolver` (e.g. `SAFER_RESOLVER`) — call it out as a hardening gap

#### Null and Missing-Value Handling
- Interpolations or directive arguments on possibly-absent values without `!` (default) or `??` (existence) — missing values raise `InvalidReferenceException` at render time
- Overuse of a bare `!` that masks genuinely-required data with a silent empty string; prefer an explicit default (`value!"fallback"`) or an `<#if value??>` guard where absence is meaningful
- `!` precedence mistakes in expressions (`a.b.c!` guards only the last step); confirm the intended nullable segment

#### Logic-in-Template Smells
- Business logic, data-access, or non-trivial computation embedded in templates that belongs in the controller/model layer
- Deeply nested `<#if>`/`<#list>` or duplicated conditional blocks that indicate the view is doing the model's job
- `<#assign>` used to build state that should have been prepared before rendering

#### Macro and Include Hygiene
- `<#include>` where `<#import>` (namespaced) is intended, causing global-namespace pollution or accidental variable shadowing
- Macros/functions defined but never called, or duplicated across templates instead of shared via a common library template
- Relative template names passed to `<#include>`/`.get_optional_template` without `?absolute_template_name` when resolution context is ambiguous
- Missing-template failures not handled (`.get_optional_template(...).exists`) where the include is optional

#### Internationalization and Locale-Sensitive Formatting
- Numbers, dates, times, and currency emitted with locale-default formatting where a fixed machine format is required (e.g. `?string`/`?c` for numbers in URLs, JSON, or IDs) — `?c` (computer format) prevents locale-dependent thousands separators corrupting non-display output
- Hard-coded user-facing strings that should come from a localized message/resource bundle
- Date/number output relying on an implicit locale/timezone without confirming the render environment sets them intentionally
`````

#### 16. handlebars_mustache.md

`````markdown
> Favor precision over recall: only raise an issue when the defect is observable in the template and the relevant data or trust boundary is clear. Handlebars and Mustache are implemented by many runtimes, so do not assume optional features or host configuration without evidence.

#### Handlebars/Mustache Escaping Boundaries
- Raw interpolations (`{{{value}}}` or `{{& value}}`) that can receive untrusted content without prior context-appropriate sanitization
- Double-braced values placed in JavaScript, CSS, URL, or event-handler contexts as though HTML escaping protected those grammars
- Interpolated values in unquoted HTML attributes, where escaping alone does not establish a safe attribute boundary
- Values inserted into URL-bearing attributes without validating the allowed scheme and destination
- Do not report ordinary `{{value}}` output in an HTML text node solely for lacking an explicit escape helper; both Handlebars and Mustache escape that form by default

#### Template and Partial Selection
- Dynamic Handlebars partials such as `{{> (lookup . "partialName")}}`, or Mustache dynamic names such as `{{>*partialName}}`, selected from untrusted data without an explicit allowlist
- Partial or parent names assembled from request-controlled values when they can expose unintended registered templates
- Recursive partial chains with no data-dependent termination condition
- Mustache lambdas or Handlebars helpers used to reinterpret data as template source when the input can be attacker-controlled

#### Missing Values and Helper Resolution
- Required values that can silently render as an empty string, especially inside identifiers, URLs, form names, generated configuration, or security-sensitive attributes
- Misspelled paths, helpers, or partial names when the surrounding template establishes the intended name and the mismatch would render empty output or fail at runtime
- Handlebars helper/data collisions where `{{name}}` invokes a helper but the template intends the current context property; use `{{./name}}` or `{{this.name}}` when disambiguation is required
- Unquoted helper arguments intended as literal strings, causing Handlebars to resolve them as paths instead
- Do not require a default for every optional display value; report concrete output or control-flow failures

#### Sections, Blocks, and Context
- Mismatched opening and closing section names, or conditionals that emit only one half of a required tag, delimiter, quote, or structured-output field
- References inside `each`, `with`, or Mustache sections that use the wrong context depth and therefore read from the current item instead of the parent or root
- Nested loops that use `@index`, `@key`, or `../` from the wrong level; prefer block parameters when they make the intended binding explicit
- Handlebars `if` checks where a valid numeric zero must be rendered but is treated as empty without `includeZero=true`
- Section and inverted-section pairs that can both be skipped or can duplicate fallback output because they test different paths

#### Partials and Inheritance
- Partials invoked with the current context when they require an explicit context or hash argument, leading to missing or shadowed values
- Sensitive caller data inherited by a partial that should receive a narrow explicit context
- Partial-block or Mustache inheritance overrides that omit required wrapper markup, accessibility attributes, or security metadata supplied by the parent
- Optional Mustache features such as lambdas, dynamic names, delimiter changes, or inheritance used when the project's target implementation does not support them

#### Structured Output and Whitespace
- HTML escaping used as a substitute for JSON, YAML, JavaScript, CSS, shell, or SQL serialization; require a format-specific serializer or helper when values can contain syntax characters
- Handlebars whitespace control (`~`) or Mustache standalone-line behavior that joins tokens, removes required separators, or changes indentation-sensitive output
- Partials inserted into indentation-sensitive output at a depth that produces invalid YAML, source code, or configuration

#### Performance and Side Effects
- Expensive helpers, lambdas, lookups, or partial selection repeated inside large sections when the result can be prepared once by the host application
- Helpers or lambdas with observable side effects invoked from branches that may render multiple times
`````

#### 17. jinja.md

`````markdown
> Favor precision over recall: only raise an issue when you are confident it is a real defect, and stay silent when the host application's Jinja environment or data trust boundary is not visible.

#### Jinja Escaping Boundaries
- Untrusted values passed through `|safe`, wrapped in `Markup`, or rendered inside `{% autoescape false %}` without prior context-appropriate sanitization
- HTML-escaped values inserted into JavaScript, CSS, URL, or event-handler contexts as though HTML escaping protected those grammars
- `|tojson` output placed in a double-quoted HTML attribute; Jinja documents that this requires single-quoted attributes or additional escaping
- Interpolated values in unquoted HTML attributes, where escaping alone does not establish an attribute boundary
- Do not report every `{{ value }}` as unescaped: autoescaping is configured by the host environment and may be selected from the template filename

#### Template and Expression Injection
- User-controlled template source, expression fragments, filter names, or macro bodies evaluated as Jinja rather than passed as data
- Dynamic `{% include %}`, `{% import %}`, or `{% extends %}` targets derived from request data without an explicit allowlist
- Use of attribute traversal or the `attr` filter to reach sensitive host objects exposed to an untrusted template
- Treat `SandboxedEnvironment` as defense in depth, not permission to expose secrets or powerful application objects to attacker-authored templates

#### Undefined Values and Defaults
- Required values silently rendered as empty strings under the default `Undefined` behavior, especially in identifiers, URLs, authorization decisions, or generated configuration
- `|default(..., true)` used where valid falsey values such as `0`, `False`, or an empty collection must remain distinct from missing data
- Deep attribute chains whose intermediate value may be undefined, unless the environment clearly uses `ChainableUndefined` or a guard establishes the value
- Do not require `StrictUndefined` in every application; report the concrete silent-failure path instead

#### Includes, Imports, and Macros
- Macros depending on ambient variables even though imported templates do not receive the caller's context by default
- `{% include %}` unintentionally inheriting sensitive caller context when `without context` is required
- Macro calls where missing arguments become `Undefined`, positional arguments are misordered, or unintended extra arguments are captured through `varargs` or `kwargs`
- Child templates overriding a block but omitting `{{ super() }}` when the parent block contains required structure or security metadata

#### Output Correctness
- Whitespace-control markers (`{%-`, `-%}`, `{{-`, `-}}`) that concatenate tokens, lines, HTML attributes, YAML scalars, or generated source unexpectedly
- Conditions that emit only one half of a required delimiter, tag, quote, or structured-output field
- Loop metadata such as `loop.index` and `loop.index0` mixed in the same external identifier or pagination calculation
- Reusing a loop variable after the loop as though assignments inside loops escaped Jinja's loop scope

#### Performance and Side Effects
- Host functions, database-backed properties, or network lookups invoked repeatedly inside a loop when the result can be prepared once by the application
- Repeated sorting, grouping, filtering, or serialization of the same collection within one render
- Includes or imports selected per item in a large loop when a fixed macro or precomputed view model would avoid repeated loader work
`````

#### 18. pug.md

`````markdown
> Favor precision over recall: only raise an issue when the rendered consequence or trust boundary is clear. Pug evaluates JavaScript and compiles to HTML, so distinguish Pug's built-in HTML escaping from the additional validation or serialization required by the actual output context.

#### Pug Escaping and Output Contexts
- Unescaped string interpolation (`!{value}`) or unescaped buffered code (`!= value`) that can receive untrusted HTML without prior, context-appropriate sanitization
- Escaped interpolation (`#{value}`) or buffered code (`= value`) used inside JavaScript, CSS, JSON, URL, or event-handler syntax as though HTML escaping protected those grammars
- Do not report ordinary `#{value}` or `= value` in an HTML text node solely for lacking an explicit escape helper; Pug HTML-escapes those forms by default
- Sanitized HTML rendered through `!{}` or `!=` after transformations that invalidate the sanitizer's guarantee, such as concatenating new untrusted markup afterward

#### Attributes, URLs, and Dynamic Markup
- Attribute values from untrusted data that are HTML-escaped but not validated for the sink, especially `href`, `src`, `action`, `formaction`, `srcdoc`, `style`, and event-handler attributes
- Direct `&attributes(object)` spreads of untrusted objects: Pug does not automatically escape values in a general attribute spread, and attacker-controlled keys can introduce event handlers or override security-sensitive attributes
- Do not flag conventional mixin forwarding solely because it uses `&attributes(attributes)` or `!= attributes.name`; values in the implicit mixin `attributes` object are already escaped by Pug. Inspect the original caller, attribute names, and non-HTML sink semantics instead
- Boolean attributes whose values use strings such as `"false"` when presence still enables the HTML behavior, or conditional attributes that leave a control enabled, selected, or focusable on the wrong branch
- IDs, `name` values, fragment links, or ARIA references generated in loops without a stable uniqueness guarantee

#### Embedded JavaScript and Server-to-Client Data
- Values interpolated into `script.` blocks or inline handlers without JavaScript-string or JSON-safe serialization; HTML escaping is not a substitute for JavaScript encoding
- `!{JSON.stringify(data)}` embedded in an inline script without neutralizing HTML parser terminators such as `</script>` (and relevant line-separator characters for the supported JavaScript target), allowing data to end the script element or break parsing
- Secrets, session data, authorization material, internal-only fields, or unnecessarily large objects serialized into client-visible markup or scripts
- Client-compiled templates (`compileClient` / `compileFileClient`) that can render attacker-controlled raw output before the caller inserts the result with `innerHTML` or an equivalent HTML sink
- Server-only assumptions embedded in client-compiled Pug, including access to unavailable globals, modules, filesystem state, or locals the browser never receives

#### Template Trust, JavaScript, Missing Data, and Side Effects
- Attacker-controlled template source passed to `compile` / `render`, or attacker-writable files passed to `compileFile` / `renderFile`; Pug templates can execute embedded JavaScript, so treating untrusted templates as presentation data creates a server-side template injection and code-execution boundary
- Request-controlled template file selection without a strict name allowlist and template-root boundary, allowing unintended templates or paths to be rendered even though `include` and `extends` directives inside a trusted template are static
- Request, query, or body objects spread wholesale into Pug render/compiler options, allowing untrusted keys to alter options such as `filename`, `basedir`, `filters`, `globals`, `cache`, or `pretty` as well as locals; keep compiler options fixed, expose an explicit locals shape, and verify the project's Pug version before claiming exploitability
- Unbuffered code (`-` or an unbuffered code block) that performs database, network, filesystem, shared-state mutation, or other externally observable side effects during rendering
- Required locals that can become empty output, omitted attributes, invalid identifiers, or broken URLs without an explicit default or branch; do not require defaults for optional display-only values
- Exceptions from property access or function calls on absent locals that can abort the whole render, especially inside shared layouts or error pages
- Business logic, authorization decisions, or non-trivial data shaping implemented in the template instead of the controller/view-model layer

#### Includes, Inheritance, Mixins, and Filters
- Relative `include` or `extends` paths used without the `filename` context needed for correct resolution, or absolute paths that unintentionally depend on a different `basedir`
- Non-Pug includes that insert raw HTML, JavaScript, CSS, or secrets when the author appears to expect Pug parsing or escaping
- Child templates that replace, append, or prepend the wrong named block and thereby drop required metadata, scripts, security controls, fallback content, or accessibility structure
- Content or unbuffered code placed at the top level of an extending template even though child templates may only define named blocks and mixins there
- Mixins invoked with arguments in the wrong order, implicit caller context, or an overly broad attribute object, producing missing data or leaking fields across component boundaries
- Filters treated as runtime sanitizers or as processors for dynamic locals even though Pug filters run at compile time and cannot support dynamic content or options

#### Indentation, Control Flow, and Whitespace
- Indentation changes that move an element into the wrong parent, loop, conditional, or block, changing form ownership, DOM structure, visibility, or execution scope
- `while` loops with a reachable non-terminating path, or expensive expressions and function calls repeated inside large `each` loops
- `each ... else` or conditional branches that omit required empty/error states, duplicate IDs, or render controls without the data needed by their handlers
- Inline tags and text whose Pug whitespace rules concatenate words or tokens, or reliance on trailing spaces that formatters and editors can remove
- Literal HTML or plain-text blocks whose indentation looks like Pug nesting but is emitted mostly unprocessed, producing a different structure than intended

#### Accessibility
- Interactive non-button elements without equivalent keyboard activation, focusability, and semantics when a native element would provide them
- Inputs generated without an associated label, repeated form-control IDs, or labels/ARIA references that point to a different loop item
- Images with missing or misleading alternatives, and conditional content that changes visible state without updating accessible name, role, or `aria-*` state
- Inheritance or mixin overrides that silently remove landmarks, heading structure, fallback text, focus management, or required attributes supplied by the parent

#### Performance and Review Scope
- Templates compiled on every request or repeatedly inside a hot loop when they are static and the host can precompile or cache them with a stable `filename` key
- Expensive helpers, mixins, serialization, or data reshaping repeated per item when the result can be prepared once by the host application
- Report performance findings only when request frequency, collection size, or repeated compilation is evident; do not turn indentation preferences or equivalent shorthand forms into blocking findings
`````

#### 19. arkts.md

`````markdown
#### Obvious Typos or Spelling Errors
- Spelling errors in component names, variable names, or function names
- Spelling errors in log or error messages that affect readability

#### Dead Code
- Code blocks that will never be executed (e.g., branches where the condition is always false, code after a return statement)
- Variables that are declared but never read or referenced
- Large blocks of commented-out code (with no apparent intent to retain)

#### State Decorator Usage
- Arrays/objects decorated with `@State` will not trigger UI refresh when modified via push/property changes; references must be replaced
- Verify correct usage of `@Prop` (one-way) vs `@Link` (two-way) for the given scenario
- Nested object state updates must use `@Observed` + `@ObjectLink`
- Props drilling beyond 3 levels should use `@Provide/@Consume` instead
- `@StorageLink/@StorageProp` should only be used for truly global state; avoid overuse

#### Component Lifecycle
- Timers and listeners created in `aboutToAppear` must be released in `aboutToDisappear`
- Page-level logic should be placed in `onPageShow/onPageHide` rather than component lifecycle hooks
- Avoid executing time-consuming synchronous operations in lifecycle hooks that block the UI thread

#### ArkUI Declarative Syntax
- Side effects (network requests, timers, logging) are prohibited in the `build` method
- `ForEach` / `LazyForEach` must provide a unique and stable key generator function
- Use `if/else` for conditional rendering, not `switch`
- Direct manipulation of component instances outside the `build` method is prohibited

#### Performance Optimization
- Large lists (>20 items) must use `LazyForEach` instead of `ForEach`
- Creating new objects, closures, or calling functions that return styles in the `build` method is prohibited, as it causes unnecessary child component rebuilds
- Complex computation results should be cached via `@Watch` to avoid redundant calculations on each render
- Image resources should have proper caching strategies to avoid repeated loading

#### Resource Access Standards
- String hardcoding is prohibited; use `$r('app.string.key')` to support internationalization
- Images must use `$r('app.media.icon')` or `$rawfile('path')`; hardcoded paths are prohibited
- Colors/dimensions should use resource references like `$r('app.color.primary')` to support theme switching

#### Component Communication
- Parent→Child: use `@Prop`/`@Link`; Child→Parent: use callback function `onEvent` pattern
- Cross-component communication: use `@Provide/@Consume`; global state: use `AppStorage`
- Avoid passing local component state through `AppStorage`

#### General TypeScript Standards
- Using `any` type is prohibited; if unavoidable, a comment explaining the reason is required
- Using `var` is prohibited; use `let` or `const`
- Using `==` and `!=` is prohibited; use `===` and `!==`
- Async functions must include try-catch error handling with user-friendly error messages
- Prefer async/await; callback hell is prohibited; use `Promise.all` for independent async operations
- Null checks: perform null checks when accessing values or destructuring to avoid null pointer exceptions

#### Code Security Checks
- User input must be validated (length, format, range); direct concatenation into SQL or command strings is prohibited
- Sensitive information (keys, passwords, tokens) must not be logged or uploaded
- Network requests must use HTTPS with certificate verification
`````

#### 20. astro.md

`````markdown
#### Obvious Typos or Spelling Errors
- Spelling errors in component names, props, slots, or user-facing strings that affect readability

#### Dead Code
- Unused islands, framework components, scripts, or template branches that add client cost without affecting rendered behavior

#### Astro Component Boundaries
- When frontmatter data reaches client HTML, inline scripts, or hydrated islands, verify whether it was computed at build time or request time and whether exposing non-`PUBLIC_` env values, cookies, headers, sessions, `Astro.locals`, secrets, request-only data, or server-only APIs is intentional
- Flag `.astro` templates that appear to assume frontmatter values are reactive in the browser
- Flag framework components used only to render static markup when plain Astro markup would avoid unnecessary client JavaScript

#### Hydration and Islands
- `client:*` applies only to directly imported UI framework components, not `.astro` components or dynamic tags
- Flag `client:load` on non-critical UI, missed `client:idle` or `client:visible` opportunities, `client:media` where the media query does not actually gate the interaction need, and over-hydration from large or overly numerous islands
- Flag `client:only` without the framework string or without fallback content when the result is blank or confusing pre-hydration UI

#### Server-to-Client Data Transfer
- Flag hydrated framework component props or server-fetched data passed client-side without reducing to the minimal interaction payload; props crossing hydrated boundaries must use Astro-supported serializable types, so flag functions, class instances, circular objects, secrets, and unnecessarily large payloads.
- `<script define:vars>` values are JSON-stringified and inline; flag secrets, large payloads, or repeated per-instance duplication

#### Server Islands
- Flag `server:defer` usage without required adapter support or without a fallback slot when deferred content needs a meaningful loading state
- Props passed into `server:defer` islands must use Astro-supported serializable types; flag functions, circular objects, secrets, and large request objects
- Flag `server:defer` uses that leak request-specific data into cacheable output or weaken privacy assumptions

#### Template Safety
- Treat `set:html` as a high-risk escape hatch; flag it unless the source is clearly trusted or sanitized
- Flag unsafe or insufficiently validated dynamic values inserted into attributes, URLs, or raw markup
- Flag fragile template structures, especially mixed `set:*` usage or conditional markup that changes HTML shape in surprising ways

#### Scripts
- Flag scripts with attributes other than `src` when unprocessed behavior causes avoidable per-instance duplication, bypasses bundling, or relies on server-only values
- Flag framework hydration used for behavior that a small processed Astro script would handle

#### Styles
- Flag unnecessary `is:global` usage when scoped styles or a narrow `:global(...)` escape would do
- Flag selectors that assume scoped CSS can style child component internals across a component boundary
- Flag components that accept parent styling but fail to forward `class` and needed rest props

#### Content and Assets
- For structured Markdown/MDX/JSON content, flag ad hoc loading when Astro content collections would materially improve schema validation, typing, or route generation
- Flag plain `<img>` or `public/` asset usage when the implementation appears to expect Astro image optimization, responsive behavior, fingerprinting, transforms, or import-time validation

#### Markup and Accessibility
- Flag non-semantic or fragile interactive markup, including inaccessible islands before hydration, invalid conditional HTML, or mixed Astro/framework composition that breaks keyboard or focus behavior
`````

#### 21. ts_js_tsx_jsx.md

`````markdown
#### Obvious Typos or Spelling Errors
- Spelling errors in variable names, function names, component names, or Props property names
- Strings in log or error messages containing spelling errors that affect readability

#### Dead Code
- Code blocks that will never be executed (e.g., branches where the condition is always false, code after a return statement)
- Variables that are declared but never read or referenced
- Large blocks of commented-out code (with no apparent intent to retain)

#### Code Quality Checks
- **Duplicate Code**: Check for common logic that can be extracted
- **Code Comments**: Complex business logic should have clear explanatory comments (avoid commenting obvious code)
- **Hardcoding**: Business-related hardcoded strings are prohibited, especially URL paths and business numbers; simple UI text may be relaxed
- **Variable Declarations**: Using `var` is strictly prohibited; use `let` or `const`
- **Equality Comparisons**: Using `==` and `!=` is prohibited; use strict equality `===` and `!==`
- **TypeScript Types**: Avoid using `any` type; if necessary, provide a comment explaining the reason
- **Null Checks**: Perform null checks when accessing values or destructuring to avoid null pointer exceptions
- **Ternary Expressions**: Nested ternary expressions are not allowed

#### React Best Practices
- **Hooks Usage**: Verify compliance with Hooks rules (only call at the top level, only call in React functions)
- **State Management**: Ensure state is placed at the appropriate level; avoid unnecessary state lifting
- **Side Effect Handling**: Verify useEffect correctly handles dependencies and cleanup functions
- **Performance Optimization**: Verify proper use of React.memo, useMemo, useCallback (based on performance analysis; avoid over-optimization)
- **Render Side Effects**: Side effects in React component render methods are strictly prohibited (e.g., API calls, DOM manipulation)
- **Inline Styles**: Avoid using inline `style` attributes, except for dynamic styles
- **Inner Components**: Declaring new components inside a component is prohibited; use render methods instead (e.g., `renderItem`, not `<Item/>`)

#### Async Handling Standards
- **Error Handling**: Async functions must include proper error handling with user-friendly error messages
- **Prefer async/await**: Prefer async/await over Promises; callback hell is prohibited
- **Async in Loops**: Distinguish between independent async operations (use `Promise.all` for parallelism) and dependent async operations (use sequential execution); prefer `Promise.all` for performance

#### Code Security Checks
- **XSS Protection**: Verify that user input is properly escaped
- **innerHTML Safety**: Using innerHTML to directly insert user input is prohibited; use textContent or apply XSS protection
- **Code Injection Protection**: Using eval(), Function() constructor, and string argument forms of setTimeout/setInterval is strictly prohibited
- **Dangerous Methods**: Using document.write() is prohibited as it causes page reflow and security issues
- **Sensitive Information**: Check whether API keys or sensitive data are exposed
- **Prototype Chain Safety**: Modifying native object prototypes (e.g., Array.prototype, Object.prototype) is prohibited
`````

#### 22. kotlin.md

`````markdown
### 1. Null Safety
- **Issue**: Nullable types not handled correctly, leading to potential `NullPointerException`.
- **Key checks**:
  - Avoid overusing `!!` (non-null assertion); prefer safe calls `?.` or the Elvis operator `?:`.
  - Ensure nullable properties from data classes or API responses are handled properly.
- **Bad example**:
  ```kotlin
  val length: Int = text!!.length // Risk: text may be null
  ```
- **Improvement**:
  ```kotlin
  val length: Int = text?.length ?: 0 // Safe handling
  ```

#### Dead Code
- Code blocks that can never be reached (e.g., branches where the condition is always false, code after a return statement)
- Variables that are declared but never read or referenced
- Large blocks of commented-out code (with no apparent intent to preserve)

### 2. Function and Expression Conciseness
- **Issue**: Redundant code undermines Kotlin's conciseness.
- **Key checks**:
  - Use `=` to simplify single-expression functions (e.g., `fun sum(a: Int, b: Int) = a + b`).
  - Replace complex `if-else` chains with `when`.
  - Avoid unnecessary `return` (e.g., use expression results directly in lambdas).
- **Bad example**:
  ```kotlin
  fun getGrade(score: Int): String {
      if (score >= 90) return "A"
      else if (score >= 80) return "B"
      else return "C"
  }
  ```
- **Improvement**:
  ```kotlin
  fun getGrade(score: Int) = when {
      score >= 90 -> "A"
      score >= 80 -> "B"
      else -> "C"
  }
  ```

### 3. Collection Operation Optimization
- **Issue**: Inefficient collection operations causing performance problems.
- **Key checks**:
  - Prefer `Sequence` for large collections (lazy evaluation reduces intermediate objects).
  - Avoid redundant operations (e.g., merge multiple `filter` calls into one).
  - Use `groupBy`, `associate`, etc. instead of manual iteration.
- **Bad example**:
  ```kotlin
  val evenSquares = listOf(1, 2, 3).map { it * it }.filter { it % 2 == 0 } // creates intermediate collections
  ```
- **Improvement**:
  ```kotlin
  val evenSquares = listOf(1, 2, 3).asSequence()
      .map { it * it }
      .filter { it % 2 == 0 }
      .toList() // lazy evaluation
  ```

---

### 4. Proper Use of Coroutines
- **Issue**: Coroutine leaks or improper exception handling.
- **Key checks**:
  - Use structured concurrency (`coroutineScope` or `supervisorScope` to manage lifecycle).
  - Avoid `GlobalScope` (prone to resource leaks).
  - Exception handling: wrap `withContext` or `async` in `try/catch`.
- **Bad example**:
  ```kotlin
  GlobalScope.launch { // escapes scope, may leak
      fetchData()
  }
  ```
- **Improvement**:
  ```kotlin
  viewModelScope.launch { // structured concurrency
      try {
          withContext(Dispatchers.IO) { fetchData() }
      } catch (e: Exception) { /* handle exception */ }
  }
  ```

### 5. Class and Object Design
- **Issue**: Not leveraging Kotlin features leads to redundancy.
- **Key checks**:
  - **Data classes**: Use `data class` for pure data objects (auto-generates `equals`/`hashCode`).
  - **Sealed classes/interfaces**: Use `sealed class` for restricted type hierarchies (enables exhaustive `when` branch checking).
  - **Delegation**: Property delegation (e.g., `by lazy`) or class delegation (`by` for the decorator pattern).
- **Bad example**:
  ```kotlin
  class User(val name: String) {
      // manually implementing toString()/equals()...
  }
  ```
- **Improvement**:
  ```kotlin
  data class User(val name: String) // standard methods auto-generated
  ```

### 6. Resource Management and Scope Functions
- **Issue**: Resources not released or scope functions misused.
- **Key checks**:
  - Use `use` to auto-close file/network resources (e.g., `FileInputStream().use { ... }`).
  - Scope functions (`let`, `apply`, etc.) should maintain readability; avoid excessive nesting.
- **Bad example**:
  ```kotlin
  val file = File("path")
  val reader = BufferedReader(FileReader(file))
  // forgot to call reader.close()
  ```
- **Improvement**:
  ```kotlin
  File("path").inputStream().use { stream ->
      // resource auto-closed
  }
  ```

### 7. Performance Pitfalls
- **Issue**: Hidden performance overhead.
- **Key checks**:
  - Inline functions: Use `inline` for higher-order functions to reduce lambda overhead (but avoid inlining large functions).
  - Constants: Use `const val` for compile-time constants (instead of `val`).
  - Avoid creating objects inside loops (e.g., `Regex` instances).

### 8. Interoperability (Java Interaction)
- **Issue**: Compatibility problems when Java code calls Kotlin code.
- **Key checks**:
  - Use `@JvmStatic` and `@JvmOverloads` to optimize APIs exposed to Java callers.
  - Null safety annotations: Use `@Nullable`/`@NonNull` to help Java recognize nullability.

### 9. Other Key Points
- **Immutability**: Prefer `val` over `var`.
- **String handling**: Use string templates (`"Value: $value"`) instead of concatenation.
`````

#### 23. fsharp.md

`````markdown
> Favor precision over recall: report only defects that are likely to cause incorrect behavior, security vulnerabilities, resource leaks, or material performance problems. Do not report formatting that Fantomas can fix, or replace a project's established F# style with a personal preference. This rule covers F# implementation (`.fs`), signature (`.fsi`), and script (`.fsx`) files; account for the target framework and the surrounding .NET APIs before raising compatibility findings.

#### Discriminated Unions and Pattern Matching
- `match` expressions that omit a reachable discriminated-union or `option` case, especially after a union gains a new case; do not report a match that the compiler can prove exhaustive
- Catch-all `_` branches used only to suppress an incomplete-pattern warning when an omitted case needs distinct behavior or error handling
- Active patterns or guards whose ordering shadows a later reachable case, silently selecting the wrong branch
- `Option.get`, `ValueOption.get`, accessing `.Value` on an option/value option, or project-specific partial `Result` unwraps where `None`, `ValueNone`, or `Error` can occur for runtime, external, or untrusted input
- Treating a domain failure as an exception while callers are otherwise required to handle it through `Result`; do not flag an intentionally documented exception boundary

#### Resource Lifetime and Mutable State
- `IDisposable`, streams, database connections, locks, or cancellation registrations acquired without `use`, `use!`, `try/finally`, or an equivalent cleanup path that covers exceptions and early returns
- A resource returned from a `use` scope, captured by a closure that outlives the scope, or disposed before an asynchronous workflow that still consumes it completes
- Mutable state shared between agents, tasks, event callbacks, or parallel collection operations without synchronization or a clear single-owner protocol
- Reusing a mutable buffer, array, or record across asynchronous operations where a later mutation can race with a consumer; ordinary local mutation with no escaping reference is not a finding

#### Async, Tasks, and Cancellation
- `Task` or `Async` workflows that drop a reachable exception, cancellation, or result instead of propagating or intentionally handling it at the boundary
- Calling `.Result`, `.Wait()`, or `Async.RunSynchronously` on a context that can require asynchronous progress, producing a deadlock or thread-pool starvation risk
- Accepting a `CancellationToken` but failing to pass it into a cancellable I/O, delay, HTTP, database, or child task operation when the API supports it
- Starting background work without retaining, awaiting, supervising, or observing the task's exception; do not flag a deliberately detached process when its lifetime and error reporting are explicit

#### Sequences, Collections, and Performance
- Enumerating a `seq` with side effects or an expensive source multiple times when the result is expected to be stable or when repeated execution changes behavior; materialize once only when the code needs repeated traversal
- Calling `Seq.head`, `Seq.reduce`, indexed access, or a map lookup without establishing that the collection/key is present for non-constant input
- Accidentally forcing a lazy sequence in a hot path, or composing a sequence pipeline whose deferred exceptions escape a boundary that promises eager validation
- Quadratic list append, repeated immutable-map updates, or repeated string concatenation in a loop where input size can make the behavior materially expensive; do not replace concise collection code merely for micro-optimizations

#### .NET Interop and Type Boundaries
- Passing F# `option` values through a .NET API as though they were `null`, or treating a nullable/reference return from .NET as non-null without a local invariant
- P/Invoke, reflection, serialization, or JSON bindings whose declared types, field names, nullability, ownership, or enum values do not match the external contract
- Runtime downcasts or unchecked/default-producing operations (`:?>`, `unbox`, `Unchecked.defaultof`, or reflection-based invocation) without a locally established runtime type/nullability invariant
- Untrusted values flowing into SQL, shell commands, file paths, URLs, deserialization, or HTML without validation or parameterization, and secrets written to source, logs, or error messages

#### Signatures and Module Boundaries
- An `.fsi` signature whose exposed types, arity, generic constraints, mutability, or visibility do not match the implementation or intended public API
- Public functions that leak mutable implementation state or an internal representation where callers can violate the module's invariants
- Module initialization with observable I/O, non-deterministic global state, or exceptions that make importing the module fail unexpectedly; do not report explicit, documented application bootstrap code
`````

#### 24. rust.md

`````markdown
#### Obvious Typos or Spelling Errors
- Spelling errors in type names, function names, variable names, enum variants, trait names, or module names at their declaration sites; do not report spelling errors at call sites
- Strings in log messages, panic messages, error messages, or public diagnostics containing spelling errors that affect readability

#### Ownership and Lifetime Correctness
- Incorrectly returned references, borrowed values escaping their valid scope, or lifetime relationships that make an API unsound or unusable
- Excessive or unnecessary `clone()` calls introduced to satisfy borrowing when a borrow, iterator, `Cow`, or ownership transfer would be clearer and cheaper
- Interior mutability (`RefCell`, `Cell`, `Mutex`) used to work around ownership without a real shared-mutability requirement
- Reference cycles with `Rc<RefCell<T>>` or `Arc<Mutex<T>>` where `Weak` should be used to break ownership cycles

#### Error Handling and Panics
- `unwrap()`, `expect()`, `panic!`, `todo!`, or `unimplemented!` in production/library paths where the failure is recoverable or can be propagated with `Result`
- Errors converted to strings too early or discarded without context; prefer preserving the original error and adding actionable context at boundaries
- `Result` or `Option` values ignored, swallowed, or mapped to misleading defaults
- Public APIs that panic on ordinary invalid input instead of returning a typed error, unless the panic documents a clear programming invariant

#### Unsafe Code Boundaries
- `unsafe` blocks that are broader than necessary or hide multiple unrelated invariants
- Missing or stale safety rationale for `unsafe` blocks, `unsafe fn`, `unsafe impl Send`, or `unsafe impl Sync`
- Raw pointer dereferences without clear validity, alignment, initialization, aliasing, and lifetime guarantees
- FFI boundaries that do not validate null pointers, buffer lengths, ownership transfer, string encoding, or allocator compatibility
- `static mut`, unchecked `transmute`, `MaybeUninit`, `mem::zeroed`, or manual drop logic used without a documented invariant that makes the operation sound

#### Concurrency and Shared State
- Holding `Mutex`, `RwLock`, or `RefCell` guards longer than necessary, especially across calls into user code or potentially blocking operations
- Holding synchronous locks across `.await`, or using blocking I/O, sleeps, or CPU-heavy work directly inside async tasks
- Check-then-act races around shared state, cache initialization, file creation, or atomics
- Atomic operations with ordering that is too weak for the data being protected, or overly strong orderings that hide the intended synchronization contract
- Unsafe `Send` or `Sync` implementations that do not prove all contained state is thread-safe under the documented invariants

#### Async and Cancellation Safety
- Spawned tasks whose `JoinHandle` is dropped when failures, cancellation, or shutdown still need to be observed
- Futures that are not cancellation-safe around partial writes, lock acquisition, transactions, or resource cleanup
- Async functions that use synchronous filesystem, network, or process APIs in request/worker paths where the runtime can be blocked
- Retry loops without backoff, timeout, cancellation propagation, or bounded attempts

#### Collections, Iterators, and Performance
- Avoid unnecessary allocations in hot paths, such as repeated `String` construction, `format!`, `collect()`, or `to_vec()` where borrowing or streaming is sufficient
- Prefer iterator adapters and standard library collection APIs when they make ownership and complexity clearer; avoid dense iterator chains that obscure error handling or side effects
- Ensure hash maps, vectors, and strings are preallocated when the expected size is known and growth cost is material
- Avoid O(n^2) lookups from nested loops when a `HashMap`, `HashSet`, sorting, or indexing strategy would clearly reduce complexity

#### Type and API Design
- Model domain states with enums, newtypes, and typed IDs instead of booleans, strings, or primitive integers when invalid states would otherwise be representable
- Prefer standard conversion and borrowing traits (`From`, `TryFrom`, `AsRef`, `Borrow`, `IntoIterator`) when designing reusable APIs
- Public structs, enums, traits, and errors should have useful names, visibility, trait derives, and documentation appropriate to the crate boundary
- Avoid exposing concrete collection or synchronization types in public APIs when a slice, iterator, trait, or narrower abstraction would preserve flexibility

#### Macros and Metaprogramming
Only flag when the diff actually defines a `macro_rules!` or procedural macro; do not report on ordinary macro invocations.
- An `$x:expr` fragment interpolated more than once in the expansion, so the caller's expression — and any side effects — runs multiple times; bind it to a `let` once inside the expansion
- Exported or publicly used macros that reference items without `$crate::`, so name resolution breaks or binds the wrong item when the macro is invoked from another crate
- Token-tree (`$t:tt`) fragments re-emitted without parentheses, where operator precedence can silently change the intended meaning; this applies only to token-level (`tt`) interpolation, since an `:expr` fragment and a whole expansion are each parsed as one complete expression
- Procedural macros that `unwrap()`, `expect()`, or `panic!` on malformed input instead of emitting a `syn::Error` / `compile_error!` with a useful span
- Macro-hygiene assumptions that break: generated identifiers relying on names from the call-site scope, or items that collide when the macro is invoked more than once in the same module

#### Security-Sensitive Code
- Validate path, URL, command, SQL, and serialized input before use; do not build shell commands or SQL with unchecked string concatenation
- Do not log secrets, tokens, credentials, private keys, or personally identifiable information
- Check integer conversions, byte slicing, and length arithmetic for overflow, truncation, and UTF-8 boundary errors
- Cryptographic, random, authentication, and authorization code must use well-reviewed crates and explicit error handling; flag ad hoc implementations
`````

#### 25. cpp.md

`````markdown
#### Obvious Typos or Spelling Errors
- Spelling errors in variable names, constant names, or function names at their declaration sites; do not report spelling errors at call sites
- Strings in log messages or exception messages containing spelling errors that affect readability

#### Dead Code
- Code blocks that can never be reached (e.g., branches where the condition is always false, code after a return statement)
- Variables that are declared but never read or referenced
- Large blocks of commented-out code (with no apparent intent to preserve)

#### Smart Pointer Usage
**Key checks:**
- Prefer `std::unique_ptr` for managing exclusively owned resources
- Use `std::shared_ptr` for managing shared resources
- Avoid using raw pointers to manage dynamic memory
- Use `std::weak_ptr` correctly to break circular references

**Example:**
```cpp
// Bad: using raw pointers
Widget* widget = new Widget();
delete widget; // easy to forget or skipped during exceptions

// Good: using smart pointers
auto widget = std::make_unique<Widget>();
// automatically destroyed, exception-safe
```

#### RAII Principle
**Key checks:**
- Resources are acquired in constructors
- Resources are released in destructors
- Use stack objects to manage resources
- Avoid manual resource management

#### STL Containers and Algorithms
**Key checks:**
- Prefer STL containers over raw arrays
- Use STL algorithms instead of hand-written loops
- Choose the appropriate container type
- Understand the performance characteristics of containers

**Example:**
```cpp
// Bad: hand-written loop
std::vector<int> vec = {1, 2, 3, 4, 5};
for (int i = 0; i < vec.size(); ++i) {
    vec[i] *= 2;
}

// Good: using algorithms
std::transform(vec.begin(), vec.end(), vec.begin(),
               [](int x) { return x * 2; });
```

#### The auto Keyword
**Key checks:**
- Use auto when the type is complex
- Avoid overusing auto for simple types
- Use auto& and const auto& to avoid unnecessary copies

#### Exception Handling Completeness
**Key checks:**
- Catch specific exception types rather than using ...
- Do not silently ignore errors in exception handlers

#### const Correctness
**Key checks:**
- Apply const to member functions where appropriate
- Pass parameters by const reference
- Correct placement of const for pointers and references
- Use const member variables judiciously
`````

#### 26. c.md

`````markdown
#### Obvious Typos or Spelling Errors
- Spelling errors in variable names, constant names, or function names at their declaration sites; do not report spelling errors at call sites
- Strings in log messages or exception messages containing spelling errors that affect readability

#### Proper malloc/free Pairing
**Key checks:**
- Every `malloc()` has a corresponding `free()`
- Avoid double-freeing the same memory block
- Set the pointer to NULL after freeing

**Example:**
```c
// Bad
char* buffer = malloc(1024);
// use buffer...
// forgot to free memory

// Good
char* buffer = malloc(1024);
if (buffer != NULL) {
    // use buffer...
    free(buffer);
    buffer = NULL;
}
```

#### Memory Leak Detection
**Key checks:**
- All allocated memory is freed before function exit
- Memory is also freed in error handling paths
- Use tools such as Valgrind for detection

#### Buffer Overflow Protection
**Key checks:**
- Check bounds before array access
- Use safe functions for string operations
- Ensure correct loop boundary conditions

**Example:**
```c
// Bad: dangerous operation
char buffer[100];
strcpy(buffer, user_input); // may overflow

// Good: safe operation
char buffer[100];
strncpy(buffer, user_input, sizeof(buffer) - 1);
buffer[sizeof(buffer) - 1] = '\0';
```

#### Safe String Operations
**Recommended safe functions:**
- `strncpy()` instead of `strcpy()`
- `strncat()` instead of `strcat()`
- `snprintf()` instead of `sprintf()`

#### Naming Conventions
**Requirements:**
- Use snake_case naming style
- Variable names should be meaningful
- Constants should use UPPER_CASE
`````

#### 27. python.md

`````markdown
> Favor precision over recall: only raise an issue when you are confident it is a real defect, and stay silent when the surrounding context is unclear — a false alarm costs more reviewer trust than a missed minor issue. Treat security and correctness findings as blocking, and style or idiom suggestions as non-blocking.

#### Obvious Typos or Spelling Errors
- Spelling errors in variable, function, class, or module names at their declaration sites; do not report spelling errors at reference sites, as these are determined by the declaration
- Strings in log messages or exception messages containing spelling errors that affect readability

#### Dead Code
- Code blocks that can never be reached (e.g., branches where the condition is always false, code after a `return`, `raise`, `break`, or `continue`)
- Variables, imports, or function parameters that are declared but never read or referenced
- Large blocks of commented-out code with no apparent intent to preserve
- Do not report unused imports, variables, or parameters in `.pyi` stub files; a stub declares an interface it never executes, so re-exported imports, annotation-only declarations, and unreferenced parameter names are expected rather than dead

#### Mutable Default Arguments and Shared State
- Mutable default arguments such as `def f(x=[])` or `def f(x={})`; the default is created once and shared across every call. Default to `None` and build the value inside the body
- Class-level mutable attributes shared unintentionally across instances when a per-instance value was intended
- Module-level mutable globals (lists, dicts, caches) mutated across requests or threads, retaining state in ways that surprise the caller
- Closures that capture a loop variable by reference and all end up seeing its final value
- Do not report when the function never mutates the argument, or when the shared default is a deliberate, documented cache or sentinel

#### Boundary and Edge-Case Handling
- Empty inputs assumed to be non-empty: indexing `xs[0]`, `max()`/`min()`, or slicing without first handling the empty `list`, `str`, `dict`, or iterator
- Off-by-one and out-of-range access on indices, ranges, or slices, especially at the first/last element
- `None` reaching code that assumes a value, when an upstream call or default can legitimately return `None` (confirm the data source with `file_read` before flagging)
- Comparing floats for exact equality with `==`; use `math.isclose` or an explicit tolerance, since floating-point results are not exact
- Integer/float and division assumptions: unintended truncation with `//`, or `ZeroDivisionError` when a divisor can be zero
- Heterogeneous or unexpected element types in a collection that the code assumes are uniform (e.g., mixing `None`, numbers, and strings)
- Dictionary access by key without handling the missing-key case (`d[k]` vs `d.get(k)`), or set/dict operations that assume a key is present
- Do not report edge cases that a caller or type contract has already ruled out, or inputs that cannot occur given validated boundaries upstream

#### Error Handling and Exceptions
- Bare `except:` swallows everything, including `KeyboardInterrupt` and `SystemExit`; catch `except Exception` at minimum, and prefer the specific exception types you expect
- `except Exception` that is still broader than the failure being handled; narrow it to the exceptions actually raised by the guarded call
- Exceptions caught and silently discarded (`pass`) without logging or re-raising
- Original traceback lost when re-raising; prefer `raise NewError(...) from err` to preserve the cause
- Broad `try` blocks that wrap far more than the line that can actually fail, hiding where the error originates
- `assert` used for runtime validation of external input — assertions are stripped under `python -O`

#### Identity and Equality Comparisons
- Using `is`/`is not` to compare against literals such as strings, numbers, or tuples; this relies on implementation-specific interning rather than value equality — use `==` (a real correctness risk)
- Comparing against `True`/`False` with `==`, where a truthy-but-not-`True` value (e.g. `1`, a non-empty container) would compare unequal; prefer a plain truthiness check
- Reserve `is` for identity checks against singletons and sentinels
- Comparing against `None` with `==`/`!=` rather than `is`/`is not` is a style preference; report as minor, not blocking

#### Resource Management
- Files, sockets, locks, or database connections opened without a `with` statement, risking leaks on early return or exception
- Context managers available but bypassed in favor of manual `open()`/`close()` pairs
- Resources acquired in a `try` whose `finally` cleanup is missing or incomplete on the error path
- Iterators or generators holding resources open longer than necessary
- Do not report short-lived scripts, or handles already managed by an enclosing `with` or framework-managed lifecycle (confirm the surrounding scope with `file_read` before flagging)

#### Performance
Confirm data scale and that the code is on a hot path before flagging:
- Building strings with `+=` in a loop instead of accumulating in a list and `"".join(...)`, or using an f-string
- Repeated membership tests against a `list` where a `set` or `dict` would turn O(n) lookups into O(1)
- Building a full list when a generator would avoid holding everything in memory
- Recomputing inside a loop a value that is invariant across iterations (e.g., compiling a regex, attribute lookups in hot paths)
- Passing an eagerly formatted f-string to `logging` (e.g., `logging.info(f"...")`) instead of `logging.info("%s", value)`, which defeats lazy formatting when the level is disabled

#### Concurrency and Async
Only flag concurrency issues when there is evidence of multi-threaded, multi-process, or async invocation (confirm the call context before reporting):
- CPU-bound work parallelized with `threading` under the GIL where `multiprocessing` or a process pool is the right tool (traditional CPython; free-threaded builds excepted); I/O-bound work is the case threads actually help
- Check-then-act races on shared state without a `Lock`, or non-atomic compound updates assumed to be atomic
- Blocking calls (synchronous I/O, `time.sleep`, `requests`, CPU-heavy work) inside `async def`, stalling the event loop; use the async equivalent or run them in an executor
- `asyncio` tasks created and never awaited, so exceptions are swallowed and the work may be garbage-collected before it finishes
- Shared mutable state across threads or tasks without synchronization or a thread-safe structure

Do not report local variables (each thread has its own), read-only access to shared data, or code with no evidence of concurrent use.

#### Security-Sensitive Code
Validate the data source before flagging; confirm the input is actually attacker-controlled rather than a trusted constant:
- `eval`, `exec`, or `compile` on untrusted input; this is arbitrary code execution
- `subprocess` with `shell=True` built from unsanitized input; pass an argument list and avoid the shell
- `pickle`, `marshal`, or `yaml.load` (without `SafeLoader`) on untrusted data; deserialization can execute arbitrary code
- SQL built by string concatenation or f-strings instead of parameterized queries
- Secrets, tokens, passwords, or PII written to logs or committed in source
- Weak or misused cryptography (`hashlib.md5`/`sha1` for passwords, `random` for security tokens); use `secrets` and vetted libraries
- Untrusted file paths joined without validation, allowing path traversal
`````

#### 28. php.md

`````markdown
#### PHP Review Principles
> Favor precision over recall: report only defects that are likely real in the changed code and its reachable context. Treat correctness and security findings as blocking; style-only suggestions are non-blocking. Account for the project's PHP version and framework conventions before reporting version- or lifecycle-dependent behavior.

Before making a non-local claim, use `file_read` and `code_search` to verify callers, input sources, framework configuration, template context, and resource ownership. Do not duplicate findings reliably enforced by PHPStan, Psalm, PHP_CodeSniffer, the formatter, or the PHP compiler unless the diff demonstrates a concrete consequence those tools do not express.

#### Type Juggling, Equality, and Null Semantics
- Loose comparison (`==` or `!=`) whose coercion can make distinct security- or domain-sensitive values compare equal. Prefer strict comparison when operands are expected to have the same type; do not flag deliberate, validated normalization.
- Truthiness or `empty()` checks that incorrectly treat `0`, `"0"`, `false`, `null`, and an empty value as equivalent when those states have different meanings.
- `isset()` used when a present key with a `null` value must be distinguished from a missing key; use `array_key_exists()` when presence, rather than non-nullness, is the contract.
- Nullable, union, or `false`-returning APIs whose failure value reaches code that assumes a usable object, scalar, or resource. Confirm the declared and runtime contract before flagging.
- Numeric-string, arithmetic, or comparison behavior that depends on a different PHP version from the one supported by `composer.json`, CI, or deployment configuration.

#### Arrays, Iteration, and Value Semantics
- Array keys read without handling a reachable missing-key path, especially request data, decoded JSON, database rows, or optional configuration.
- A `foreach` value variable iterated by reference and then reused without `unset()`, leaving it aliased to the final element and allowing later assignments to corrupt the array.
- Array union (`+`), `array_merge`, spread syntax, or numeric-key reindexing used with semantics different from the intended overwrite and ordering behavior.
- Callbacks or closures that capture a loop variable by reference and later observe an unintended final or mutated value.
- Mutation during iteration that can skip, duplicate, or unexpectedly retain elements. Do not flag mutation whose traversal behavior is deliberate and locally evident.

#### Errors, Exceptions, and API Contracts
- `Throwable` or `Exception` caught and silently discarded, converted into success, or replaced with a misleading default on a path where the failure matters.
- Catching a broad exception around unrelated operations so the handler cannot distinguish the expected failure from a programming or infrastructure defect.
- A codebase contract inconsistently mixing exceptions, `false`, and `null` for the same failure, causing callers to miss an error path.
- Cleanup, rollback, or response-finalization code that hides the primary exception or returns success after the operation failed.
- Warnings or errors suppressed with `@` where suppression can turn a meaningful failure into invalid state. Do not flag a narrowly documented compatibility probe that checks the result safely.

#### Resources, Transactions, and Request Lifecycle
- Transactions, locks, database cursors, or resources in long-running processes not released, committed, or rolled back on every reachable path when delayed cleanup can exhaust capacity or break correctness. Do not flag ordinary request-scoped streams or files merely because PHP can release them at request shutdown.
- Database transactions with early returns or exception paths that can leave the transaction open, or nested transaction assumptions unsupported by the active driver/framework.
- cURL or stream operations lacking timeouts on a request or worker path where a remote endpoint can stall execution.
- Session locks held across slow network, database, or CPU work when concurrent requests for the same session must proceed.
- Do not report resources owned by a framework, dependency-injection container, generator consumer, or caller when ownership transfer is established by the surrounding code.

#### Database and ORM Correctness
- SQL assembled from untrusted values instead of parameter binding. Identifiers such as column names and sort directions cannot usually be bound and require an allowlist.
- Raw ORM expressions, query fragments, or dynamic table/column names that bypass the framework's normal parameterization with attacker-controlled data.
- Missing transaction boundaries when a changed multi-step write must be atomic, or side effects ordered so a rollback cannot restore consistency.
- N+1 queries or repeated remote calls only when the loop is reachable at meaningful scale and eager loading or batching preserves behavior.
- Mass-assignment exposure only when request-controlled fields reach a model and the framework's fillable/guarded/schema configuration does not already constrain them.

#### Web and Template Security Boundaries
Confirm attacker control and the output or execution context before reporting. Framework validation and auto-escaping may make an otherwise dangerous-looking operation safe.

- Untrusted output rendered without context-appropriate escaping for HTML text, attributes, URLs, JavaScript, or CSS. For `.phtml` templates, verify whether the view helper already escapes the value and whether raw HTML is intentional and sanitized.
- Authorization enforced only in a client, template, or hidden control rather than at the server-side operation; check route middleware, policies, voters, and controller guards before flagging.
- State-changing browser requests missing required CSRF protection when cookie-based authentication makes cross-site invocation possible. Do not flag token-authenticated APIs that are not vulnerable to ambient credentials.
- Redirects, response headers, or cookies built from untrusted data without validation or appropriate `Secure`, `HttpOnly`, and `SameSite` protections where those properties are required.
- File uploads trusted by client filename, extension, or MIME header alone; verify server-side type checks, generated storage names, destination boundaries, and executable-file handling.
- User-controlled paths used for filesystem access without normalization and boundary enforcement, enabling traversal, symlink escape, or unintended overwrite.

#### Dynamic Execution, Deserialization, and Outbound Requests
- `eval`, dynamic `include`/`require`, variable function calls, reflection, or shell commands reached by untrusted input without a strict allowlist.
- `unserialize()` on attacker-controlled data, including signed data where key management or verification is absent. Prefer a non-executable format; `allowed_classes` reduces object injection but does not make arbitrary data trustworthy.
- Shell commands built through concatenation or incomplete escaping. Prefer direct process APIs with separate arguments and validate option-like attacker-controlled values.
- Outbound URLs derived from untrusted input without required scheme, host, port, redirect, and private-network restrictions, enabling SSRF or credential forwarding.
- Weak randomness or password handling: predictable token generation, reversible password storage, manual password hashing, or non-constant-time comparison of secrets. Prefer `random_bytes`, `password_hash`, `password_verify`, and `hash_equals` as appropriate.
- Secrets, session identifiers, authorization headers, passwords, private keys, or sensitive personal data logged, returned in errors, or embedded in source.

#### Performance and Review Scope
- Report performance issues only with evidence of meaningful data scale or a hot path: repeated queries, accidental full-result materialization, quadratic array operations, or expensive work repeated inside a loop.
- Suggest tests only for concrete changed failure modes involving coercion, boundary values, errors, transactions, authorization, escaping, or framework configuration.
- Do not make formatting, naming, import ordering, modern-syntax preferences, or advice already enforced by deterministic PHP tooling into blocking findings.
`````

#### 29. protobuf.md

`````markdown
> Favor precision over recall: only raise an issue when you are confident it is a real defect, and stay silent when the surrounding context is unclear — a false alarm costs more reviewer trust than a missed minor issue. Treat security and correctness findings as blocking, and style or idiom suggestions as non-blocking.

#### Obvious Typos or Spelling Errors
- Spelling errors in message, field, enum, enum-value, service, or rpc names at their declaration sites; do not report spelling errors at reference sites
- Comments or option strings with spelling errors that affect readability of the public API surface

#### Field Numbers and Wire Compatibility
- Reused or renumbered field tags that break existing clients or servers (Wire Compatibility)
- Changing a field's type, label (`optional`/`repeated`/`required`), or oneof membership in a way that breaks wire or JSON compatibility
- Deleting a field without adding both its number and name to `reserved`
- Renaming a field without `json_name` consideration when JSON clients depend on the old name
- Do not flag purely additive new fields with fresh numbers, or documentation-only comment changes

#### Message and Field Design
- Missing `optional` (proto3) where absence must be distinguishable from the zero value
- `map` used where order matters, or `repeated` used where key lookup would be clearer
- oneof fields that leave an invalid zero-state representable when an explicit sentinel was intended
- Nested messages that re-encode the same domain concept already modeled elsewhere in the package
- Do not report stylistic preference for `message` vs `group` (groups are legacy) when the schema is already consistent

#### Enums and Defaults
- First enum value is not a zero `*_UNSPECIFIED` (or equivalent) sentinel
- Relying on implicit zero defaults across schema versions when clients treat zero as meaningful data
- Inserting new enum values in the middle of an existing numeric range used by older clients
- Do not flag additive enum values appended at the end with new numbers

#### Services and RPC Design
- Non-idempotent methods modeled as if they were safe to retry without client-visible side effects
- Multiple rpcs sharing the same request or response message type when distinct contracts would prevent accidental field coupling
- Unbounded client/server streaming without documented flow control, page size, or deadline expectations
- Missing request or response message wrappers that force primitive/scalar request bodies
- Do not flag standard google.api annotations or well-known types used correctly

#### Security and Resource Limits
- `google.protobuf.Any` accepted from untrusted input without type allowlisting
- Unbounded `repeated`/`map` fields or recursive message depth on untrusted payloads with no application-level limits
- Secrets, tokens, or credentials embedded in field defaults, examples, or comments
- File paths, URLs, or SQL fragments carried as unconstrained strings without validation guidance at the service boundary
- Do not report when limits are enforced outside the schema and that boundary is clearly documented
`````

#### 30. po.md

`````markdown
> Favor precision over recall: only raise an issue when you are confident it is a real defect, and stay silent when the surrounding context is unclear — a false alarm costs more reviewer trust than a missed minor issue. Treat factual errors and placeholder mismatches as blocking, and style suggestions as non-blocking.

#### Factual Errors in Translation
- The `msgstr` contradicts or distorts the meaning of its `msgid` (mistranslation, omitted clauses, or text belonging to a different entry)
- Numbers, units, dates, or proper nouns in the `msgstr` that do not match the `msgid` (e.g., "100 MB" translated as "100 GB")
- Do not report subjective wording preferences, tone, or regional variants when the meaning is preserved

#### Format and Structure
- Unbalanced or unescaped quotes in `msgid`/`msgstr` strings, breaking the entry
- Multi-line continuation strings concatenated incorrectly (missing trailing space/newline between fragments that changes the resulting text)
- `msgstr` missing entirely for a non-fuzzy entry, or orphaned `msgstr` without a preceding `msgid`
- Duplicate `msgid` definitions within the file that conflict with each other

#### Placeholder Mismatch
- Format placeholders (`%s`, `%d`, `%.2f`, `%(name)s`) present in the `msgid` but missing, reordered (without positional markers like `%1$s`), or changed in type in the `msgstr`
- Named placeholders renamed in the `msgstr` (e.g., `%(user)s` becoming `%(name)s`), which breaks lookups at runtime
- Brace-style placeholders (`{0}`, `{name}`, `{{count}}`) whose count or names differ between `msgid` and `msgstr`
- Do not report reordering that is correctly expressed with explicit positional markers

#### Plural Forms
- Number of `msgstr[n]` entries does not match the `nplurals` declared in the `Plural-Forms` header
- `msgid_plural` present but only `msgstr[0]` provided, or `msgstr[n]` indices that skip values
- A language whose plural rules require multiple forms (e.g., Arabic, Russian, Polish) given a single form that copies the singular, when the count varies

#### Escapes and Surrounding Whitespace
- Broken escape sequences (`\n`, `\t`, `\"`) that render literally or terminate the string early
- Leading/trailing whitespace or trailing `\n` present in the `msgid` but missing (or added) in the `msgstr`, causing layout or concatenation differences
- Encoding-corrupted characters (mojibake) in the `msgstr`
`````

#### 31. pot.md

`````markdown
> Favor precision over recall: only raise an issue when you are confident it is a real defect, and stay silent when the surrounding context is unclear — a false alarm costs more reviewer trust than a missed minor issue. Treat structural errors and placeholder mismatches as blocking, and style suggestions as non-blocking. In a template (.pot) file every `msgstr` is expected to be empty; do not report empty `msgstr` entries as missing translations.

#### Header Integrity
- Missing or malformed `Content-Type` header, or a charset that does not match the file's actual encoding
- `Plural-Forms` header with a syntactically invalid `nplurals`/`plural` expression, or one that does not parse as a C-style ternary expression
- Do not report missing optional metadata fields (e.g., `Project-Id-Version`, `Report-Msgid-Bugs-To`)

#### Format and Structure
- Unbalanced or unescaped quotes in `msgid`/`msgid_plural` strings, breaking the entry
- Multi-line continuation strings concatenated incorrectly (missing trailing space/newline between fragments that changes the resulting text)
- Orphaned `msgid_plural` or `msgstr` without a preceding `msgid`
- Duplicate `msgid` definitions within the file that conflict with each other (different `msgctxt`, comments, or placeholders)
- A non-empty `msgstr` in a template entry, which usually means a translation was accidentally committed into the template

#### Placeholder Consistency
- Format placeholders (`%s`, `%d`, `%.2f`, `%(name)s`) present in the `msgid` but missing, reordered (without positional markers like `%1$s`), or changed in type in the `msgid_plural`
- Named placeholders renamed between `msgid` and `msgid_plural` (e.g., `%(user)s` becoming `%(name)s`), which breaks lookups at runtime
- Brace-style placeholders (`{0}`, `{name}`, `{{count}}`) whose count or names differ between `msgid` and `msgid_plural`
- Do not report reordering that is correctly expressed with explicit positional markers

#### Plural Forms
- `msgid_plural` present but no `Plural-Forms` header declared, or a `Plural-Forms` header whose `nplurals` is inconsistent with the `plural` expression's reachable form count
- Singular-only entries (`msgid` without `msgid_plural`) whose text embeds a count placeholder (e.g., `%d files`), indicating a plural form was forgotten
- A `plural` expression that is constant (always evaluates to the same index), defeating the purpose of plural selection

#### Escapes and Surrounding Whitespace
- Broken escape sequences (`\n`, `\t`, `\"`) that render literally or terminate the string early
- Leading/trailing whitespace or trailing `\n` that differs between `msgid` and `msgid_plural` in a way that changes layout or concatenation
- Encoding-corrupted characters (mojibake) in any string
`````

#### 32. graphql.md

`````markdown
> Favor precision over recall: only raise an issue when you are confident it is a real defect, and stay silent when the surrounding context is unclear — a false alarm costs more reviewer trust than a missed minor issue. Treat security and correctness findings as blocking, and style or idiom suggestions as non-blocking. Review only what is observable in the schema (SDL) or operation text under review; do not infer resolver behavior that lives in code outside this file.

#### Obvious Typos or Spelling Errors
- Spelling errors in type, field, enum-value, argument, input, directive, or fragment names at their declaration sites; do not report spelling errors at reference sites
- Typos in descriptions or field names that affect readability of the public API surface

#### Schema Evolution and Breaking Changes
- Removing or renaming an existing type, field, enum value, or argument that clients may already depend on
- Making a previously nullable input field or argument non-null, or adding a new required (non-null, no-default) argument to an existing field
- Changing a field or argument type to an incompatible type
- `@deprecated` applied without a non-empty `reason`
- Do not flag purely additive changes: new types, new fields, new enum values appended, or new optional (nullable / defaulted) arguments
- GraphQL has no numeric field tags — do not import Protocol Buffers field-number or renumbering concepts

#### Naming Conventions
- Types (object, interface, union, enum, input, scalar) should be `PascalCase`; fields, arguments, and input fields `camelCase`; enum values `UPPER_CASE`
- Redundant `query`/`get` prefixes on `Query` fields, `mutation`/`subscription` affixes on their root fields, and `type`/`enum`/`interface`/`union` affixes in type names
- Do not flag names that already follow these conventions merely to suggest a synonym

#### Schema Design
- Nullability that hides required-vs-optional intent (e.g. a field that can never be null typed as nullable, or a genuinely optional field typed non-null)
- Types unreachable from any root field (`Query`/`Mutation`/`Subscription`) — dead schema
- Missing descriptions on public types and fields that form the API contract
- Names prefixed with `__` (reserved for introspection)
- List fields returning a collection without a pagination or limit argument (`first`/`last`/`limit`/`after`), which allows unbounded result sets

#### Operations and Fragments
- Selecting `@deprecated` fields in queries, mutations, or fragments
- Fragment cycles, unused fragments, and unused or undefined operation variables
- Anonymous operations where a named operation aids caching and debugging
- Missing leaf selections on fields that return object/interface/union types
- Do not flag well-formed operations that merely differ in stylistic preference

#### Security and Resource Limits
- Only flag when the condition is observable in the schema or operation text under review
- Unbounded list fields (see Schema Design) or deeply nested / recursive selections with no documented depth or complexity limit (query-depth DoS surface)
- A field carrying clearly sensitive data (token, secret, password, or PII by name or description) exposed without an accompanying auth-related directive or comment
- An explicit directive, configuration, or comment in the diff that enables introspection on an untrusted surface
- Do not infer resolver-level N+1 cost, dataloader/batching usage, or runtime introspection state — those live in resolver code, not in schema or operation files
- Do not report when a limit is enforced and clearly documented outside the schema
`````

#### 33. prisma.md

`````markdown
#### Prisma Schema Review Principles
> Favor precision over recall: report only defects likely real in the changed schema and its reachable application, migration, and datasource context. Treat data-loss, integrity, security, and compatibility findings as blocking; style-only suggestions are non-blocking. Do not duplicate errors that `prisma validate`, `prisma format`, migration tooling, or the database determine mechanically unless the diff reveals a concrete production consequence.

Before reporting a non-local claim, use `file_read` and `code_search` to inspect the datasource provider, Prisma version, migration history, generated-client call sites, queries, and existing schema conventions. Do not assume a relation action, index, native type, field, or generator setting is unsafe without evidence of the database provider, deployed data, or application behavior it affects.

#### Relations and Referential Integrity
- Relation fields whose optionality, scalar foreign-key field, `fields`, or `references` declarations disagree, allowing an invalid or unrepresentable relationship. Confirm whether the relation is relational or MongoDB and whether the affected fields are actually changed.
- `onDelete` or `onUpdate` actions that can unexpectedly delete, null, or orphan data; `SetNull` on a required relation; cascades that create destructive paths or cycles; or an action unsupported by the configured provider. Report only with evidence of affected data ownership and delete/update flows.
- Ambiguous multiple relations between the same models that lack the relation names needed to bind intended fields, or a relation name changed on only one side.
- Changes to `relationMode` that remove database-enforced foreign keys or shift integrity enforcement to Prisma without corresponding application safeguards. Do not report intentional modes used for a documented database limitation.
- Implicit many-to-many relations changed where explicit join models are required for relation metadata, referential actions, payload fields, or stable database mappings.

#### Schema Evolution and Data Compatibility
- Removing, renaming, narrowing, making required, or changing the meaning of a model, field, enum value, identifier, unique constraint, mapping, native type, or default in a way that can lose existing data, fail a migration, or break deployed client code. Inspect migrations and call sites before flagging.
- Adding a non-null field without a safe backfill/default/migration strategy for existing rows; changing a default that changes behavior for new records; or using a database default that does not match the Prisma/client expectation.
- Changing `@id`, `@@id`, `@unique`, `@@unique`, `@map`, or `@@map` in a way that alters identity, upsert/connect selectors, generated client names, existing database column/table names, or externally stored references.
- Removing or renaming an enum value that existing rows, migrations, or application code can still use. Do not flag additive enum values unless provider/application compatibility establishes a real risk.
- Native database types, `@db.*` attributes, and provider-specific features incompatible with the configured provider, deployed database version, existing values, precision/scale, length, or timezone semantics.

#### Indexes, Constraints, and Query Behavior
- Missing, removed, or incorrectly ordered `@@index`, `@@unique`, or composite constraints only when application queries, relation lookups, uniqueness guarantees, or migration behavior demonstrate a concrete need. Do not require indexes based solely on a field name or hypothetical scale.
- A unique constraint added to existing data without a deduplication/migration path, or removed when callers depend on uniqueness for authentication, tenancy, idempotency, `connect`, or `upsert`.
- Composite indexes/unique constraints that do not match changed equality, ordering, or relation access patterns, producing an unusable selector or avoidable production query regression.
- Changes to full-text, partial, clustered, sort, operator-class, or other provider-specific index options that the configured provider/version does not support or that change correctness semantics.

#### Datasource, Generators, and Deployment Safety
- Hard-coded database URLs, credentials, tokens, or connection parameters in a schema or associated Prisma configuration where they can be committed, logged, or deployed to the wrong environment. Prefer environment-based configuration and confirm the value is actually secret rather than a safe local/test URL.
- Datasource provider, schema, extension, shadow-database, direct-connection, or connection-pooling changes incompatible with the target environment or migration workflow. Check Prisma configuration and deployment setup first.
- Generator provider, output, binary-target, engine, preview-feature, or client-generation changes that can break builds, runtime deployment targets, generated imports, or CI. Do not flag a generator setting merely because it differs from a default.
- Preview or experimental features enabled, removed, or changed without compatibility evidence; ensure the project's Prisma version supports the configured feature.

#### Security and Sensitive Data
- Models or fields that newly expose secrets, credentials, access tokens, password hashes, private keys, financial data, or personal data through generated clients, logs, admin tooling, or overly broad relations. Confirm the field's actual use and access boundary.
- Missing tenant/owner relation, uniqueness, or integrity constraint only when code and schema together show that cross-tenant access, duplicate identities, or authorization bypass is possible. Do not infer authorization requirements from generic model names.
- Unsafe defaults, cascades, mappings, or nullable ownership fields that let destructive operations cross an established tenant or authorization boundary.

#### Review Scope
- Focus on correctness, integrity, migration safety, performance with demonstrated query evidence, security, and deployment compatibility.
- Do not report formatting, model/field naming preferences, relation naming style, documentation requests, or speculative indexes as findings.
- When the schema change is intentionally accompanied by a migration, generated-client update, or application code change, review the complete change set before reporting a compatibility issue.
`````

#### 34. julia.md

`````markdown
> Favor precision over recall: only raise an issue when you are confident it is a real defect, and stay silent when the surrounding context is unclear — a false alarm costs more reviewer trust than a missed minor issue. Treat security and correctness findings as blocking, and style or idiom suggestions as non-blocking. Review only what is observable in the code under review; do not infer behavior of methods or macros defined outside this file.

#### Obvious Typos or Spelling Errors
- Spelling errors in function names, struct/type names, field names, module names, or constant names at their declaration sites; do not report spelling errors at call sites
- Typos in log messages, `@error`/`@warn` text, exception messages, docstrings, or other public diagnostics that affect readability

#### Type Stability
- Functions whose return type depends on a runtime value in a way the compiler cannot infer (type-unstable functions), forcing boxed `Any` results and defeating the JIT
- Struct fields declared with abstract or non-concrete types (e.g. `field::Real`, `field::AbstractArray`, or untyped fields defaulting to `Any`); prefer concrete types or type parameters so instances are stored efficiently
- Containers created as `[]`, `Vector{Any}`, or `Dict()` without element types when a concrete element type is known
- Accumulator or loop variables whose type changes across iterations (e.g. initializing `x = 0` then assigning a `Float64`), which widens the inferred type

#### Multiple Dispatch and Method Definitions
- Method signatures typed as `::Any` (or untyped) that are broader than intended and silently capture unrelated argument types, creating ambiguity or wrong-method selection
- Method ambiguities: two methods equally specific for some argument tuple, so a call errors or resolves unpredictably
- Type piracy: defining or extending a method where neither the function nor any of the argument types is owned by this module, which can change behavior for unrelated code
- Overloading `Base` functions (`==`, `hash`, `show`, `length`, `iterate`) inconsistently — e.g. defining `==` without a matching `hash`

#### Bounds and Indexing Safety
- `@inbounds` or `@simd` applied to a loop whose indices are not provably within bounds, which turns an out-of-bounds access into undefined behavior instead of a checked error
- 1-based indexing mistakes: off-by-one errors, assuming 0-based access, or hardcoding `1:length(x)` where `eachindex(x)` (or `firstindex`/`lastindex`) is correct for arbitrary or offset arrays
- Assuming a specific axis origin for arrays that may not start at index 1

#### Missing, Nothing, and Error Handling
- Conflating `nothing` (absence), `missing` (unknown data, propagates through comparisons), and `NaN`; comparisons like `x == nothing` or `x == missing` instead of `isnothing(x)` / `ismissing(x)` / `===`
- Functions that sometimes `throw` and sometimes `return nothing` for the same failure mode, forcing callers to handle both
- Relying on `@assert` for input validation or security checks: assertions may be disabled and must not guard correctness-critical invariants; use explicit `throw` with a typed exception instead
- Swallowing exceptions with an empty `catch` block or rethrowing without context; broad `catch` that hides real errors

#### Concurrency and Shared State
- Data races on shared mutable state updated from `Threads.@threads`, `Threads.@spawn`, or `@async` tasks without a lock, atomic, or per-task accumulation
- Mutating non-thread-safe globals or shared collections (`push!`, `setindex!`) concurrently from multiple tasks
- Assuming `@async` provides parallelism: it schedules a cooperative task on the current thread, so CPU-bound work needs `Threads.@spawn` instead
- Tasks spawned in a loop that capture and mutate a variable declared *outside* the loop, so every task shares one binding
- Non-reentrant use of a shared `Random` RNG across threads, giving correlated or racy results

#### Performance Anti-Patterns
- Untyped, non-const global variables read inside hot functions, which the compiler cannot specialize on; annotate with `const` or pass as arguments
- Abstract field types or `Any` containers in performance-sensitive structs (see Type Stability)
- Unnecessary allocations in hot loops: repeated array/`String` construction, slicing that copies where a `@view` would suffice, or splatting large collections into calls
- Growing arrays element-by-element without `sizehint!` when the final size is known

#### Security-Sensitive Code
- `eval`, `Meta.parse`, `include_string`, or `@eval` applied to untrusted or externally derived input (code injection)
- Untrusted input interpolated into an explicit shell invocation such as `sh -c` or `bash -c` (command injection); note that a plain backtick command passes its interpolated arguments straight to the process without a shell, so the risk arises only when a shell is invoked deliberately
- `ccall`, `unsafe_load`/`unsafe_store!`, `unsafe_wrap`, `pointer`, or `unsafe_string` used without validating length, alignment, lifetime, and null-ness of the underlying memory
- Building SQL or file paths through unchecked string concatenation/interpolation of external input
- Logging secrets, tokens, credentials, or personally identifiable information
`````

#### 35. r.md

`````markdown
#### R Code Review Principles

> Favor correctness, numerical precision, memory efficiency, and vectorization over style: report only defects likely real in the changed code, statistical models, pipelines, and package structure. Treat data corruption, subtle scope bugs, vectorized logic failures, unsafe evaluation, and package build breaks as blocking; style-only suggestions are non-blocking. Do not duplicate errors that `R CMD check`, `lintr`, `styler`, or standard R parser tools identify mechanically unless the diff reveals a concrete production or runtime execution risk.

Before reporting a non-local claim, inspect function definitions, namespace loads (`library()`, `require()`, `pkg::func`), lazy evaluation boundaries, NSE (non-standard evaluation) contexts, formula interfaces, environment chains, and package dependencies. Do not assume a vectorized function, S3/S4 method dispatch, or memory operation is unsafe without evidence of caller context, input data structures, or performance limits.

#### Vectorization, Data Types, and Type Safety

* Unintentional scalar logical operations (`&&`, `||`) used on vectors where element-wise operations (`&`, `|`) are required, or element-wise logicals used inside scalar conditionals like `if (...)`.
* Implicit type coercion caused by mixing types in vectors, matrices, or `c()` calls (e.g., mixing `character` and `numeric`), or relying on implicit `factors`-to-character/numeric conversions without explicit `as.character()` or `as.numeric(as.character())`.
* Missing or incorrect edge-case handling for zero-length inputs (`numeric(0)`, `character(0)`), empty data frames, single-row/column matrices dropping dimensions (`drop = FALSE`), or unexpected `NA`/`NULL`/`NaN`/`Inf` propagation.
* Unsafe recycling of vectors in arithmetic, comparisons, or data frame assignments where vector lengths are not equal or exact multiples, leading to silent standard R recycling or subtle calculation bugs.
* Relying on base equality checks (`==`) with floating-point numbers instead of `isTRUE(all.equal(...))` or setting threshold tolerances (`abs(x - y) < eps`).

#### Non-Standard Evaluation (NSE) and Tidyverse/Data.Table Syntax

* Unquoted column references, dynamic variable names, or programmatic evaluation using NSE (e.g., `dplyr::select()`, `ggplot2::aes()`, `data.table` expressions) without proper quasiquotation (`!!`, `{{{ }}}`, `sym()`, `all_of()`, `any_of()`) when passed as function parameters.
* Ambiguity between data frame column names and environment variables inside `dplyr`, `data.table`, or `subset()` expressions, missing explicit `.data$` or `.env$` pronoun usage in package code.
* Side effects in `data.table` in-place modification (`:=`) leaking into caller environments or modifying passed arguments without explicit deep copying (`copy()`).
* Misuse of standard base evaluation inside tidyverse pipeline functions or vice-versa, causing delayed execution failures or unexpected binding contexts.

#### Scope, Lazy Evaluation, and Environment Boundaries

* Scoping bugs where functions implicitly rely on global environment variables (`.GlobalEnv`) rather than explicitly passed arguments or package options (`getOption()`).
* Unintended variable capture in delayed evaluation contexts, lazy promises, `lapply()` / `purrr::map()` loops, or standard `for` loops where iteration variables are referenced lazily inside closures/lambdas.
* Modifying caller environments using `assign()`, `<<-`, or `parent.frame()` without explicit architectural justification, clear lock boundaries, or documentation of side effects.
* Mismanaging S3, S4, or R6 method dispatch, wrong class inheritance order, or failing to call `UseMethod()` / `callNextMethod()` correctly.

#### Memory Management, Performance, and I/O

* Repeated memory re-allocation inside loops (e.g., appending rows to data frames with `rbind()` or extending vectors dynamically) instead of pre-allocating output vectors or using vector/list accumulation.
* Deep copying of large data objects in memory when passing to functions or executing multi-step transformations where memory-efficient tools (`data.table`, `arrow`, `dbplyr`, or `vroom`) should be used.
* Missing explicit connection closures or resource cleanup (`close()`, `on.exit()`) when opening file handles, database connections, graphics devices (`dev.off()`), or temporary directories.
* Unfiltered large dataset imports using `read.csv()` or generic base I/O instead of chunked, memory-mapped, or fast parallel alternatives (`data.table::fread()`, `arrow::read_parquet()`, `vroom::vroom()`).

#### Statistical Precision and Numerical Stability

* Numerical instability or overflow/underflow in custom mathematical functions, likelihoods, or matrix operations where log-scale computations (`log1p()`, `expm1()`, `log-sum-exp`), specialized solvers, or QR decomposition should be used instead of direct inversion (`solve()`).
* Improper handling of missing data (`NA`) in statistical summaries, aggregates, or model estimation (`na.rm = TRUE`, `na.action` settings), leading to unhandled `NA` results or unexpected row dropped patterns.
* Random number generation (RNG) calls (`rnorm()`, `runif()`, etc.) lacking reproducible `set.seed()` calls in tests or stochastic workflows, or unsafe seed state handling in parallel execution (`L'Ecuyer-CMRG` workers).

#### Package Structure, Dependencies, and Namespace

* Direct use of `library()` or `require()` inside package functions instead of properly declaring imports in `DESCRIPTION` (`Imports`, `Suggests`) and namespace imports via `NAMESPACE` (`importFrom`).
* Unqualified calls to non-base package functions inside package code that depend on global search path order, rather than using `package::function()` prefixing.
* Polluting the global search path or masking core methods through overly broad `import(pkg)` directives in package development.
* Non-portable file paths using hardcoded path separators (`/` or `\`), absolute local paths, or user-specific home directories instead of `file.path()`, `here::here()`, or standard R temporary directory utilities (`tempdir()`, `tempfile()`).

#### Review Scope

* Focus on logical correctness, vectorization bugs, memory safety, data frame integrity, statistical precision, and package export safety.
* Do not report pure code styling choices (e.g., `=` vs `<-` assignment, indentation width, snake_case vs camelCase naming) or documentation missingness unless it breaks package vignettes or `R CMD check`.
* When the code change is intentionally part of a major library overhaul or migration (e.g., converting base R code to `dtplyr` or `rlang`), review the full execution context and dynamic inputs before flagging a compatibility issue.
`````

#### 36. terraform.md

`````markdown
> Favor precision over recall: only raise an issue when you are confident it is a real defect, and stay silent when the surrounding context is unclear — a false alarm costs more reviewer trust than a missed minor issue. Treat security and correctness findings as blocking, and style or idiom suggestions as non-blocking. Review only what is observable in the HCL under review; do not infer runtime provider behavior, cloud account configuration, or state stored outside this file.

#### Obvious Typos or Spelling Errors
- Spelling errors in resource/module/variable/output names at their declaration sites; do not report spelling errors at reference sites
- Typos in `description` fields that affect readability of the module's public interface

#### Hardcoded Secrets and Credentials
- A literal password, API key, access key/secret pair, private key, or connection string assigned directly to a resource argument or a `variable`/`locals` default instead of coming from a secret manager, `sensitive` input, or environment-backed data source
- A `.tfvars` file (this file type is the conventional home for real input values, and is frequently committed by accident with production secrets in it) assigning a real-looking secret value rather than a placeholder
- A `variable` block that clearly holds a credential (name/description implies password, token, key, or secret) missing `sensitive = true`

#### Overly Permissive Access
- A security group / firewall / network ACL rule with an unrestricted source (`0.0.0.0/0`, `::/0`, or `"*"`) on a sensitive port (SSH/22, RDP/3389, database ports) or on all ports
- An IAM policy, role, or resource policy granting a wildcard action (`"Action": "*"`) or wildcard resource (`"Resource": "*"`) instead of a scoped permission set
- Public read/write ACLs or public access settings enabled on a storage resource (bucket, blob container) that has no clear public-content purpose stated in the diff

#### State and Lifecycle
- A `terraform.tfstate` or `*.tfstate.backup` file included in the diff — state files can contain resource attributes and secrets in plaintext and should never be committed
- Removing or weakening a `lifecycle { prevent_destroy = true }` block on a resource that looks stateful/critical (database, persistent volume, KMS key) without an explanation in the diff
- A stateful resource (database, storage bucket, KMS key) newly created without any `lifecycle` protection, when sibling resources of the same kind in the diff do have one — an inconsistency worth flagging, not an absolute rule

#### Versioning and Reproducibility
- A `required_providers`/module `source` version constraint left fully unbounded (e.g. no version argument at all, or `>= 0.0.0`) where sibling entries in the same file pin a version — inconsistent, not universally wrong, since some root modules intentionally float
- Do not flag a deliberately wide constraint (e.g. `~>`, a documented range) that is clearly intentional from the surrounding code

#### Style and Structure
- Duplicate resource/data-source labels within the same module (would fail `terraform validate`, if not already caught by other tooling)
- Variables declared but never referenced anywhere in the diff's module, or referenced variables never declared in the diff's scope
- Do not flag formatting/whitespace that `terraform fmt` would silently fix — focus on structural and semantic issues
`````

#### 37. bicep.md

`````markdown
> Favor precision over recall: only raise an issue when you are confident it is a real defect, and stay silent when the surrounding context is unclear — a false alarm costs more reviewer trust than a missed minor issue. Treat security and correctness findings as blocking, and style or idiom suggestions as non-blocking. Review only what is observable in the Bicep under review; do not infer Azure subscription/tenant configuration, deployed resource state, or policy assignments that live outside this file.

#### Obvious Typos or Spelling Errors
- Spelling errors in resource/module/parameter/variable/output names at their declaration sites; do not report spelling errors at reference sites
- Typos in `@description()` text that affect readability of the module's public interface

#### Hardcoded Secrets and Credentials
- A literal password, connection string, API key, or access token assigned directly to a resource property, parameter default, or variable instead of coming from a Key Vault reference (`getSecret()` / `Microsoft.KeyVault/vaults/secrets` resource) or a secure parameter supplied at deployment time
- A parameter whose name or description clearly indicates a credential (password, secret, token, connectionString, apiKey) declared without the `@secure()` decorator, which is what prevents the value from being logged or shown in deployment history

#### Overly Permissive Access
- A `Microsoft.Authorization/roleAssignments` resource granting a broad built-in role (`Owner`, `Contributor`) at subscription or resource-group scope where a narrower, resource-scoped or custom role would suffice, especially when sibling assignments in the same file use narrower scopes
- A network security group rule (`Microsoft.Network/networkSecurityGroups/securityRules`) with `sourceAddressPrefix` set to `*`/`Internet`/`0.0.0.0/0` on a sensitive port (SSH/22, RDP/3389, or a database port such as MySQL/3306, PostgreSQL/5432, SQL Server/1433, MongoDB/27017) or on all ports (`destinationPortRange: '*'`)
- A storage account, key vault, or SQL server resource with `publicNetworkAccess` explicitly set to `'Enabled'` (or left at a default that resolves to public) alongside no compensating `networkAcls`/private-endpoint configuration elsewhere in the same file

#### Insecure Resource Defaults
- A storage account without `minimumTlsVersion` set to a current version, or with `supportsHttpsTrafficOnly` explicitly set to `false`
- A resource property that disables encryption-at-rest or transparent data encryption where the resource type supports enabling it
- Do not flag a resource for merely omitting an optional hardening property when the diff gives no indication either way — only flag an explicit insecure value or an explicit disabling of a secure default

#### Versioning and Reproducibility
- An `api-version` in a resource's type string that is unusually old relative to sibling resources of the same provider in the same diff — inconsistency worth flagging, not an absolute "must be latest" rule
- A module reference (`module ... 'path/to/module.bicep'` or a registry reference) with no version/tag pinning where the surrounding file otherwise pins versions

#### Style and Structure
- Parameters declared but never referenced anywhere in the diff's scope, or referenced parameters/variables never declared in the diff's scope
- Duplicate resource symbolic names within the same file (would fail compilation, if not already caught by other tooling)
- Do not flag formatting/whitespace that the Bicep formatter would silently fix — focus on structural and semantic issues
`````

#### 38. nix.md

`````markdown
> Favor precision over recall: report only Nix issues that are likely to break evaluation, reproducibility, build isolation, security, or deployment behavior. Do not report formatting that `nixfmt` or project style would handle, and do not require flakes when the repository intentionally uses channels or legacy Nix.

#### Evaluation and Attribute Sets
- Duplicate attribute definitions in the same attrset, or an attribute override that unintentionally replaces a previously defined value in the changed scope.
- Referencing `self`, `super`, `pkgs`, `config`, or function arguments that are not in scope for the changed expression.
- `inherit` statements that reference missing names, or inherit from an attrset that cannot contain the requested attribute.
- Recursive attrsets (`rec`) where a value depends on itself directly or through an obvious cycle.

#### Reproducibility and Pinning
- Fetchers such as `fetchTarball`, `fetchGit`, `fetchurl`, `fetchFromGitHub`, or `builtins.fetch*` without a fixed revision and hash when the source affects a package, module, or deployment output.
- Version strings, source revisions, and hashes that are changed inconsistently, for example a package version bump without the matching source revision/hash update.
- Imports from `<nixpkgs>` or mutable channels in otherwise pinned flake or lockfile-based code, unless existing neighboring code deliberately follows the same pattern.

#### Build and Packaging Correctness
- Derivations that use undeclared build tools or runtime dependencies instead of adding them to `nativeBuildInputs`, `buildInputs`, `propagatedBuildInputs`, or wrapper inputs.
- Phase overrides that drop required default behavior without reintroducing it, such as replacing `installPhase` without installing outputs into `$out`.
- Hardcoded host paths, user home paths, or `/usr/bin` tools inside derivations that should build in the Nix sandbox.
- `meta.mainProgram`, `passthru.tests`, or output names that are changed inconsistently with installed binaries or referenced package attributes.

#### NixOS and Home Manager Modules
- Options used before declaration, options with defaults whose type does not match the declared `types.*`, or renamed options without a compatibility alias or migration path.
- Systemd service, timer, user, group, port, or file path changes that conflict with existing module options or make activation fail.
- Secrets or credentials embedded directly in module defaults, environment variables, scripts, or generated config instead of coming from secret management or protected files.

#### Overlays and Flakes
- Overlay functions with argument order or names swapped (`final`/`prev`, `self`/`super`) causing packages to be pulled from the wrong package set.
- Flake outputs that reference missing inputs, unsupported systems, or package attributes not defined for every advertised system.
- Adding a package/app/check/devShell for one system while the surrounding flake helper expects all systems to expose the same attribute.

#### Review Scope
- Focus on evaluation failures, non-reproducible sources, sandbox escapes, missing dependencies, module activation errors, and secret exposure.
- Do not flag preference-only style choices, attr ordering, or idioms that are consistent with neighboring Nix files.
`````

#### 39. haskell.md

`````markdown
> Favor precision over recall: only raise an issue when you are confident it is a real defect, and stay silent when the surrounding context is unclear — a false alarm costs more reviewer trust than a missed minor issue. Treat security and correctness findings as blocking, and style or idiom suggestions as non-blocking. Confirm invariants and the strictness or totality guarantees of helpers defined elsewhere before reporting their call sites.

#### Obvious Typos or Spelling Errors
- Spelling errors in module, type, data constructor, typeclass, function, field, or pattern-synonym names at their declaration sites; do not report spelling errors at use sites
- Typos in user-facing error messages, log output, Haddock comments, or public diagnostics that affect readability

#### Totality, Patterns, and Partial Functions
- Non-exhaustive pattern matches in function equations, `case`, lambdas, or `do` bindings when a reachable constructor or empty input would fail at runtime
- Partial list and container operations such as `head`, `tail`, `init`, `last`, `!!`, `foldl1`, `foldr1`, `minimum`, or `maximum` without a locally proven non-empty or in-bounds invariant; prefer pattern matching, safe lookup, or `NonEmpty`
- `fromJust`, `fromRight`, `read`, `toEnum`, `succ`, `pred`, `error`, or `undefined` on ordinary input or recoverable paths; prefer total alternatives such as `maybe`, `readMaybe`, `readEither`, or an explicit error type
- Record selectors used on a sum type when the field is absent from some reachable constructors
- Do not report a partial operation when the same function has already validated the invariant, the type encodes it, or failure deliberately marks an impossible internal state with a clear explanation

#### Laziness, Strictness, and Space Usage
- `foldl` over a large finite collection with a strict accumulator operation, building a chain of thunks; use `foldl'` or a strict accumulator when evaluation order permits
- Retaining the head of a lazy list, `ByteString`, `Text`, or streaming structure while consuming its tail, accidentally keeping the entire input alive
- Calling `length`, `last`, strict conversion, or full sorting on a potentially infinite or intentionally streaming value
- Repeated lazy-to-strict conversion or forcing an entire request/file merely to inspect a prefix, defeating streaming and creating avoidable memory spikes
- Adding `seq`, bang patterns, or deep evaluation speculatively without evidence of a leak or latency problem; strictness changes can alter termination and exception timing

#### Errors, Exceptions, and Resource Safety
- `IO` resources opened without `bracket`, `withFile`, `withBinaryFile`, `finally`, or an equivalent managed abstraction, leaking handles when an exception or asynchronous cancellation arrives
- `catch` or `try` at `SomeException` that unintentionally swallows asynchronous exceptions such as cancellation; catch the expected exception type or rethrow async exceptions
- `throwIO`, `error`, or pattern-match failure used for an expected domain error that callers need to distinguish; return `Either`, `ExceptT`, `Maybe`, or a typed exception as appropriate
- Cleanup implemented as a normal action after the main operation rather than with an exception-safe combinator
- Exception handlers that discard the original cause or silently substitute a plausible value, hiding corruption, partial writes, or failed validation

#### Concurrency, Async Exceptions, and STM
- Threads started with `forkIO` when their exceptions, lifetime, or shutdown must be observed; prefer structured `async`/`withAsync` and ensure results are awaited or linked
- A `takeMVar` followed by work and `putMVar` that can be interrupted, leaving the `MVar` empty; use `modifyMVar`, masking, or another exception-safe combinator
- Blocking operations, unbounded retries, or long pure computations performed inside `atomically`, causing transactions to retry excessively or preventing useful progress
- `unsafeIOToSTM` used for externally visible, non-idempotent, or exception-prone effects that may run multiple times as a transaction retries
- Shared mutable state updated from multiple threads without an `MVar`, `TVar`, atomic primitive, or a design that establishes single ownership
- Lock ordering that can deadlock, or holding an `MVar`/lock while calling unknown user code or waiting on another thread

#### Types, Instances, and API Design
- Orphan typeclass instances that can conflict with instances from another package and make behavior depend on import/build composition; prefer a `newtype` owned by the defining module
- `fromIntegral`, `toEnum`, `fromEnum`, or narrowing conversions that can overflow, wrap, truncate, or accept an invalid range without a checked boundary
- Typeclass instances that violate class laws relied upon by callers, such as inconsistent `Eq`/`Ord`, unlawful `Semigroup`/`Monoid`, or `Hashable` inconsistent with `Eq`
- Public APIs that expose invalid states as unrelated booleans, tuples, or `String` values when an algebraic data type or newtype can encode the invariant
- Constraints substantially broader than the implementation needs, reducing reuse or hiding an unintended effect requirement

#### Collections and Performance
- Repeated left-associated list append (`xs ++ [x]`) or `++` in a loop, which makes construction quadratic; prepend and reverse, use a builder, or accumulate with an appropriate sequence
- Repeated `length`, indexing with `!!`, or linear membership checks inside a traversal when one pass, a fold, or a `Set`/`Map` would avoid quadratic work
- Converting repeatedly among `String`, strict/lazy `Text`, and strict/lazy `ByteString` in a hot or high-volume path
- Using `String` for large text or byte-processing workloads where `Text` or `ByteString` is already the surrounding API and materially avoids per-character allocation
- Forcing parallel work without bounding it, potentially retaining the entire input or creating more sparks/tasks than useful work

#### Unsafe Features, FFI, and Metaprogramming
- `unsafePerformIO` whose result depends on mutable state, invocation order, or arguments not reflected in the value, or that lacks `NOINLINE`/a documented referential-transparency invariant where required
- `unsafeCoerce`, raw address operations, or `GHC.Exts` primitives without a narrowly documented representation and lifetime invariant
- FFI calls that mishandle pointer lifetime, nullability, buffer length, alignment, ownership transfer, finalizers, callbacks, or C string encoding
- Template Haskell, quasiquotation, or generated source that incorporates untrusted data into executable code
- `unsafeInterleaveIO` or lazy I/O when effect ordering, handle lifetime, or exception behavior is relied upon for correctness

#### Security-Sensitive Code
- External input passed to `System.Process.shell`, an explicit shell command, SQL construction, or template/code evaluation without strict validation; prefer `proc` with an argument list and parameterized APIs
- Untrusted paths used without constraining traversal, symlink behavior, and the intended root directory
- Secrets, tokens, private keys, credentials, or personally identifiable information written to logs, exceptions, source, or serialized diagnostics
- Authentication, authorization, cryptographic, or random-token code that uses ad hoc algorithms, non-constant-time secret comparisons where relevant, or a non-cryptographic RNG
`````

#### 40. nim.md

`````markdown
> Favor precision over recall: report only issues that are likely to cause incorrect behavior, memory unsafety, security vulnerabilities, or material performance problems. Do not report formatting handled by `nimpretty`, and account for the project's Nim version, memory-management mode, and compile-time defines before raising compatibility findings.

#### Memory and Lifetime Safety
- References, pointers, slices, or `openArray` views that outlive the storage they refer to, especially addresses derived from stack locals, temporary sequences, or strings
- `cast`, `addr`, `unsafeAddr`, manual allocation, or pointer arithmetic without a locally established type, alignment, bounds, ownership, and lifetime invariant
- Mismatched allocation and deallocation APIs, double destruction, or missing cleanup for manually managed resources
- Reference cycles that retain resources indefinitely under ARC or another memory-management mode without cycle collection; do not report this for ORC, which includes a cycle collector
- Do not report ordinary managed references or value copies without evidence of a lifetime or ownership defect

#### Bounds, Values, and Control Flow
- Array, sequence, or string indexing where a reachable index can be negative or exceed `low`/`high`, including incorrect inclusive range boundaries
- Integer conversions, `ord`, enum casts, or arithmetic that can overflow, truncate, or produce an invalid enum value under the project's overflow-check settings
- Variant objects whose discriminant is changed or read inconsistently with the active branch
- `case` statements, object construction, or result paths that leave a reachable value unhandled or unintentionally return the default value
- Assertions used to validate untrusted or runtime input when assertion checks may be disabled in release builds

#### Errors and Resource Cleanup
- `except:` or overly broad exception handling that swallows defects, cancellation, or actionable context and then returns a plausible result
- Resources acquired without `defer`, `try/finally`, or an ownership abstraction when an exception or early return can leak them
- `raiseAssert`, `quit`, or unrecoverable defects used for ordinary invalid input in reusable library or server code
- Error-code or `Option`/`Result` values ignored at boundaries where failure changes correctness or leaves partial state behind

#### Templates, Macros, and Compile-Time Code
- Templates that evaluate an argument more than once when the argument may have side effects; bind the expression to a local `let` so it is evaluated once per template invocation
- Macros that construct identifiers or AST nodes without preserving hygiene, source information, or the expected symbol binding
- `static`, `compileTime`, or macro execution that reads mutable external state and makes builds non-reproducible without an explicit project requirement
- Untrusted text incorporated into generated Nim, shell commands, or compiler invocations without strict validation
- Do not report ordinary template or macro use when the generated behavior is clear and arguments are evaluated safely

#### Concurrency, Async, and Effects
- Shared mutable state accessed by threads without a lock, channel, atomic operation, or established single-owner design
- Locks held across blocking operations, callbacks, or `await`, creating deadlock or starvation risks
- Futures started without awaiting, returning, or otherwise observing failures when completion matters to correctness
- Blocking file, process, sleep, or network operations introduced into an async request path
- Thread procedures or callbacks that capture data whose lifetime ends before the thread or foreign caller finishes

#### FFI and Security Boundaries
- `importc`, `exportc`, `dynlib`, or callback declarations with incompatible calling conventions, types, struct layout, nullability, or ownership rules
- C strings or buffers consumed without validating null termination, length, encoding, and lifetime
- User-controlled data passed to `execShellCmd`, a shell invocation, SQL construction, path access, deserialization, or code evaluation without appropriate validation or parameterization
- Secrets, credentials, tokens, or private data embedded in source, command arguments, logs, exceptions, or generated artifacts
- Cryptographic keys or security tokens generated with non-cryptographic randomness or ad hoc cryptographic code
`````

#### 41. swift.md

`````markdown
#### Swift Review Principles
> Favor precision over recall: report only defects likely real in changed code and reachable execution paths. Prioritize crashes, data corruption, security issues, privacy issues, and concurrency bugs. Do not report style preferences.

Before reporting non-local behavior, use `file_read` and `code_search` to verify ownership, callers, synchronization, lifecycle, and input sources. Do not infer threading, retain cycles, or error contracts only from names or types. Do not duplicate compiler, SwiftLint, or Xcode analyzer findings unless the diff creates concrete correctness impact.

#### Optionals and Runtime Failures
- Force unwrap, force cast, or `try!` on runtime-derived values (user input, network responses, persistence, decoding, external state) where failure is reachable and not handled.
- Implicitly unwrapped optionals outside controlled framework lifecycle patterns where access can occur before initialization or after invalidation.
- Optional handling that converts required failure into silent incorrect behavior, missing data, or invalid state.

#### Memory Ownership and ARC
- Escaping closures stored by an object that strongly capture that same object, creating a retain cycle.
- `[unowned]` captures in escaping closures where object lifetime is not guaranteed until execution.
- Delegate, observer, callback, timer, or task relationships that create ownership cycles or continue work after owner destruction.
- Combine subscriptions capturing `self` strongly inside an owner of the cancellable when it prevents expected deallocation.
- Async streams, notifications, timers, or subscriptions started without lifecycle cleanup when they continue after dismissal/deallocation.

#### Error Handling
- Throwing operations or `Result` failures ignored, replaced with success values, or hidden when failure changes behavior or data correctness.
- `try?` removing required failure information where callers need failure distinction.
- Empty error handling blocks suppressing failures affecting integrity, security, or user-visible behavior.
- Error wrapping removing typed error information required by callers.
- `fatalError`/`preconditionFailure` used for recoverable runtime failures instead of typed propagation.

#### Swift Concurrency and Isolation
- Mutable state accessed across actor boundaries without isolation or synchronization where concurrent access is possible.
- Non-`Sendable` values crossing isolation boundaries where races or unsafe assumptions are possible.
- `@unchecked Sendable` or `nonisolated(unsafe)` introduced without a proven thread-safety invariant.
- Actor-isolated state accessed from callbacks, delegates, or closures without preserving isolation.
- Fire-and-forget tasks that outlive owners, cannot be cancelled, or continue side effects after lifecycle ends.
- Detached tasks used where inherited actor context, priority, cancellation, or isolation is required.
- Async work ignoring cancellation and continuing expensive computation or side effects.
- Continuation wrappers that can resume multiple times, never resume, or resume after ownership/lifecycle invalidation.
- Locks or synchronous waits used across `await` boundaries.
- Independent async operations introduced sequentially causing measurable user-visible latency regression.

#### SwiftUI State and Lifecycle
- View-owned reference state recreated across renders because ownership/lifetime is incorrect.
- Dynamic collections using unstable identity causing incorrect row reuse or state association.
- Side effects executed from `body` or computed properties causing repeated execution.
- Lifecycle async work continuing after disappearance when cancellation ownership is required.
- `.task(id:)` missing where replaced inputs can allow stale results to overwrite newer state.
- UI state mutated outside required main actor isolation when concurrent updates are possible.
- Lifecycle effects duplicated or misattributed across remount, presentation, or dismissal paths.
- User-visible strings added or changed without localization coverage.

#### Persistence and Data Integrity (SwiftData / Core Data)
- Persistence writes leaving stored state partially updated or inconsistent after failure.
- Schema or relationship changes without compatible migration handling for existing data.
- Relationship configuration changes causing orphaned objects, invalid references, or incorrect delete behavior.
- `@Query`/fetch predicates or sort descriptors matching incorrect data or causing avoidable expensive fetches.
- Cached or persisted values treated as authoritative when they can become stale and affect correctness.

#### Health and Privacy Data
- HealthKit access performed without required authorization handling or safe fallback behavior.
- Health or sensitive data written to logs, analytics, insecure storage, or plaintext persistence.
- Health claims introduced without required supporting source or compliance basis.
- Health queries, observer queries, or background delivery registrations missing lifecycle handling, causing missed updates or unnecessary resource use.

#### Purchases and Entitlements
- Purchase, restore, or entitlement state failing to handle pending, offline, or verification outcomes.
- Transaction listeners missing, incorrectly scoped, or failing to consume verified transactions.
- Paywall or entitlement UI using stale state instead of canonical entitlement state.
- Trial, restore, or purchase error paths granting or revoking entitlement incorrectly.

#### Combine and Reactive Streams
- Combine subscriptions causing ownership cycles or continuing after intended lifecycle.
- UI updates delivered without required scheduler guarantees (`receive(on:)`/equivalent), causing incorrect thread execution.
- Expensive upstream work executed on inappropriate schedulers where it blocks UI or causes latency.
- Streams without cancellation/backpressure handling where unbounded work or memory growth is possible.

#### Networking
- Authentication tokens, credentials, or sensitive data exposed through logs, storage, or requests.
- Signed/authenticated URLs with bypassed expiry, validation, or authorization checks.
- Retry logic causing request storms or missing backoff for transient failures.
- Cache handling serving stale or unauthorized responses.
- Disabled transport protections or weakened certificate validation where an existing security boundary depends on it.
- Client-controlled identity, authorization, or payment values trusted without server validation.

#### Web Views, Deep Links, and External Input
- WKWebView JavaScript bridges accepting unvalidated messages or exposing privileged actions.
- Navigation handlers allowing untrusted URLs or schemes without validation.
- Deep-link inputs changing authenticated state or sensitive actions without validation.

#### Performance and Resource Usage
- Expensive synchronous work on the main actor/thread blocking interaction.
- Repeated expensive work on frequently executed paths causing measurable regressions.
- Unbounded memory growth from collections, caches, tasks, streams, or retained objects.
- Inefficient algorithms on demonstrably large collections causing user-visible slowdown.

#### Security
- Secrets, credentials, tokens, private keys, or sensitive user data added to source, logs, fixtures, or insecure storage.
- User-controlled input passed into executable contexts, unsafe URLs, queries, or commands without validation.

#### Unsafe Interoperability
- Unsafe pointer, buffer, or memory APIs used without guaranteed lifetime or bounds.
- Objective-C/C bridging violating ownership, nullability, or lifetime assumptions.

#### Testing Correctness
- Tests relying on arbitrary sleeps or timing delays instead of async expectations or direct awaiting.
- Tests not exercising changed behavior paths where regressions are likely.
- Tests sharing mutable global state causing isolation failures.
- Async tests leaving tasks running after completion.
- Assertions that cannot fail for the regression they intend to detect.
- Tests depending on uncontrolled environment state (network, time, locale, global persistence) where isolation is required.
`````

#### 42. nushell.md

`````markdown
# Nushell Script Review Checklist

Comprehensive checklist for reviewing Nushell scripts. Check items in order of priority.

---

## 1. Security (Critical)

### Code injection

- [ ] No `nu -c $variable` with untrusted input
- [ ] No `source $variable` with runtime paths (must be `const`)
- [ ] No `run` of untrusted `.nu` script paths; `run` targets must be parse-time constants
- [ ] No `^sh -c`, `^bash -c`, or `^cmd.exe /C` with interpolated user input
- [ ] No `run-external` with user-controlled command names

### Path safety

- [ ] Existing user-provided paths validated with strict expansion + `path relative-to`; no string-prefix containment checks
- [ ] No raw `open $user_input` without path traversal guard
- [ ] `..` sequences in user paths detected and rejected
- [ ] Base directory enforcement for file operations

### Credential handling

- [ ] No hardcoded secrets in source code
- [ ] Credentials scoped with `with-env`, not set on `$env` directly
- [ ] Secrets read from files/stdin, not passed as command-line arguments
- [ ] No credentials logged via `print` or written to non-secure files

### Destructive operations

- [ ] `rm` operations validate target path (not `/`, not `$nu.home-dir`)
- [ ] Glob patterns from user input are validated (no unintended expansion)
- [ ] `--depth` limits on `glob` to prevent DoS on large trees

### Temp files

- [ ] Temp files created with built-in `mktemp`, not predictable paths
- [ ] Temp files cleaned up in `try/catch` or equivalent
- [ ] Temp directories use `mktemp --directory`

### Environment safety

- [ ] `$env.PATH` not modifiable by untrusted input
- [ ] Dangerous env vars (`LD_PRELOAD`, `DYLD_INSERT_LIBRARIES`) cleared before running untrusted commands
- [ ] `with-env` used for scoped environment changes in security-sensitive contexts

---

## 2. Correctness

### Type safety

- [ ] All exported commands have type annotations on parameters
- [ ] I/O pipeline signatures (`]: type -> type {`) match actual behavior
- [ ] Complex types use proper syntax: `record<name: string>`, `list<int>`, `table<col: type>`
- [ ] Optional parameters use `?` suffix: `name?: string`
- [ ] Optional params and typed named options without defaults are handled as `oneof<T, nothing>`; boolean switch flags remain `bool`
- [ ] Rest parameters typed: `...args: string`
- [ ] Runtime assignment annotations are valid under Nu 0.114's default `enforce-runtime-annotations`

### Error handling

- [ ] Fallible operations wrapped in `try/catch`
- [ ] External commands checked with `complete` when exit code matters
- [ ] Tests do not assert raw nested-Nu diagnostics without normalizing ANSI, PTY wrapping, and `|` gutters
- [ ] `catch` blocks include meaningful error context (not empty)
- [ ] `finally` used for cleanup side effects, not as the returned value
- [ ] `catch` blocks read `$err.details` for structured diagnostics, not removed `$err.json`
- [ ] Custom errors include `label` with `span` for good error messages
- [ ] No bare `error make {msg: '...'}` without span when metadata is available

### Null safety

- [ ] Optional record fields accessed with `?`: `$rec.field?`
- [ ] `default` used for fallback values: `$val | default 'N/A'`
- [ ] No bare field access on records from external/untrusted sources
- [ ] `$in` captured early with `let` when used multiple times

### Logic correctness

- [ ] `for` not used as final expression (returns null, use `each`)
- [ ] `mut` variables not captured in closures (will error)
- [ ] `source`/`use` paths are `const`, not `let`
- [ ] Long `if`/`else if` chains on one value prefer `match` unless `if` is clearer
- [ ] `if`/`match` expressions have `else`/`_` fallbacks when a non-null output is required
- [ ] `each` not used on single records (use `items` or `transpose`)
- [ ] `parse` gets `lines` first when line-by-line parsing of stream input is intended
- [ ] Correct operator: `>` in non-pipeline context is comparison, not redirect
- [ ] Multiline custom command calls with named flags are one-line or wrapped in parentheses
- [ ] SemVer logic uses `into semver` / `into semver-range` / `semver bump`, not string surgery

### External commands

- [ ] External commands prefixed with `^` when name conflicts with builtins
- [ ] `find` (Nushell builtin) vs `^find` (Unix) distinction maintained
- [ ] `sort` (Nushell builtin) vs `^sort` (Unix) distinction maintained
- [ ] Arguments to external commands separated (not concatenated strings)
- [ ] Format strings passed to external commands use double quotes for simple escapes, or `char tab` / `char nl` when interpolation is needed

---

## 3. Style & Idiom

### Naming

- [ ] Commands: `kebab-case` (`fetch-user`, not `fetchUser` or `fetch_user`)
- [ ] Variables/params: `snake_case` (`$user_id`, not `$userId`)
- [ ] Env vars: `SCREAMING_SNAKE_CASE` (`$env.APP_VERSION`)
- [ ] Flags: `kebab-case` (`--output-dir`, not `--output_dir`)
- [ ] Full words preferred (`$user_name`, not `$usr_nm`)

### String format priority

- [ ] Bare words in arrays: `[foo bar]` not `["foo" "bar"]`
- [ ] Single quotes for simple strings: `'hello'` not `"hello"`
- [ ] Single-quoted interpolation preferred: `$'val: ($x)'` not `$"val: ($x)"`
- [ ] Strings needing a **literal** `(` use `$"...\(..."`, never `$'...'` — in
      `$'...'` the paren always opens an expression and `\(` does not escape it
- [ ] Double quotes only when escape sequences needed: `"\n"`, `"\t"`
- [ ] Raw strings for regex: `r#'pattern'#`
- [ ] `str uppercase` / `str lowercase` used instead of deprecated `str upcase` / `str downcase`

### Pipeline & functional style

- [ ] Pipelines preferred over imperative loops
- [ ] `$items | get price | math sum` instead of `mut total; for ...`
- [ ] `ls | where size > 1mb` instead of manual filtering
- [ ] `enumerate` instead of manual index counters
- [ ] `reduce` instead of `mut` accumulator + `for`
- [ ] `match` preferred for multi-branch dispatch on a single value

### Formatting

- [ ] No space before `|params|` in closures: `{|x| ...}` not `{ |x| ...}`
- [ ] Spaces around pipe: `cmd | cmd` not `cmd|cmd`
- [ ] Commas omitted in lists: `[1 2 3]` not `[1, 2, 3]`
- [ ] One space after `:` in records: `{x: 1}` not `{x:1}`
- [ ] Multi-line format for expressions >80 chars

### Documentation

- [ ] Exported commands have `#` comment above `def`
- [ ] Parameter descriptions as inline `#` comments
- [ ] `@example` attributes for non-trivial commands
- [ ] `@category` for organization when applicable

### Modules

- [ ] Only necessary definitions are `export`-ed
- [ ] `export def main` used when command matches module name
- [ ] Submodules are re-exported explicitly when callers need the submodule namespace in Nu 0.114+
- [ ] Private helpers are not exported
- [ ] `export-env` for environment setup blocks

---

## 4. Performance

### Parallelism

- [ ] `par-each` used for I/O-bound work (file reads, HTTP requests)
- [ ] `par-each` used for CPU-bound work (data processing)
- [ ] `--threads` specified when controlling concurrency matters
- [ ] `each` used only when order matters or list is tiny

### Streaming & memory

- [ ] `each --flatten` for streaming nested results
- [ ] Large files not loaded entirely when streaming suffices
- [ ] `lines` + pipeline for line-by-line processing of large files
- [ ] `peek` used for stream metadata/sample inspection instead of collecting
- [ ] `first N` / `take while` to limit processing early

### Caching & computation

- [ ] Expensive results cached in `let` bindings, not recomputed
- [ ] `glob` with `--depth` to avoid scanning huge trees
- [ ] Built-in commands preferred over external for small data
- [ ] External tools (`^rg`, `^jq`) used for large-scale operations

---

## 5. Robustness

### Input validation

- [ ] Parameter types annotated (catches misuse at parse time)
- [ ] Range/value checks at function entry for critical params
- [ ] User-facing commands validate inputs before processing
- [ ] Consistent return types (don't mix null and value unexpectedly)

### File operations

- [ ] `path exists` checked before `open` when file may not exist
- [ ] `save --force` used intentionally (overwrites without warning)
- [ ] File encoding handled appropriately (`open --raw` for binary)
- [ ] `from xlsx` / `from ods` output handled as a record of sheet tables
- [ ] Spreadsheet imports use `--noheaders`, `--first-row`, or `--prefer-integers` instead of removed `--header-row`
- [ ] `mkdir -v` / `mv -v` / `rm -v` outputs treated as tables, not parsed text
- [ ] `rm` / `mkdir` partial-success behavior considered when multiple paths are passed

### Process management

- [ ] Long-running external processes have timeouts or cancellation
- [ ] Background jobs (`job spawn`) tracked and cleaned up
- [ ] Exit codes checked for critical external commands

---

## Review Workflow

1. **Skim the entire script** — Understand purpose, entry points, data flow
2. **Security pass** — Check Section 1 items systematically
3. **Correctness pass** — Verify types, error handling, null safety
4. **Style pass** — Naming, strings, formatting, documentation
5. **Performance pass** — Parallelism, streaming, caching opportunities
6. **Robustness pass** — Input validation, file safety, process management
7. **Summarize findings** — Group by severity, highlight security issues first
`````

#### 43. elm.md

`````markdown
> Favor precision over recall: only raise an issue when you are confident it is a real defect, and stay silent when the surrounding context is unclear — a false alarm costs more reviewer trust than a missed minor issue. Treat security and correctness findings as blocking, and style or idiom suggestions as non-blocking. Review only what is observable in the code under review; do not infer behavior of ports, flags, or modules defined outside this file.

#### Obvious Typos or Spelling Errors
- Spelling errors in module names, type names, function names, or field names at their declaration sites; do not report spelling errors at call sites
- Typos in `Debug.log` labels, error messages surfaced to users, or docstrings that affect readability

#### The Elm Architecture (Model / Update / View)
- `update` branches that return the incoming `Model` unchanged (a no-op case) when the message implies a state change, silently dropping user actions
- `Cmd` values produced by `update` but not returned (e.g. constructed and discarded), so a command that should fire never runs
- `Msg` constructors added to the type but never matched in `update`, or matched with a catch-all `_ ->` that masks a forgotten case
- View functions that read fields directly instead of routing through `update`, bypassing the single source of truth and desyncing displayed state from `Model`
- Subscriptions declared but not wired into `Sub.batch`, or a `Sub.none` left in place after conditional subscriptions were intended

#### Maybe and Result Instead of Exceptions
- `Maybe.withDefault` or pattern matches that silently substitute a default for `Nothing` in a path where the absence should surface as user-visible feedback or an error state
- Chains of `case ... of` on `Maybe`/`Result` that do not handle every constructor, relying on the compiler's exhaustiveness only because a wildcard `_ ->` was added, hiding a missed case
- Using `Debug.todo` or a partial function (e.g. indexing with an assumption that a `List` is non-empty) as a stand-in for proper `Maybe`/`Result` handling
- `Result.map`/`Result.andThen` chains that lose the original `Err` value or replace it with a generic message, discarding information needed to diagnose the failure

#### Ports and JavaScript Interop
- Port modules that send or receive JSON without a matching decoder/encoder on both the Elm and JavaScript sides, risking a runtime decode failure with no Elm-side type safety
- Outgoing ports (`port toJs : Value -> Cmd msg`) called with data whose shape does not match what the JavaScript listener expects, since the compiler cannot check the JS side
- Incoming ports (`port fromJs : (Value -> msg) -> Sub msg`) whose payload is passed directly to application logic without running a `Json.Decode` decoder first, trusting unvalidated external data
- Ports left subscribed after the component that needed them has been removed, leaking a listener that never resolves

#### Decoder and Encoder Correctness
- `Json.Decode` decoders using `Json.Decode.field` chains that do not match the actual JSON shape from the API, especially optional fields decoded without `Json.Decode.maybe` or a default
- Decoders combined with `Json.Decode.andThen` that construct a value which does not satisfy the type's invariants (e.g. an empty string accepted where a non-empty identifier is required)
- Encoders (`Json.Encode`) that omit fields the consuming API requires, or that encode a `Maybe` as `null` when the API expects the field to be absent entirely (or vice versa)
- Decoder/encoder pairs that have drifted out of sync with each other or with the `Model` type they represent, so a round trip silently loses or corrupts data

#### Debug and Production Hygiene
- `Debug.log` or `Debug.toString` left in code paths that ship to production; `elm make --optimize` fails to compile with `Debug.log`/`Debug.todo` present, so leftover calls block optimized builds
- `Debug.todo` used as a placeholder for unimplemented branches that are reachable in normal application flow rather than genuinely unreachable states
- Comparing custom types or records with `==` where the comparison actually needs `Debug.toString` or a dedicated field-by-field comparison, given Elm's structural equality semantics

#### Package Versioning and Dependencies
- Changes to exposed module APIs (function signatures, exposed types, exposed constructors) without a matching version bump in `elm.json` under Elm's enforced semantic versioning
- Dependency version ranges in `elm.json` widened or narrowed without verifying the actual compatibility, since `elm.json` constraints are enforced strictly by the compiler and package tooling
- New dependencies added to `elm.json` that are unused in the module, or used dependencies missing from `elm.json`

#### Performance and Correctness Anti-Patterns
- Recursive `view` or `update` helpers that rebuild large `List`s or record structures on every call where a `Dict` or memoized value would avoid repeated work
- Large `List.length`, `List.reverse`, or repeated `List.append` (`++`) usage in hot paths where the O(n) or O(n²) cost is avoidable with a different data structure or accumulator pattern
- Untrusted input passed to `String.toInt`/`String.toFloat` without handling the `Maybe` result, or used to build a `Json.Decode` failure message shown verbatim to the user
`````

#### 44. jsonnet.md

`````markdown
> Favor precision over recall: only raise an issue when you are confident it is a real defect, and stay silent when the surrounding context is unclear — a false alarm costs more reviewer trust than a missed minor issue. Review only what is observable in the Jsonnet under review; do not infer the contents of libraries imported from outside the diff, the values supplied for external variables or top-level arguments, or how the rendered output is consumed downstream. Do not flag formatting that `jsonnetfmt` would silently fix.

#### Late Binding: self, $, and super
- `$` used where the enclosing object was meant. `$` is pinned to the outermost object of the *file it is written in*, so a library field that reaches for `$._config` resolves against the library's own root, not the caller's tree, the moment the object is merged into someone else's configuration
- A field reading `self.x` from inside a nested object where `self` has already rebound to that nested object rather than the one holding `x`. The established fix is capturing the intended scope once at the top of the object — `local this = self,` / `local defaults = self,` — and referring to `this.x`; flag a nested `self` reference where such a capture already exists in the same object and was clearly meant to be used
- `super.f` referenced in an object that is not the right operand of a `+` in any reachable composition, which is a runtime error rather than a silent default
- A `local` shadowing a field name that later code refers to unqualified, so a change to the field no longer affects the reference

#### Object Composition and Overrides
- `+` between two objects merges only the top level: a field present in both is taken wholesale from the right operand, and its nested contents are replaced rather than merged. Flag a nested field written with `:` where the surrounding overrides use `+:` and the intent is clearly to add to the inherited value, not to discard it
- `f+: v` evaluates to `super.f + v`, so the operator's meaning follows the type: objects merge one level, arrays concatenate, strings concatenate as text. An override that means "replace this list" written as `+:` silently appends instead, producing duplicate containers, volumes, or arguments
- `f+:` where `f` does not exist in the inherited object — a renamed or misspelled field — silently defines a new field instead of overriding anything, and nothing reads it
- An override applied to an object that is not on the right-hand side of the composition it was written for, so the later operand wins and the override is dropped from the output

#### Hidden Fields and Rendered Output
- A `::` field the rendered manifest is expected to contain. Hidden fields are absent from the output with no error, so the omission surfaces only where the artifact is applied
- A `:` field holding an internal helper, a partially built template, a raw function argument, or a credential, which leaks verbatim into the rendered YAML/JSON
- `:::` used to force visibility on a field that the library deliberately hid, without a stated reason
- The required-argument idiom `x:: error 'must provide x'`: the error only fires when something reads `x`, so an override that misspells the field name leaves the default in place and the failure appears far from its cause, or not at all if nothing reads it
- Null versus omission when the target is a Kubernetes manifest: an explicit `field: null` is a delete/reset in a strategic-merge patch, while an omitted field inherits the server default. `std.prune` and an explicit `null` are different requests, not stylistic variants — flag one substituted for the other

#### Imports and External Inputs
- `import` used on a file that is not Jsonnet, where `importstr` (raw text) or `importbin` (raw bytes) was meant, and the reverse: `importstr` on a Jsonnet file, yielding source text rather than a value
- Imports resolve at compile time against the `-J`/jpath search path, so a file added earlier in that path shadows the intended one and changes the output with no diagnostic. Flag an import whose relative path reaches into a vendored tree directly rather than through the library's documented entry point
- `std.extVar('name')` or a top-level argument read without a documented default or any validation — output then depends on state that is invisible in the file
- External variable values arrive as strings; flag one compared to a number, used in arithmetic, or treated as an object without `std.parseInt`/`std.parseJson`/`std.parseYaml`
- `std.extVar` inside a computed field name (`[if std.extVar('x') then 'k']`), where an unset or falsy value changes which keys exist in the output at all

#### Termination and Manifestation
- A recursive function or self-referential object with no argument that provably shrinks toward its base case. Evaluation is lazy, so an infinite structure is built without complaint and only exhausts the stack when a consumer forces it
- `std.manifestYamlDoc` quotes keys by default; `quote_keys=false` is what produces unquoted YAML keys. Flag its output being fed to a consumer that requires plain keys, and flag the result — a string — being re-parsed or indexed as if it were structured data
- A manifested string interpolated into a CLI flag, a ConfigMap entry, or an annotation where indentation, a multi-document `---` separator, or a non-string scalar changes how the receiver parses it
- `std.toString` or `std.manifestJson` used as the input to a hash, a checksum annotation, or an equality check, where field ordering or the representation of numbers is not guaranteed to be stable across evaluator versions
- `assert` used to validate an input at a point that is never forced, so the check silently never runs
`````

#### 45. zig.md

`````markdown
> Favor precision over recall: report only issues that are likely to cause incorrect behavior, memory unsafety, security vulnerabilities, or material performance problems. Do not report formatting handled by `zig fmt`, and account for the project's Zig version, build mode (`Debug`, `ReleaseSafe`, `ReleaseFast`, `ReleaseSmall`), and active `comptime` configuration before raising compatibility findings.

#### Memory Safety and Illegal Behavior
- Slices, pointers, or `[]const u8` views that outlive the storage they refer to, especially addresses derived from stack locals, temporaries, or a buffer that is reused or freed
- Detectable illegal behavior — out-of-bounds indexing, integer overflow, `@intCast`/`@truncate` narrowing that loses value, null-unwrap of an optional, or invalid `@ptrCast`/`@alignCast` — reachable in `ReleaseFast` or `ReleaseSmall`, where safety checks are disabled and the same code becomes silent undefined behavior
- Reads of `undefined` memory, or use of a value before it is fully initialized
- `@ptrCast`, `@alignCast`, `@bitCast`, or pointer arithmetic without a locally established type, alignment, provenance, and lifetime invariant
- Do not report ordinary value copies or bounds-checked access in `Debug`/`ReleaseSafe` without evidence of a real lifetime or aliasing defect

#### Allocators and Resource Cleanup
- Memory obtained from an `Allocator` without a matching `free`/`destroy`, or freed with a different allocator than the one that allocated it
- Resources acquired without a corresponding `defer` or `errdefer`, so an early `return` or error path leaks them or leaves partial state
- `errdefer` missing on a value that is cleaned up only on the success path, causing a leak when a later step in the same function fails
- Double-free or use-after-free from a `deinit` that runs on an already-released or aliased object
- Ignoring the result of an allocation or a fallible call at a boundary where failure changes correctness

#### Errors, Optionals, and Control Flow
- Error unions discarded with `catch unreachable`, `catch undefined`, or `_ =` where the error is actually reachable at runtime
- `orelse unreachable` or `.?` on an optional that can legitimately be null for untrusted or runtime input
- `unreachable` or `@panic` used for ordinary invalid input in reusable library or server code, especially where it becomes illegal behavior in release-unsafe modes
- `switch` on an error set or tagged union that silently handles unrelated cases with `else` and hides a newly added variant
- Assertions (`std.debug.assert`) used to validate untrusted input, since they are compiled out in release-unsafe builds

#### Comptime, Generics, and Build Code
- `comptime` code or `@This()`-based generics that read mutable external state and make builds non-reproducible without an explicit requirement
- Type-parameter functions that assume capabilities (fields, methods, layout) a caller's type may not provide, producing confusing compile errors instead of a checked constraint
- `build.zig` steps that fetch, execute, or trust untrusted input, or that hardcode absolute paths and platform assumptions
- Do not report ordinary `comptime` use when the generated behavior is clear and inputs are validated

#### Concurrency and C Interop
- Shared mutable state accessed from multiple threads without a `std.Thread.Mutex`, atomic, or established single-owner design
- Locks held across blocking operations or callbacks, creating deadlock or starvation risk
- `extern`/`export` declarations or `callconv` annotations with incompatible types, struct layout, nullability, or ownership relative to the C side
- C strings or buffers consumed without validating length, null termination, encoding, and lifetime
- User-controlled data passed to process spawning, path access, SQL construction, or deserialization without validation, and secrets embedded in source, logs, or error messages
`````

#### 46. thrift.md

`````markdown
> Favor precision over recall: only raise an issue when you are confident it is a real defect, and stay silent when the surrounding context is unclear — a false alarm costs more reviewer trust than a missed minor issue. Treat wire-compatibility breaks as blocking, and naming or layout preferences as non-blocking.

#### Field IDs and Wire Compatibility
- Reusing the id of a deleted field; Thrift has no `reserved` keyword, so a retired id must be held open by a placeholder field carrying a "do not reuse this id" comment
- Renumbering an existing field, or inserting a new field by shifting the ids of everything after it, instead of appending the next unused id
- Changing the declared type of an existing id, including `i32` to `i64` and swapping an enum for the integer that backs it; the type byte travels in the field header
- Deleting a field that peers still send without leaving its id held open for the same reason
- Do not report purely additive fields that take a fresh unused id, comment-only edits, or `namespace` and `include` changes

#### Requiredness and Defaults
- Adding a `required` field to an existing struct: `required` is permanent and unskippable, so every existing peer fails to deserialize in both directions the moment one side adopts it
- Flipping an existing field between `required` and `optional`, which changes what a peer is allowed to omit
- Changing the default value of an existing optional field; an unset field and a field holding the default are indistinguishable to the peer, so the change lands silently
- Fields left with default requiredness where absence must be distinguishable from the zero value
- Do not report the choice of default requiredness itself when the file is internally consistent

#### Services and Methods
- Renaming a service method: method names travel on the wire in `TMessageBegin`, unlike field names, so a rename breaks every existing caller
- Changing the ids of an existing method's parameters, or adding a parameter declared `required`
- Adding an exception to an existing `throws` clause that older clients have no branch to decode
- Changing a method to or from `oneway`, which changes whether the caller waits for a reply at all
- Do not report new methods appended to an existing service; those are backward compatible

#### Enums and Constants
- Enum members declared without explicit numeric values, which makes every value positional and shifts them all on the first insertion
- Inserting a new enum member into the middle of an existing numeric range instead of appending
- Code that treats an unknown enum value as unreachable; peers on a newer schema will send values this build has never seen
- Do not report enum members appended with new explicit values

#### Security and Resource Limits
- Unbounded `list`, `set`, `map`, `string`, or `binary` fields carried over an untrusted transport with no application-level size limit
- Recursive struct definitions with no documented depth bound on untrusted input
- Secrets, tokens, or credentials embedded in constants, default values, or comments
- `string` used to carry non-UTF-8 bytes where `binary` is meant, at a boundary that validates neither
- Do not report when limits are enforced by transport or server configuration and that boundary is clearly documented
`````

#### 47. capnp.md

`````markdown
> Favor precision over recall: only raise an issue when you are confident it is a real defect, and stay silent when the surrounding context is unclear — a false alarm costs more reviewer trust than a missed minor issue. Treat wire-compatibility breaks as blocking, and naming or layout preferences as non-blocking.

#### Ordinals and Wire Compatibility
- Changing the `@N` ordinal of an existing field or method; the ordinal is that member's fixed slot, so it is the one thing that must never move
- Filling an ordinal left behind by a removed member instead of holding it with an `obsolete`/`obsoleteN` placeholder of the original width (`obsoleteSave @7 :AnyPointer`, `obsolete3 @3 :Bool`)
- Deleting a member outright rather than renaming it to `obsolete*` and leaving its ordinal and type in place
- Adding a member at an ordinal already used elsewhere in the same struct, union, or interface
- Do not report a rename that leaves the ordinal alone; names are not on the wire, so renaming is free
- Do not report declaration order that disagrees with ordinal order, which is legal and common (`rpc.capnp` declares `disembargo @13` above `obsoleteSave @7`)

#### Types and Defaults
- Widening a fixed-width field, such as `UInt32` to `UInt64` or `Float32` to `Float64`: slots are fixed-width at fixed offsets, so this is a break, unlike widening a protobuf varint
- Any other change to an existing field's type, including a signedness flip or swapping an enum for the integer that backs it
- Changing the default value of an existing field; Cap'n Proto encodes values XOR the default, so the same bytes decode differently on either side of the change
- `Text` used to carry arbitrary bytes where `Data` is meant, since `Text` asserts NUL-terminated UTF-8 and readers may validate it
- Do not report a field appended at the next unused ordinal, which is backward compatible

#### Unions, Groups, and Type IDs
- Moving an existing field into or out of a union or group, with one legal exception: wrapping an existing field in a brand-new union where it is the first member
- A union whose lowest ordinal is not a `Void` sentinel, leaving no representable "unset" state
- Adding a member to an existing union without confirming readers handle an unknown discriminant; older code sees a value outside the enum it was compiled against
- Renaming a struct, interface, or file with no explicit `@0x...` id pinned: the id is derived from the name, so the rename silently changes it and breaks anything holding the old one
- Do not report an explicit `@0x...` id carried through a rename; that is the fix, not the defect

#### Interfaces and Methods
- Renumbering an existing method, or reusing the ordinal of one that was removed
- Changing an existing method's parameter or result struct in any way the field rules above forbid
- Removing a method rather than renaming it to `obsolete*` and keeping the ordinal (`sandstorm` keeps `obsoleteHttpGet @1` and `obsoleteGetGrainSize @3`)
- Capabilities returned with no documented lifetime, where dropping the client silently cancels work still in progress
- Do not report a method rename that keeps its ordinal

#### Security and Resource Limits
- `AnyPointer` accepted from untrusted input and cast without a type check
- Unbounded `List`, `Text`, or `Data` from untrusted input with no traversal limit or nesting limit set on the reader
- Secrets, tokens, or credentials embedded in constants, defaults, or comments
- Do not report when reader limits are set at the call site and that boundary is clearly documented
`````

#### 48. ocaml.md

`````markdown
> Favor precision over recall: only raise an issue when you are confident it is a real defect, and stay silent when the surrounding context is unclear — a false alarm costs more reviewer trust than a missed minor issue. Treat security and correctness findings as blocking, and style or idiom suggestions as non-blocking. This rule covers both OCaml (`.ml`/`.mli`) and ReasonML (`.re`/`.rei`), which are two surface syntaxes over the same semantics and compiler; apply every finding below to whichever syntax the file uses, and only flag JSX/BuckleScript-specific items in `.re`/`.rei` files.

#### Pattern Matching and Warning Discipline
- `match` expressions (or ReasonML `switch`) missing a case for a reachable constructor, especially after a variant type gains a new constructor; do not report matches that are provably exhaustive
- Wildcard `_` patterns added to silence a non-exhaustive-match warning instead of handling the missing case, which hides future constructor additions
- Catch-all `| _ -> ...` branches placed before more specific patterns, silently shadowing them
- Project or file missing `-warn-error +8` (or the dune equivalent enabling exhaustiveness as an error) where the surrounding code otherwise relies on the compiler catching non-exhaustive matches
- `[@warning "-8"]` or similar warning-suppression attributes applied broadly instead of to the single justified line

#### Mutable State and Aliasing
- `ref` cells or mutable record fields shared between closures, callbacks, or list/array iterations in a way that lets one hold stale or unexpectedly-updated state
- Mutable arrays (`Array.t`) passed to a function that both reads and mutates them where the caller still holds and relies on the original values
- Physical equality (`==`) or `Stdlib.compare`/structural `=` used interchangeably with mutable values without considering that mutation changes structural equality results after the fact
- Loops using `for`/`while` with an external mutable accumulator where a fold or recursive helper would make the state explicit and avoid an unintended shared mutation
- `Array.make`/`Bytes.make` reused across iterations by copying a reference to the same underlying buffer instead of a fresh allocation

#### Exceptions, Result, and Option Handling
- Functions that raise an exception for an expected, recoverable failure (e.g. `Not_found`, `Failure`, a custom exception) in code paths that should instead return `option` or `result` to make the failure visible in the type
- `Option.get`/`Option.value_exn`-style unwraps (or ReasonML `switch` fallthrough to `None -> assert false`) on a value that is not provably `Some` at that point
- `try ... with _ -> ...` (or bare `with exn -> ...` that doesn't re-raise) swallowing an exception without logging or converting it to a typed error, hiding the real failure from the caller
- Mixing `raise`-based and `result`-based error handling for the same operation across a module, forcing callers to guess which convention applies
- `Result.get_ok`/`Result.get_error`-style unwraps used where the `Error` case is reachable at runtime

#### Module System and Functors
- Functor applications (`module M = F(Arg)`) where `Arg` does not actually satisfy the invariants the functor's module type implies (e.g. an ordering module whose `compare` is not a total order), which can silently corrupt functor-built data structures
- Module types (`.mli` signatures) that leak an internal representation type instead of keeping it abstract, defeating the invariants the module is meant to enforce
- Re-exporting a submodule's mutable state through multiple module aliases in a way that creates hidden shared state between call sites that appear independent
- Shadowing a standard library module (e.g. `module List = ...`) without preserving the functions callers expect, causing silently different behavior at unrelated call sites
- First-class modules (`(module M : S)`) packed and unpacked in a hot path without considering the allocation and dynamic-dispatch cost versus a functor

#### Unsafe Interop and Escape Hatches
- `Obj.magic`, `Obj.repr`/`Obj.obj`, or other `Obj` module usage without a comment establishing the exact runtime representation invariant being relied on; this bypasses the type system entirely and any drift in representation is undefined behavior
- `Marshal` used to serialize closures or values across incompatible compiler versions/architectures, which is unsound and can crash or corrupt data
- C stub bindings (`external ... = "..."`) missing GC-safety annotations (`noalloc`, correct use of `caml_enter_blocking_section`) when they call into blocking or allocating C code
- Unsafe array/string access (`Array.unsafe_get`/`unsafe_set`, `Bytes.unsafe_*`) used without a preceding, visible bounds check that the compiler cannot otherwise verify

#### Dune Build Correctness
- `(libraries ...)` stanzas missing a dependency that the module actually references, relying on transitive re-exports that can break under a stricter dune profile
- Public/private library boundaries (`(public_name ...)` vs internal libraries) that expose internal modules unintentionally through a `.mli`-less module
- `(preprocess (pps ...))` (e.g. ppx_deriving, ppx_let) applied inconsistently across a project such that generated code silently differs between modules that should share a derivation
- Test executables or `(rule ...)` stanzas that shell out to unvalidated external input as part of the build, or that depend on files not declared in `(deps ...)`, making builds non-reproducible

#### ReasonML JSX and JS Interop
- `[@bs.deriving]`/`@genType`/`@react.component` (BuckleScript/ReScript-style) bindings whose declared JS type does not match the actual JS value's shape, especially for `null`/`undefined` versus OCaml `option`
- Untrusted JS input consumed via `Js.Json.t` decoded with an unsafe cast instead of a validating decoder, letting malformed JSON pass through the type boundary
- Promises (`Js.Promise.t`) whose rejection path is never handled, silently swallowing async JS errors
- JSX children or props built by string concatenation of untrusted values that get rendered into the DOM without escaping, when working with a raw `dangerouslySetInnerHTML`-equivalent binding
`````

#### 49. verilog.md

`````markdown
#### Verilog and SystemVerilog Review Principles
> Favor precision over recall: report only defects likely to change synthesized hardware behavior, cause simulation/synthesis mismatch, or introduce timing hazards in the changed RTL. Account for whether the file is synthesizable design code or a simulation-only model before raising findings, and do not report style that a linter or formatter already handles. This rule covers Verilog (`.v`), Verilog headers (`.vh`), and SystemVerilog (`.sv`). The `.v` extension is also used by Coq and by the V language; if the file is not Verilog or SystemVerilog, report nothing HDL-specific and fall back to general review principles.

#### Blocking and Non-Blocking Assignments
- Non-blocking assignments (`<=`) used for combinational logic, or blocking assignments (`=`) used for sequential logic inside a clocked `always`/`always_ff` block, where the mixed style changes simulated ordering or infers unintended hardware
- Mixed blocking and non-blocking assignments to the same variable when later statements observe a value different from the intended value because non-blocking updates are deferred
- Do not claim that statement ordering within one procedural block is inherently nondeterministic
- A register or variable intended to have a single procedural driver being written by multiple processes, particularly violations of `always_ff`, `always_comb`, or `always_latch` single-writer rules
- Do not flag intentional multiple drivers on an appropriate net type unless an actual conflict is demonstrated
- Misuse of `always_ff`, `always_comb`, or `always_latch` that violates their event-control, assignment, or single-writer semantics
- Do not report a correctly formed `always @(*)` solely as a style issue

#### Inferred Latches
- A combinational `always`/`always_comb` block where a signal is not assigned on every path (missing `else`, an incomplete `case`, or a `case` without `default`), inferring an unintended transparent latch
- Missing default assignments at the top of a combinational block, so a newly added branch silently reintroduces a latch
- Outputs left unassigned for some input combinations of a decoder, mux, or FSM next-state logic

#### Signal Width and Signedness
- Assignments or comparisons between operands of different bit widths that truncate or zero-extend silently, dropping significant bits or changing a comparison result
- Arithmetic that overflows the declared width of the result, or an intermediate expression narrowed before it is widened
- Mixed signed/unsigned operands where Verilog's context-determined signedness makes a comparison or shift behave unexpectedly; be explicit with `$signed`/`$unsigned`
- Part-selects, concatenations, or replication counts whose width does not match the target, and reliance on implicit `reg`/`wire` width from an undeclared net

#### Clock and Reset Handling
- Reset that is not correctly synchronous or asynchronous as intended, a reset polarity mismatch, or a reset released asynchronously without a synchronizing deassertion (reset-recovery hazard)
- Sequential logic missing the reset in the sensitivity list for an asynchronous reset, or a value that must survive reset being placed on the reset branch
- Gated, derived, or combinationally generated clocks used where a clock enable is intended, and multiple clocks driving the same register
- Registers with no reset where the design assumes a known power-on state

#### Clock-Domain Crossings and Races
- A signal sampled in one clock domain that is driven from another without a synchronizer (two-flop for single-bit control, handshake or asynchronous FIFO for buses), risking metastability
- Multi-bit buses synchronized bit-by-bit, so bits arrive skewed and produce transient invalid values; use gray coding or a handshake
- Combinational feedback loops, or read-during-write races on inferred memory without a defined collision policy

#### Simulation vs. Synthesis and Unsafe Constructs
- Simulation-oriented constructs such as `#delay`, `fork`/`join`, `force`/`release`, or an `initial` block whose behavior is required by the design but is unsupported by the declared target synthesis flow. Do not flag initialization solely by syntax when the target FPGA or synthesis tool documents support for it
- Incomplete or overlapping sensitivity lists in a bare `always @(...)` that make simulation differ from the synthesized combinational function; prefer `@(*)` or `always_comb`
- `casex`/`casez` whose don't-care matching hides priority bugs, or a `case` relying on `x`/`z` matching; prefer `case` with `unique`/`priority` where the intent is exclusive or prioritized
- `$display`/`$finish`/assertions guarding real behavior, and non-synthesizable system tasks left in the design path
- Full-case/parallel-case pragmas that assert properties the logic does not actually guarantee
`````

#### 50. vhdl.md

`````markdown
#### VHDL Review Principles
> Favor precision over recall: report only defects likely to change synthesized hardware behavior, cause simulation/synthesis mismatch, or introduce timing hazards in the changed RTL. Account for whether the file is synthesizable design code or a simulation-only model before raising findings, and do not report style that a linter or formatter already handles.

#### numeric_std and Type Usage
- Arithmetic implemented with non-standard vendor packages such as `std_logic_arith` or `std_logic_unsigned` instead of `numeric_std`, where package-specific overloads make behavior nonportable or ambiguous
- Incorrect explicit conversions between `integer`, `signed`, `unsigned`, and `std_logic_vector`, including incorrect target widths supplied to `to_unsigned`, `to_signed`, or `resize`
- Arithmetic or comparisons whose selected overload or result width does not preserve the intended value
- Width or overload mistakes as distinct from direct incompatible `signed`/`unsigned` mixing, which normally requires an explicit conversion and may be rejected by analysis
- Metavalue-dependent arithmetic or control flow involving `'U'`, `'X'`, or `'Z'` that synthesized hardware cannot reproduce

#### Ranges, Indexing, and Resize
- Vector indexed or sliced outside its declared range, or with the wrong direction (`to` vs. `downto`), causing a runtime error in simulation and wrong bits in hardware
- A `resize` to a smaller width that discards significant information; for `SIGNED`, account for the defined behavior of retaining the original sign bit together with the rightmost part, and for `UNSIGNED`, dropping the leftmost bits
- Off-by-one range arithmetic in `(N-1 downto 0)` declarations and loop bounds, and `others => '0'` aggregates applied to a target of unexpected width

#### Inferred Latches and Process Sensitivity
- A combinational process whose sensitivity list omits signals it reads, so simulation and synthesis disagree; prefer `process(all)` (VHDL-2008) where available
- A combinational process that does not assign every output on every path (missing `else`, incomplete `case`/`when`, no default assignment), inferring an unintended latch
- A branch within a legal, complete `case` statement that fails to assign an output also assigned by the other branches, causing that output to retain its previous value and infer a latch. Do not require `when others` when every value of the selector subtype is explicitly covered; an incomplete VHDL `case` statement is a compile-time error

#### Clock and Reset Handling
- Clocked logic that tests only the clock level (for example, `if clk = '1'`) instead of an edge, or places data-path assignments outside the intended edge condition. Accept both `rising_edge(clk)`/`falling_edge(clk)` and the conventional `clk'event and clk = '1'`/`clk'event and clk = '0'` forms when their semantics are intentional
- Reset that is not synchronous or asynchronous as intended, a reset polarity mismatch, or an asynchronous reset released without synchronized deassertion (recovery/removal hazard)
- Signals that must retain state across reset placed on the reset branch, or registers with no defined reset where a known startup state is assumed
- Gated or derived clocks where a clock enable is intended, and more than one clock driving the same register

#### Clock-Domain Crossings and Resolved Signals
- A signal generated in one clock domain and sampled in another without a synchronizer (two-flop for single-bit, handshake or asynchronous FIFO for buses), risking metastability
- Multi-bit buses crossing domains without gray coding or a handshake, so bits arrive skewed
- Multiple drivers on a resolved signal (`std_logic`) relied on for wired logic, where the resolution function hides an unintended multi-driver conflict; unintended shared drivers on what should be a point-to-point signal

#### Simulation vs. Synthesis and Unsafe Constructs
- Simulation-oriented constructs such as `wait for`, `after` delays, file operations, or reporting side effects whose behavior is required by the design but is unsupported by the declared target synthesis flow. Do not flag initial signal values or assertions solely by syntax when the target tool documents support or safely ignores verification-only statements
- Variables (`:=`) inside a clocked process used where their immediate-update semantics differ from signal (`<=`) semantics and change the inferred register or its ordering
- Reads of a signal in the same process cycle expecting the updated value, ignoring VHDL's postponed signal update (delta-cycle) semantics
- Nonsynthesizable constructs (`access` types, files, unbounded loops, dynamic memory) left in the design path, and metavalue-dependent branches that behave differently in gate-level simulation
`````

#### 51. matlab.md

`````markdown
> Favor precision over recall: only raise an issue when you are confident it is a real defect, and stay silent when the surrounding context is unclear — a false alarm costs more reviewer trust than a missed minor issue. Treat correctness, data-integrity, and unsafe-dynamic-code findings as blocking; treat naming, comment, and idiom suggestions as non-blocking. Review only the lines changed in this diff. MATLAB resolves most names at run time — do not infer the behavior of functions, classes, or validators defined outside the file under review.

#### Obvious Typos or Spelling Errors

- Spelling errors in function names, local function names, variable names, struct field names, or `arguments` block parameter names at their declaration sites; do not report spelling errors at reference sites, as these are determined by the declaration
- Typos in `error`/`warning`/`assert` message text, error identifiers, `fprintf`/`disp` log output, or the function description header that affect readability

#### File and Function Structure

- In a new file, or when this diff renames the leading function: a leading function name that does not match the file name
- Functions longer than roughly 200 lines that could be decomposed into local functions; report as non-blocking unless the length actively obscures a defect
- Nested functions used where a local function would do; nested functions share the parent workspace and should be reserved for cases that genuinely require shared access
- A helper called from exactly one parent function and placed in its own file instead of as a local function below the parent
- In a function added or substantially rewritten by this diff: missing `%%` section markers, or section markers without a description of what the section does, once the function is long enough to need structure
- Do not report file length alone, and do not report structure findings on files that were only touched incidentally

#### Argument Validation and Input Contracts

- In a new function, when the surrounding file already validates inputs and outputs via `arguments (Input)`/`arguments (Output)` blocks elsewhere: a function missing one of the two. Do not report this on an existing function being edited for an unrelated reason, or in a codebase that does not otherwise use this pattern
- An `arguments` block placed after executable code rather than immediately following the function description header
- Parameters declared with neither a size, a class, nor a validator function — an empty declaration validates nothing
- Missing size specification where the shape is known (`(:,1)`, `(1,1)`, `(:,:)`); missing class specification where the type is known (`double`, `logical`, `string`, `struct`)
- Class validation coerces rather than rejects when a conversion exists: a parameter declared `double` silently converts `logical`, integer, and `char` inputs (`'a'` becomes `97`). Where the caller must not be silently converted, add `mustBeA` or an equivalent validator
- Optional arguments handled via `nargin` branching, `exist("var","var")`, or `isempty` checks where a default value in the input `arguments` block would express the same contract declaratively
- A default value assigned in an `arguments (Output)` block; output blocks do not support defaults
- Do not report a missing validator when the size and class declarations already constrain the input adequately

#### Naming Conventions

- `i` or `j` used as a loop counter or any other variable; both are built-in functions for the imaginary unit, and shadowing them silently changes complex arithmetic elsewhere in the function
- Any built-in shadowed by a variable name — `length`, `size`, `sum`, `max`, `min`, `error`, `table`, `str`, `time`, `power`, `line` are the common offenders. Treat as blocking when the shadowed built-in is called later in the same scope
- Function or variable names not in `lowerCamelCase`; single-letter or cryptic names where a descriptive name is possible; abbreviations that are not established domain terms
- Logical variables not prefixed with `is`
- A variable reused within one function for a second purpose, or reassigned to a different class or array shape; this costs both readability and run time
- Do not report abbreviations that are standard in the domain and do not report established naming in surrounding untouched code

#### Comments and Documentation

- In a function added or substantially rewritten by this diff: a function without a description header, or a header that restates the function name without saying what the function does, what it returns, and what the caller must guarantee
- Input or output variables described neither in the header nor as a trailing comment in the `arguments` blocks
- Non-obvious logic — index arithmetic, sign conventions, unit conversions, matrix assembly — left uncommented
- A comment that contradicts the code beside it; this is a correctness signal, not a style one, since one of the two is wrong
- Lines longer than 120 characters, or long expressions not broken across lines with `...` at logical boundaries
- Do not request comments on self-explanatory single-purpose lines, and do not report comment density in the abstract

#### Dead Code and Diff Hygiene

- Code that can never execute: statements after `return`, `error`, `break`, or `continue`; branches whose condition is a constant; `if false` blocks
- Variables assigned but never read, outputs computed but never returned, and input parameters never used — unless the signature is fixed by a callback or interface contract
- Large commented-out blocks with no note explaining why they are being preserved
- Whitespace-only or reindentation-only changes to lines the author did not otherwise modify; these create avoidable merge conflicts
- Legacy code rewritten purely to conform to the styleguide, with no functional change in the same hunk
- `%#ok<...>` suppressions of Code Analyzer warnings without an adjacent comment explaining why the warning is being ignored

#### Indexing, Shapes, and Implicit Expansion

- `for k = v` where `v` is a vector variable: the loop iterates over the *columns* of `v`, so a column vector yields exactly one iteration with the whole vector bound to `k`. Use `for k = 1:numel(v)` or transpose explicitly
- Reduction functions called without an explicit dimension (`sum(A)`, `max(A)`, `any(A)`, `mean(A)`) where `A` may be a single row at run time; MATLAB switches to row-wise behavior for row vectors. Pass the dimension: `sum(A,1)`
- Binary operations on operands with mismatched dimensions that silently broadcast under implicit expansion instead of erroring — for example `A + b` where `b` was intended to be conformable but is a row vector
- `&` or `|` inside an `if` condition with array operands, where `&&`/`||` with a scalar condition was intended; `if` requires *all* elements true, so this fails silently on mixed arrays
- `==` used to compare arrays of possibly different sizes in a condition; use `isequal`
- Indexing, `max`/`min`, or `x(1)`/`x(end)` on a container that can legitimately be empty upstream
- Repeated `find` calls where logical indexing would express the same filter, especially where several filters are combined
- Do not report shape assumptions that an `arguments` block size specification has already guaranteed

#### Numeric Correctness

- Floating-point values compared with `==` or `~=`, particularly convergence checks and tolerance comparisons; use an explicit tolerance or `ismembertol`
- `NaN` handling assumed rather than checked: `NaN == NaN` is false, `sum` propagates `NaN` while `max`/`min` skip it by default, and `isnan` is the only reliable test
- Integer-class arithmetic treated as C-like: MATLAB integer division *rounds to nearest* (`int32(5)/int32(2)` is `3`) and overflow *saturates* at `intmax` rather than wrapping. Use `idivide` with an explicit rounding mode where truncation is intended
- `single` and `double` mixed in one expression; the result silently degrades to `single`
- `'` (complex-conjugate transpose) used where `.'` (plain transpose) was intended on complex data such as phasors, impedance matrices, or admittance matrices — a defect that is invisible on real-valued test data
- Matrix operators used where element-wise was intended, or the reverse: `*` vs `.*`, `/` vs `./`, `^` vs `.^`
- `inv(A)*b` instead of `A\b`; the explicit inverse is slower and less accurate. `inv()` applied to a sparse matrix additionally destroys sparsity and can exhaust memory on network-sized systems
- Division by a quantity that can legitimately be zero (an out-of-service branch, a zero base value, an empty aggregate) without a guard
- Do not flag numerical style where the surrounding code documents a deliberate choice

#### Error Handling, Assertions, and Logging

- A condition that will inevitably lead to a downstream failure left unchecked; assert explicitly at the point where the assumption is made
- `assert` called without an error identifier, or with an identifier that does not follow `function_name:ErrorCondition`
- `try` blocks with an empty `catch`, a `catch` that only rethrows without context, or a `catch` that omits `disp(getReport(ME))`
- `try` blocks wrapping substantially more code than the one call that can actually fail, obscuring where the error originates
- A `catch` that swallows an error and continues with a partially computed result, so the caller sees plausible but wrong output
- Log output that reports nothing actionable, or that omits the project's expected context (timestamp, function name); a long-running function that produces no summary output at all on completion
- Do not report missing logging in small pure helper functions

#### State, Scope, and Lifetime

- Any use of `global`; the only tolerable exception is a logical feature flag such as a debug level, and even then it should be questioned in review
- `persistent` variables without a documented reset path; a stale cache surviving into the next calculation is a silent-wrong-answer defect
- `clear all`, `clear classes`, `close all`, or `clc` inside a function
- `warning("off", ...)` set without restoring the previous state, leaving warnings suppressed for the rest of the session; capture and restore the state.
- `assignin`, `evalin`, or `inputname` reaching into a caller's workspace
- Runtime `cd`, `addpath`, or `rmpath`
- Runtime introspection in a hot path: `exist`, `which`, `whos`, `dbstack`

#### Data Types and Containers

- `char` used for text where `string` would work; `char` breaks on ragged concatenation (`['asdf';'asd']` errors) and lacks `+` concatenation
- `cell` arrays used for homogeneous or tabular data where a `table`, a numeric matrix, or a struct array fits; each cell carries roughly 120 bytes of overhead
- `cell2mat` where `vertcat(c{:,1})` or `horzcat` would do the same job far more cheaply
- `struct("field", someCell)` — a cell value argument creates a *struct array*, not a struct holding a cell
- Dynamic field names built from data (`s.(name)`) where a `table`, `dictionary`, or `containers.Map` would express the lookup, and where a malformed name would error at run time
- `unique`, `sort`, or `setdiff` applied where the original row order matters, without `"stable"`
- Do not report container choice in code that is demonstrably not on a hot path and is already clear

#### Performance and Preallocation

Confirm the code is on a hot path and that the data scale justifies the finding before flagging:

- Arrays grown inside a loop (`x(end+1) = ...`, `x = [x; new]`, `s(end+1).f = ...`) where the final size is known or boundable; preallocate instead
- Preallocation that no longer matches the final size after subsequent edits — an oversized preallocation leaves trailing zeros that silently enter the result
- Loop-invariant work inside a loop: repeated `ismember` against the same set, repeated struct field lookups, repeated table indexing, repeated file access
- Small element-wise loops that vectorize cleanly
- A variable that changes class or shape mid-function instead of a new variable being introduced
- `parfor` used before the serial version has been profiled; `parfor` without a `numThreads` argument, which makes debugging inside called functions impossible
- Loop-carried dependencies, order-dependent output, or shared mutable state inside `parfor`; results that depend on iteration order are a correctness defect, not a performance note
- Random number generation inside `parfor` without an explicit reproducible stream, where results must be repeatable
- Do not raise micro-optimizations; clear code that is slower is explicitly preferred to fast code that is hard to follow

#### File and Data I/O

- `load` or `save` without an explicit variable list; an unrestricted `load` can silently overwrite existing workspace variables
- `load` called without capturing the output struct inside a function
- `exist("name","file")` or `exist("name","dir")` instead of `isfile` / `isfolder`
- `xlsread` or `xlswrite` in new code; use `readtable`/`writetable`, `readmatrix`/`writematrix`, or `readcell`/`writecell`
- `fopen` without a guaranteed `fclose` on every exit path, including the error path; prefer `onCleanup`
- Paths assembled by string concatenation with hard-coded separators instead of `fullfile`; hard-coded absolute paths or drive letters

#### Unsafe Dynamic Code

- `eval`, `evalc`, or `feval` on a string assembled from data, file contents, or user input; this is arbitrary code execution
- `str2num` on any externally sourced value — it evaluates its argument; use `str2double`
- `system`, `dos`, or `unix` invoked with a command string built from unvalidated input
- File paths taken from external data and used without validation, allowing traversal outside the intended directory
- Credentials, tokens, or connection strings hard-coded in source or written to the log

#### Compatibility and Code Analyzer

- Toolbox-dependent functions used in code that is expected to run without that toolbox license
- Remaining Code Analyzer warnings in the changed lines
- Do not report a compatibility concern without naming the introducing release — an unverified claim here is worse than silence
`````

#### 52. objc.md

`````markdown
> Favor precision over recall: report only defects demonstrable within the supplied review scope and relevant repository context. Do not infer retain cycles, nullability, thread use, or availability from names alone, and do not restate compiler or static-analyzer diagnostics unless the reviewed code creates a concrete runtime consequence.

#### ARC and Object Ownership

- A strong ownership edge completes a cycle that keeps an object graph alive after its intended lifecycle; verify both directions of the cycle rather than flagging every strong reference
- An object-valued `assign` or `unsafe_unretained` reference is dereferenced after the referenced object can deallocate, creating a dangling pointer; do not recommend `weak` unless the target and build mode support zeroing weak references
- A `weak` reference is the only reference to an object that must remain alive to complete required work, so the work can silently disappear before it runs
- In a file proven to use manual reference counting: a result owned through `alloc`, `new`, `copy`, `mutableCopy`, or `retain` is not released on every path, an autoreleased object is stored without retain/copy, or an owned object is over-released. Do not apply MRC rules to ARC-managed files
- A custom accessor or instance-variable assignment violates the declared `strong`, `weak`, `copy`, or MRC `retain` ownership contract; property attributes do not enforce semantics inside a hand-written setter
- `dealloc` leaves owned non-Objective-C resources, observation registrations, timers, or callbacks active after the object dies. Under ARC, do not request `[super dealloc]` or manual releases of Objective-C objects

#### Blocks, Callbacks, and Timers

- An escaping block stored by an object strongly captures that same object, directly or through another captured owner, completing a retain cycle
- `__block` is used as though it made an Objective-C object non-retaining under ARC; ARC retains object-valued `__block` captures unless they are explicitly weak
- A weak reference is converted to a strong reference outside the escaping block, so the block still captures and retains the object it was intended not to own
- Several reads of a weak capture must refer to the same live object for the operation to be valid, but the block does not first promote the capture to a strong local and use that local for all dependent reads
- An escaping block is stored by raw assignment in MRC, or by a custom setter that fails to honor a `copy` contract, allowing a stack block to outlive its scope
- An `NSTimer`, `CADisplayLink`, block-based observer, operation, or subscription retains its target/block while its owner retains the registration object, and no invalidation or ownership break occurs on every lifecycle exit
- An asynchronous completion applies stale state or updates an owner after that operation has been cancelled, replaced, or made irrelevant by lifecycle teardown
- Do not report a strong capture when the captured object does not own the block or other context proves there is no cycle

#### Properties and Encapsulation

- A delegate, data source, child-to-parent link, or callback owner is strong when the surrounding ownership graph proves that the other side already owns it
- An immutable value property such as `NSString`, `NSArray`, or `NSDictionary` is retained instead of copied when callers can pass a mutable subclass and later mutation would violate the property's snapshot contract
- A custom setter releases the old MRC value before safely retaining/copying an aliased new value, or invokes callbacks/KVO while the property is in a partially updated state
- Code treats an `atomic` property as protection for a compound invariant, a mutable pointee, or a read-modify-write sequence; atomic accessors do not make the owning object thread-safe
- Direct instance-variable mutation bypasses a custom setter whose validation, cache invalidation, observation, or ownership side effect is required for correctness
- A readonly API returns its internal mutable collection directly, allowing callers to mutate state that the class assumes it controls
- Do not report `nonatomic` by itself; require evidence that the property is accessed concurrently without other synchronization

#### Initialization and Object Construction

- An initializer uses the original receiver after `[super init...]` instead of assigning and checking the object returned by the superclass initializer
- A designated initializer skips the superclass's designated initializer, or a convenience initializer bypasses the class's designated initializer, leaving required inherited or local state unset
- A construction path, including an initializer, `initWithCoder:`, or factory method, returns an object without establishing invariants that other construction paths establish
- An initializer invokes an overridable method before the instance is fully initialized, and an existing or permitted subclass override can observe or act on partial state
- Initialization failure returns a partially usable object instead of `nil`, or a factory method silently substitutes a fallback that violates its documented failure contract
- A subclass inherits an initializer that cannot establish the subclass's mandatory state and does not override or mark that initializer unavailable
- Do not require an `init` override when the superclass initializer already establishes every invariant and the subclass adds no construction requirement

#### Nil, NSNull, and Object Semantics

- Messaging `nil` silently yields `nil`, zero, or `NO` in a path where that value is interpreted as successful or valid, masking a missing required object
- An `NSNumber *` is tested as a Boolean pointer, so `@NO` is treated as true; use `boolValue` when the contained value controls the branch
- `NSNull` from JSON, collections, or KVO is treated as `nil` or sent a domain-object selector, causing incorrect branching or an unrecognized-selector exception
- `==` or `!=` is used where semantic equality of strings, numbers, dates, or collections is required; do not flag identity comparisons that are intentional
- `NSNotFound` is narrowed, used in arithmetic, or passed into a range/index operation before it is checked
- A nullable result flows into a Foundation initializer, collection, attributed-string, or other API that requires a nonnull argument and raises an exception
- Do not report intentional nil messaging when the zero/nil result is explicitly the desired optional behavior

#### Foundation Collections, Strings, and Ranges

- A possibly nil object or key is inserted into an array, set, dictionary, or collection literal, causing an `NSInvalidArgumentException`
- A mutable collection is changed during fast enumeration, including mutation through an alias or callback invoked by the loop
- Code casts an immutable collection to a mutable type and mutates it instead of obtaining a mutable copy
- An index or `NSRange` can exceed the current collection/string bounds after filtering, asynchronous mutation, failed search, or unchecked external input
- `NSString.length` or raw `NSRange` offsets split a surrogate pair or composed character sequence in user-visible text where grapheme boundaries matter
- A C string returned by `UTF8String` is used after the temporary conversion buffer's lifetime, including after the surrounding autorelease pool drains; retaining the `NSString` alone is insufficient, so copy the bytes before the pointer escapes that context
- A pointer returned by `bytes` or another borrowed-buffer accessor is stored or used asynchronously after its owning object can deallocate or its mutable backing store can change
- A runtime-derived or user-controlled string is used directly as the format argument to `NSLog`, `stringWithFormat:`, or another variadic formatter rather than supplied as a value argument to a literal format such as `%@`
- A nonliteral format string and its arguments have incompatible types or widths, such as using fixed-width integer specifiers for `NSInteger`, `NSUInteger`, or `size_t`, causing undefined varargs reads

#### Protocols, Delegates, and Selectors

- An `@optional` protocol method is sent to a non-`nil` object without first verifying `respondsToSelector:`, making an unimplemented selector reachable
- A weak or concurrently replaceable delegate is read once for `respondsToSelector:` and again for invocation, allowing a different object to receive the unchecked selector; hold one strong local across the check and call
- A class claims protocol conformance while a required method is a stub, returns a placeholder, or violates a required behavior visible in the protocol or its callers
- A target-action, notification, timer, callback, or `performSelector:` use supplies a selector with the wrong arity or an incompatible parameter/return ABI
- A method declaration and implementation use incompatible parameter or return types for the same selector, and runtime dispatch can therefore pass or interpret values incorrectly
- A framework class, selector, constant, or enum case introduced after the verified minimum deployment target is reachable without an availability guard or supported fallback; name the exact platform version when reporting it
- `conformsToProtocol:` is used in place of `respondsToSelector:` before an optional method call; protocol conformance does not guarantee that optional methods are implemented
- Do not report optional protocol methods that are guarded by a wrapper or forwarding implementation verified in the repository

#### Categories and Runtime Modification

- A category on a class defined in this repository implements a selector that the original class, a superclass, or another category on the same class also implements, so which implementation runs is undefined; confirm the collision with `code_search` before reporting it
- A category on a framework class implements a selector that the framework itself already defines, which Apple documents as undefined behavior; `code_search` cannot see the SDK, so treat the override itself as the reportable signal and never read an empty search result as proof that no collision exists
- A category declares a property but provides neither accessors nor associated storage, making the property compile as a declaration but fail when messaged
- Associated-object storage uses a key already used for a different value, or an association policy that conflicts with the value's required ownership or thread behavior
- Method swizzling can execute more than once, so repeated exchanges toggle or corrupt the installed behavior; one-time installation must be explicit
- Swizzling an inherited method exchanges an implementation on the superclass rather than isolating the change to the intended subclass
- A `+load` hook waits for work that cannot run until image loading completes, acquires a lock that initialization can re-enter, or depends on category/class load order
- A cast of `IMP` or `objc_msgSend` does not exactly match the method's calling convention, parameter types, and return type
- Do not report categories or swizzling merely because they are used; identify the concrete selector collision, global side effect, or ABI/lifecycle failure

#### Core Foundation and C Interoperability

- A Core Foundation result returned under the Create Rule, for example by a function whose name contains `Create` or `Copy`, is neither released nor transferred on every exit path
- A non-owned Core Foundation result returned under the Get Rule is released or transferred as though owned, or is used after the owner that guarantees its lifetime can disappear
- `__bridge_retained`/`CFBridgingRetain` is not balanced by a release, or `__bridge_transfer`/`CFBridgingRelease` is followed by another release of the same ownership
- A plain `__bridge` pointer escapes beyond the Objective-C object's lifetime even though no ownership was transferred
- A C callback's function-pointer type has an incompatible signature or calling convention, so the caller and callback disagree about argument or return-value representation
- A callback context or another stored `void *` uses the wrong bridge/retain convention, leaving a dangling Objective-C object or leaking a retained context
- A C API receives a stack address, temporary buffer, or borrowed Foundation bytes that can outlive the backing storage during asynchronous use
- A buffer length, element count, or struct layout passed across the C boundary is computed in the wrong unit or with a narrowing conversion, allowing out-of-bounds access
- Do not request ownership changes without first applying the called API's documented Create Rule or Get Rule and its callback-context contract

#### Error Handling and Exceptions

- A caller reads an `NSError *` without first checking the method's primary `BOOL`, object, or sentinel return value, so a stale or unspecified error controls behavior
- An implementation writes through an `NSError **` without checking whether the caller passed `NULL`
- A failure return is ignored and the code continues with nil, partial, or stale output as though the operation succeeded
- A method reports success while also setting an error, reports failure without the error required by its contract, or invokes a completion with contradictory result/error values
- An `@catch` block swallows an exception and continues with potentially corrupted state, or catches programmer exceptions as though they were ordinary recoverable errors
- Recoverable I/O, validation, or service failures are converted into exceptions across an API that otherwise uses `NSError` or explicit result values
- Wrapping an error discards the domain/code or underlying error that existing callers use to choose recovery behavior
- Do not report an unused optional `NSError` detail when the primary failure is handled completely and no caller needs the additional distinction

#### Concurrency, Queues, and Main-Thread UI Access

- Mutable state or a mutable Foundation collection is read and written from concurrently reachable queues without a single proven synchronization strategy
- UIKit or AppKit state is read or mutated from a background queue where the framework requires main-thread access
- `dispatch_sync` targets the current serial queue, including synchronously dispatching to the main queue from the main thread, causing a deterministic deadlock
- The main thread waits on a semaphore, operation, or condition whose completion is scheduled onto the main queue
- `@synchronized(lock)` can receive `nil`, in which case the critical section is not synchronized at all, or the lock object can be replaced so callers protect the same state with different locks
- A lock is held while sending an externally implemented Objective-C message or callback that can synchronously re-enter and acquire the same non-recursive lock
- `dispatch_group_enter` lacks a matching `dispatch_group_leave` on a return, error, or cancellation path, so group completion never fires
- A Core Data managed object or context crosses its confinement queue instead of using the context's queue and object IDs
- A long-running background loop creates many autoreleased objects without a scoped `@autoreleasepool`, causing memory growth until the thread or outer pool drains
- Do not infer concurrency from an asynchronous-looking method name; verify queue creation, call sites, or framework callback guarantees

#### KVC, KVO, and Notifications

- A string key/key path does not name a KVC-compliant property, including a stale literal left by a rename or refactor, causing the runtime lookup to raise an exception or silently target the wrong member
- `setValue:nil forKey:` can reach a non-object property without a valid `setNilValueForKey:` policy
- Direct ivar mutation bypasses automatic KVO notifications for a property whose observers are verified to require the change
- A setter or KVC mutation triggers automatic KVO while the same change is also wrapped in manual `willChange...`/`didChange...` calls, causing duplicate observations, or the manual calls are unbalanced on an exit path
- A derived observable property changes when one of its inputs changes, but its dependent keys are not registered and existing observers therefore remain stale
- Observer registration and removal use mismatched objects, key paths, contexts, or lifetimes, leaving a callback to a dead observer or removing another registration
- `observeValueForKeyPath:...` consumes unknown contexts instead of forwarding them to `super`, breaking observations installed by a superclass
- KVO change dictionaries are assumed to contain domain objects even though old/new nil values are represented by `NSNull`
- A block-based notification observer token is discarded or retained by an owner captured by its block, preventing correct removal or completing a retain cycle
- A notification callback performs thread-confined work without accounting for the posting thread on which notification delivery occurs
- Do not demand manual observer removal when the verified API and deployment runtime provide token-scoped or automatic teardown

#### Archiving and External Dynamic Input

- Data from an untrusted or replaceable source is decoded with unrestricted `NSKeyedUnarchiver` APIs instead of secure coding with an explicit allowed-class set
- A class claims `NSSecureCoding` support but decodes an enclosed object with untyped `decodeObjectForKey:` rather than `decodeObjectOfClass:forKey:` or `decodeObjectOfClasses:forKey:`, so the expected class is not constrained before object construction
- `initWithCoder:` accepts decoded types, ranges, enum values, or object graphs that violate invariants enforced by normal initializers
- Selector or class names derived from external input are passed to `NSSelectorFromString`, `NSClassFromString`, `performSelector:`, or runtime invocation without an allowlist, exposing unintended code paths
- Deserialization failure is replaced with a partially populated object that callers cannot distinguish from valid persisted state
- Do not report unrestricted decoding for data whose integrity and provenance are both established within the same trust boundary

#### Objective-C Test Correctness

- `XCTAssertEqual`/`XCTAssertNotEqual` is used to test value equality of Objective-C objects, so the test compares identity instead of using `XCTAssertEqualObjects`/`XCTAssertNotEqualObjects`
- An asynchronous test can finish before its completion assertions run, or fulfills its expectation before the behavior under test has completed
- A retain-cycle or deallocation test accidentally keeps an additional strong local reference, making its lifetime assertion incapable of detecting the regression
- A test expects an Objective-C exception for an API that reports ordinary failure through `NSError`, a Boolean, nil, or a sentinel, so it does not exercise the real failure contract
`````

#### 53. solidity.md

`````markdown
#### Solidity Review Principles
> Favor precision over recall: report only issues likely to cause loss of funds, incorrect accounting, permanent lockup, or a security vulnerability on a reachable path. Read the `pragma` before raising any arithmetic finding — Solidity `>=0.8` reverts on overflow and underflow by default, so reporting unchecked wraparound outside an `unchecked` block is a false positive. The `.sol` extension is also used for Gerber PCB solder-mask layers; if the file is not Solidity source, report nothing.

Do not duplicate what `solc`, Slither, or solhint already flag unless the diff creates concrete correctness impact. Before reporting non-local behavior, verify the caller, the modifier chain, the inherited implementation, and the storage layout rather than inferring them from names.

#### Obvious Typos or Spelling Errors
- Misspellings in declaration sites that become part of the contract's surface: function, event, error, state variable, parameter, struct field, or `constant` names
- Do not report typos inside comments, NatSpec prose, or revert strings unless the string is matched on elsewhere

#### External Calls and Reentrancy
- State written after an external call rather than before it, where the callee can re-enter and observe stale state (Checks-Effects-Interactions)
- Cross-function reentrancy: the entry point carries `nonReentrant` but a sibling function sharing the same storage does not
- Cross-contract reentrancy where two contracts share accounting state and only one guards the path
- Read-only reentrancy: a `view` getter consulted by a third party while a callback is in flight returns a value derived from half-updated state
- ERC777/ERC1155/ERC721 transfer hooks and `receive`/`fallback` treated as inert; any token transfer to an arbitrary address is an external call
- A guard added to the wrapper while the `internal` function it delegates to is also reachable from an unguarded path

#### Unchecked Call Results
- Return value of `.call`, `.send`, or `.delegatecall` discarded, so a failed call proceeds as success
- A low-level call to an address with no deployed code returns `true`; missing an `extcodesize` or equivalent existence check before trusting it
- ERC20 `transfer`, `transferFrom`, or `approve` used directly on tokens that return nothing or return `false` instead of reverting, where `SafeERC20` is required
- Success flag captured into a variable that is never asserted on

#### Delegatecall and Proxy Upgradeability
- `delegatecall` to a target that a caller can influence, or to an address read from mutable storage without an allowlist
- Storage-slot collision between proxy and implementation, or between an old and a new implementation: variables reordered, inserted, or removed, and consumed `__gap` slots not reduced by the same count
- A variable that became `constant` or `immutable`, or stopped being one, across an upgrade — every subsequent slot shifts
- Implementation contract left initializable: `initializer` modifier missing, `_disableInitializers()` absent from the constructor, an inherited `__X_init` never called, or a `reinitializer` version reused
- `selfdestruct` or `delegatecall` reachable in an implementation, which can brick every proxy pointing at it
- Function-selector collision or shadowing between the proxy and the implementation, silently routing a call to the wrong body
- Upgrade authorization (`_authorizeUpgrade`, `onlyProxy`) missing or guarded by a role that is not the intended one

#### Access Control
- Privileged function missing its `onlyOwner`/`onlyRole` modifier, or carrying a modifier that does not gate the value it is meant to gate
- `tx.origin` used to authenticate a caller
- Unprotected initializer, setter, or minting entry point
- Single-step ownership transfer to an address that is never verified, where a two-step handshake is required
- Role admin left as the role itself, letting members grant the role to anyone
- A `public`/`external` visibility change on a function that was previously `internal`

#### Arithmetic and Conversions
- An `unchecked` block whose bound is not locally provable — a loop counter compared against `.length` is fine, a subtraction on caller-supplied input is not
- Downcast (`uint256` to a narrower type, or signed/unsigned conversion) that truncates or flips sign on a reachable value
- Division before multiplication, compounding precision loss in a fee, share, or interest calculation
- Token decimals assumed to be 18, or two tokens' decimals assumed equal
- Rounding that favors the caller over the protocol on both deposit and withdrawal paths

#### Storage and Initialization
- Uninitialized local `storage` pointer, which writes to slot 0
- A `memory` copy of a struct or array mutated where `storage` was intended, so the write is discarded
- `delete` applied to a struct or array containing a mapping, which leaves the mapping populated
- `immutable` or `constant` expected but the value is set in a function that can run more than once

#### Ether and Token Handling
- `transfer` or `send` relying on the 2300-gas stipend against a recipient that may be a contract
- Push payments in a loop where one reverting or gas-hungry recipient blocks every other recipient; a pull pattern is required
- Fee-on-transfer or rebasing tokens credited with the amount argument rather than the measured balance delta
- `msg.value` read inside a loop or a `payable` multicall, letting one deposit be counted many times
- Contract that can receive Ether with no withdrawal path, or a `receive`/`fallback` that reverts on a path the protocol depends on

#### Randomness, Time, and Oracles
- `block.timestamp`, `block.number`, `blockhash`, or `block.prevrandao` used as a randomness source for anything of value
- A spot pool reserve, `getReserves`, or a single-block TWAP read as a price, which is flash-loan manipulable
- Chainlink `latestRoundData` consumed without checking staleness (`updatedAt`), a positive answer, or round completeness
- Timestamp comparisons that assume a fixed block interval

#### Front-Running and MEV
- Swap, mint, or redeem without both a deadline and a minimum-output (or maximum-input) bound
- The ERC20 approve race, where a non-zero allowance is overwritten with another non-zero value
- A value derived from state an attacker can move within the same block or transaction bundle
- Commit-reveal or auction logic whose commitment can be front-run because it omits the sender or a salt

#### Gas and Denial of Service
- A loop over an array or mapping-backed list that any caller can grow without bound
- An external call, a `SLOAD`-heavy read, or a token transfer executed inside a loop
- Unbounded array growth in storage with no removal or pagination path

#### Events and Signatures
- A state change with no event emitted, or an event whose `indexed` fields do not identify the affected party
- `abi.encodePacked` over two or more dynamic arguments feeding a hash, allowing collisions; use `abi.encode`
- A signature accepted without a nonce, a chain id, or an EIP-712 domain separator, permitting replay across accounts, chains, or contracts
- `ecrecover` used without rejecting the zero address and without rejecting the malleable high-`s` form
- Signature verification that does not bind the signed payload to the caller or the specific action

#### Inline Assembly
- Assembly that writes past the free memory pointer, or fails to update it after allocating
- `mload`/`mstore`/`calldatacopy` with an offset or length derived from calldata without a bounds check
- A block annotated `memory-safe` that does not satisfy the memory-safety rules
- Storage slots computed by hand that overlap a compiler-assigned slot

#### Testing Correctness
- A fuzz test whose `vm.assume` or bound filters out exactly the domain the property is about
- A test asserting nothing about the behavior named in the test, or asserting only that a call did not revert
- A fork test pinned to no block number, making it non-reproducible
- Mocks that always return success, hiding the failure path the change introduced
`````

#### 54. vyper.md

`````markdown
#### Vyper Review Principles
> Favor precision over recall: report only issues likely to cause loss of funds, incorrect accounting, or a security vulnerability on a reachable path. Vyper syntax and semantics changed hard at 0.4 — 0.3.x writes `@nonreentrant("key")` and calls externals with plain method syntax, 0.4.x writes bare `@nonreentrant` and requires the `extcall`/`staticcall` keywords — so read the `# pragma version` before applying any version-specific rule. Do not import Solidity idioms: Vyper has no inheritance, no inline assembly, no recursion, no unbounded loops, and arithmetic is checked by default.

#### Obvious Typos or Spelling Errors
- Misspellings in declaration sites that become part of the contract's surface: function, event, struct field, interface method, storage variable, parameter, or `constant` names
- Do not report typos inside comments, docstrings, or `assert` messages unless the message is matched on elsewhere

#### Reentrancy and `@nonreentrant`
- A function that makes an external call before writing state and carries no `@nonreentrant` decorator
- A decorator removed to satisfy the compiler's "cannot call `X` since it is `@nonreentrant` and reachable from `Y`" error: that error means the lock is genuinely nested, and dropping the decorator removes real protection instead of fixing the call graph
- `@nonreentrant` counts as state access, so adding it to a function used from a `@view` context or a pure module changes what the module is allowed to do
- A pinned compiler in the 0.2.15–0.3.0 range, where the reentrancy lock was miscompiled; the version pin is itself the finding, not a style note
- `raw_call` or a token transfer to an arbitrary address treated as inert; any such call can re-enter

#### Language Restrictions
- `for i in range(N)` whose bound `N` is smaller than the collection being iterated: the loop silently truncates rather than reverting, so the tail is never processed
- `raw_call` used as a hand-rolled dispatch table to reconstruct inheritance, losing the compiler's type and mutability checks
- `create_from_blueprint` or `create_copy_of` factories where the blueprint address is mutable or unverified
- Logic that assumes recursion or a dynamically sized loop is available and works around its absence incorrectly

#### External Calls and `raw_call`
- `raw_call` with `max_outsize=0` where the callee's success or return data actually matters
- `revert_on_failure=False` whose returned success flag is dropped instead of asserted
- `delegate_call=True` to a target that is not a compile-time constant
- A state-mutating call made where `is_static_call=True` was intended, or vice versa
- Return data decoded to a fixed `Bytes[N]` smaller than what the callee can return

#### Access Control and Module Initialization
- Vyper has no modifiers, so the `assert msg.sender == self.owner` line is written per function and is easy to omit on one of several privileged entry points
- A `payable` `__default__` that accepts Ether the contract has no way to withdraw
- `@external` where `@internal` was meant, exposing an internal helper
- 0.4 `initializes:` / `exports:` re-exporting more of a module's surface than intended, or an `initializes:` module whose `__init__` is never called
- `__init__` logic reachable a second time through a factory deployment path

#### Arithmetic and Bounds
- Arithmetic is checked by default — do not report overflow as though this were Solidity's `unchecked`. The real findings are the explicit escapes: `unsafe_add`, `unsafe_sub`, `unsafe_mul`, `unsafe_div` used where the bound is not locally provable
- `DynArray[T, N]` appended to past `N`, or a length assumed rather than checked
- `slice`, `concat`, or `extract32` silently bounded by a `Bytes[N]` / `String[N]` capacity smaller than the real input
- A narrowing `convert()` that truncates or flips sign on a reachable value
- Division before multiplication in a fee, share, or interest calculation, and rounding that favors the caller on both deposit and withdrawal

#### Storage Layout and Deployment
- Vyper has no proxy standard, so an upgrade path implies a blueprint or copy deployment; state migration logic that assumes slot compatibility is wrong
- `--storage-layout-file` overrides that no longer match the declared variables after a reorder or removal
- Transient storage reused across calls where the value is expected to be cleared

#### Ether, Tokens, and Oracles
- `send()` relying on the 2300-gas stipend against a recipient that may be a contract; `raw_call` with an explicit gas budget is required
- `self.balance` used as accounting truth, which any forced transfer can move
- Non-bool-returning ERC20s called through an interface without `default_return_value=True`, or through `raw_call` with the result unchecked
- A spot pool reserve or single-block price read as an oracle
- `block.timestamp`, `block.number`, or `blockhash` used as a randomness source

#### Front-Running and MEV
- Swap, mint, or redeem without both a deadline and a minimum-output (or maximum-input) bound
- A value derived from state an attacker can move within the same block

#### Events
- A state change with no corresponding `log`, or an event whose `indexed` fields do not identify the affected party

#### Testing Correctness
- A `boa.env.prank` or `boa.reverts` block that asserts nothing about the behavior it names
- A fuzz test whose bounds exclude the boundary value the property is about
- A test asserting only that a call did not revert
`````

#### 55. rego.md

`````markdown
#### Rego Review Principles
> Favor precision over recall: only raise an issue when you are confident it is a real defect, and stay silent when the surrounding context is unclear — a false alarm costs more reviewer trust than a missed minor issue. Treat authorization-bypass and data-exposure findings as blocking, and style or idiom suggestions as non-blocking. Ground findings in the Rego under review and observable caller, schema, and configuration evidence. Do not assume the runtime shape or provenance of `input` or `data`, the OPA/Regal version, or enforcement behavior (fail-open vs fail-closed) when that context is unavailable.

#### Obvious Typos or Spelling Errors
- Spelling errors in package names, rule names, function names, or `import` aliases at their declaration sites; do not report spelling errors at reference sites
- Typos in `deny`/`violation` message strings that affect readability of the policy decision output

#### Default Posture and Overly Broad Allow
- A missing `default allow := false` (or equivalent deny default) in an authorization policy, so no rule matching means undefined rather than an explicit deny the caller handles consistently
- An `allow` rule with no body, `if true`, or constraints that can never fail, granting access unconditionally
- A `deny`/`violation` set that the caller never consults (e.g. `allow` decided independently of `deny`), so listed violations do not actually block anything
- New `allow` rules added without checking they are intersected with, not unioned past, the existing `deny` rules on the same decision path

#### Undefined, Negation, and Unification
- `not` used where undefined was meant, or vice versa: `not x` succeeds when `x` is undefined, so `input.user == x` with an absent field behaves differently from an explicit `false`
- Unification (`=`) used where comparison (`==`) was intended, silently binding a variable instead of testing it — especially inside `with` overrides or function arguments
- A rule body that is undefined (no value) on a reachable path where the caller expects `false` or an empty set, flipping the downstream default
- Negation over a non-ground term (`not some_unbound_var == value`) whose scope is wider than intended

#### Unsafe Variables and Iteration
- Unbound or unsafe variables the compiler would reject being "fixed" by binding them to attacker-influenced `input` instead of a trusted value
- `some x in input.collection` iterating a field that may be absent or a scalar rather than an array/set/object, making the rule undefined instead of denying
- An existential check such as `input.roles[i] == "admin"` used where observable policy requirements demand that every element satisfy a condition: Rego searches possible bindings for `i` and succeeds if any element matches; use `every` or an equivalent universal check only when that all-elements requirement is established

#### Input, Data, and Trust Boundaries
- Authorization-relevant `input` fields (roles, groups, `is_admin`, expiry) used as trusted facts when observable caller or policy code shows an attacker can supply them without validation; missing in-policy validation alone does not establish attacker control
- Authorization decisions based on `data` from a demonstrably untrusted bundle, upload, or refresh path; use available loading and deployment configuration to establish provenance, and do not flag an unknown source as unsafe merely because it is not pinned in the Rego file
- JWT or token claims used for authorization with evidence that required signature, expiry, issuer, or audience validation is missing or bypassed along the observed policy and caller path; validation may happen upstream, and its absence from this file alone is not a defect
- `with` overrides that demonstrably bypass a security constraint on the enforced decision path, such as replacing a validated identity with an attacker-controlled value; scoped overrides for policy composition or hypothetical queries are valid in production and are not findings by themselves

#### Non-Determinism and Functions
- Non-deterministic values or final decisions incorrectly reused across evaluations, with evidence that freshness or determinism requirements are violated; caching a compiled policy or using partial evaluation is not itself a defect, since calls such as `time.now_ns()` may remain in residual queries for runtime evaluation
- `http.send` settings that demonstrably disable required safeguards (e.g. `tls_insecure_skip_verify: true` or a zero timeout on a path that requires a bound), or an error path that changes the authorization decision incorrectly; omitted options retain OPA's defaults of a five-second timeout and TLS certificate verification
- Recommend HTTP response caching only for an established performance problem with an acceptable freshness contract; uncached requests are valid when decisions require fresh data
- A custom function that is undefined for some inputs (no return value on a reachable path) used as though it always returns a value
- `print()` calls that emit secrets or other sensitive values to an enabled output/log stream beyond the intended trust boundary; establish the emitted values and output handling before reporting data exposure
- `trace()` calls that put sensitive values in `Note` events when query tracing/explanations are collected and accessible beyond the intended trust boundary; `trace()` does not imply ordinary logging, and its presence alone is not a data-exposure finding

#### Version Drift and Structure
- Version-incompatible use of `in`, `every`, `if`, or `contains` when the target toolchain and syntax mode are known: supported pre-v1 toolchains can enable these through the relevant `future.keywords` imports or `import rego.v1`; under OPA v1 syntax all four are available without imports. Account for compatibility settings rather than inferring the version from imports alone
- `package` name shadowing an `import`ed path, so an unqualified rule reference resolves to a different package than the author meant
- `default` rules contradicting each other on the same name, or a `default` value of a different type than the rule body produces
- Duplicate rule names in the same package whose bodies union when the author meant override: multiple `allow if ...` definitions all contribute, none replaces another

#### Testing Correctness
- A `test_` rule that asserts nothing about the behavior it names (no `allow`/`deny`/`violation` check against concrete `input`/`data`)
- Tests using `with` to supply an `input` shape that production never sends, or covering only the allow path with no deny-path counterpart
- A test asserting only that evaluation did not error, without checking the decision value
`````

#### 56. shader.md

`````markdown
> Favor precision over recall: only raise an issue when you are confident it is a real defect on the target shading language and pipeline stage; stay silent when the surrounding pipeline setup (bindings, render pass, vertex layout) is defined outside this file and cannot be verified. Treat correctness and security findings as blocking, and style or naming suggestions as non-blocking.

#### Obvious Typos or Spelling Errors
- Spelling errors in uniform/binding names, semantic names (HLSL `SV_*`), varying/interpolant names, or shader entry-point names at their declaration sites
- Typos in preprocessor macros or `#include` paths that would fail to compile or silently pull in the wrong header

#### Precision, Range, and Numeric Correctness
- Low/`half`/`mediump` precision qualifiers used for values that need full range or precision (depth, world-space position, accumulation buffers), risking banding or z-fighting
- Division, `rsqrt`, `normalize`, `log`, or `pow` calls on values that can be zero or negative without a guard, producing `NaN`/`Inf` that propagates through the pipeline
- Implicit or explicit type conversions between `float`/`half`/`int`/`uint` that truncate or wrap in a way that changes shading results, especially in loop counters and texture indices
- Non-uniform control flow around `pow`, `log`, or matrix operations that assumes IEEE-754 behavior not guaranteed across all target GPUs/drivers

#### Texture and Buffer Access Safety
- Texture, buffer, or resource array indices computed from vertex/instance/thread IDs or user data without a bounds check, particularly on `RWStructuredBuffer`/`RWBuffer`/`ssbo`/`storage` writes
- Implicit-derivative texture sampling (GLSL `texture`, HLSL `tex2D`/`Sample`, WGSL `textureSample`, or Metal `sample`) in non-uniform control flow where implicit derivatives are undefined; do not flag explicit-LOD sampling such as `textureLod` for this reason
- Mismatched texture format, channel count, or sRGB/linear color space assumptions between the shader and the resource binding declared on the host side
- Out-of-bounds writes to shared/groupshared/threadgroup memory in compute shaders, or missing barriers (`GroupMemoryBarrierWithGroupSync`, `barrier()`, `workgroupBarrier()`) before reading data another invocation wrote

#### Binding, Layout, and Cross-Stage Contracts
- Uniform/constant buffer, descriptor set, or binding-slot indices that do not match the layout the host application (or a companion shader stage) expects, since mismatches fail silently at runtime rather than at compile time
- Struct memory layout (`std140`/`std430` in GLSL, constant-buffer packing in HLSL, host-shareable type alignment and member offsets in WGSL) whose field alignment or padding does not match the CPU-side struct, causing misread values
- Vertex output / fragment input (varyings, `SV_Position`, `[[stage_in]]`) whose interpolation qualifiers (`flat`, `noperspective`, `centroid`) are inconsistent with how the value is used downstream
- Shader variants driven by preprocessor defines or pipeline permutations where a new code path is not covered by all defined permutations, leaving some variants uncompiled or behaviorally inconsistent

#### Concurrency and Compute Correctness (Compute/Kernel Shaders)
- Race conditions on shared/groupshared/threadgroup memory or storage buffers written by multiple invocations without atomics or synchronization
- Hardcoded indexing, tile-size, or shared-memory assumptions that disagree with the actual local workgroup size or dispatch coverage; distinguish threads per workgroup (`local_size_*`, `[numthreads]`, `@workgroup_size`, or Metal's host-supplied threads-per-threadgroup) from the number of workgroups dispatched
- Atomic operations used on types or backends that do not actually support atomics for that format, or atomics used where a simple reduction would be both correct and faster
- Divergent branches or early `return`/`discard` inside a compute kernel placed before a required barrier, causing a deadlock or undefined synchronization on affected lanes

#### Performance Anti-Patterns
- Expensive operations (dynamic branching, texture-dependent reads, transcendental functions) inside tight loops that could be hoisted, precomputed on the CPU, or baked into a lookup texture
- Dynamic (non-uniform) branching on GPUs where the target hardware executes both sides of a branch per-warp/wavefront, negating the intended savings
- Redundant texture fetches or matrix multiplications recomputed per-fragment/per-thread that are invariant across the invocation and could be computed once (e.g. in the vertex stage or as a uniform)
- Overly large local/register usage (long-lived temporaries, unrolled loops) that reduces occupancy without a documented profiling justification

#### Security-Sensitive and Portability Concerns
- Shader code paths that read attacker- or user-controlled buffer sizes/offsets (e.g. from a compute dispatch driven by untrusted input) without validating them before use as an index
- Vendor-specific intrinsics or extensions (`GL_ARB_*`, `SV_Barycentrics`, wave/subgroup intrinsics) used without a fallback or capability check, breaking portability across GPUs that lack the extension
- `discard`/`clip` used to implement alpha testing in a way that defeats early-Z/early-depth-test optimizations without a documented performance tradeoff
`````

#### 57. powershell.md

`````markdown
#### PowerShell Review Principles
> Favor precision over recall: report only defects that are likely to affect correctness, security, compatibility, or operational safety. Do not report formatting or naming preferences already covered by PSScriptAnalyzer. Account for the declared PowerShell version, target operating systems, privilege boundary, and whether the file is a script (`.ps1`), module (`.psm1`), or data/manifest file (`.psd1`).

Before reporting non-local behavior, use `file_read` and `code_search` to verify callers, parameter contracts, module exports, execution context, and input trust boundaries. Do not assume every use of aliases, `Write-Host`, the call operator (`&`), or a global variable is a defect without a concrete behavioral impact.

#### Command Construction and Injection
- Untrusted text passed to `Invoke-Expression`, `[scriptblock]::Create`, `powershell -Command`, `pwsh -Command`, `cmd /c`, `sh -c`, or another string-evaluation boundary where an attacker can introduce executable syntax.
- Commands assembled as one interpolated string where subsequent evaluation permits injection or quoting changes the intended arguments; do not report string construction alone.
- Remote content downloaded and executed without authenticity, integrity, or trust validation, including `Invoke-WebRequest ... | Invoke-Expression` patterns.
- User-controlled executable names, module names, script paths, or command paths invoked with `&`, dot-sourcing, `Start-Process`, or remoting without an allowlist or a constrained resolution boundary.
- User-controlled wildcard patterns, registry paths, certificate paths, or filesystem paths that can escape the intended scope, match additional targets, or trigger destructive operations.
- Quoting that expands variables or subexpressions earlier than intended, especially across native-command, remoting, or nested-shell boundaries.

#### Parameters, Types, and Input Validation
- Parameters accepting external input without the type, validation attributes, or explicit checks needed before privileged, destructive, or security-sensitive use.
- A parameter declared for pipeline input but processed outside `process`, causing only the final item or no items to be handled as intended.
- Confusing `$null`, an empty collection, and a scalar after PowerShell's automatic enumeration, producing incorrect branching or skipped work.
- Relying on truthiness where valid values such as `0`, `''`, or `$false` must be distinguished from missing input.
- Unsafe casts or enum conversions that can throw after partial side effects have already occurred.
- Returning or accepting loosely shaped `PSCustomObject` values where callers rely on properties that are absent on reachable paths.

#### Errors and Native Process Status
- Expecting `try`/`catch` to handle a non-terminating cmdlet error without `-ErrorAction Stop` or an equivalent scoped `$ErrorActionPreference` policy.
- Setting `$ErrorActionPreference` globally or suppressing errors with `SilentlyContinue`/`Ignore` in a way that hides a required failure or changes unrelated caller behavior.
- Empty or overly broad `catch` blocks that replace failure with plausible output, continue after partial state changes, or discard actionable error context.
- Assuming a native command failure throws a PowerShell exception; inspect the supported version, `$PSNativeCommandUseErrorActionPreference`, `$ErrorActionPreference`, and any native-command wrapper before requiring an explicit `$LASTEXITCODE` check. Interpret exit codes using the invoked command's contract, not a blanket nonzero-is-failure rule.
- Checking `$?` after another command has already overwritten it, or treating stderr output alone as proof that a native command failed.
- Cleanup, lock release, location restoration, session teardown, or temporary-state restoration skipped on a reachable failure or cancellation path; recognize `finally`, PowerShell 7.3+ `clean` blocks, and other disposal mechanisms appropriate to the supported version and lifetime.

#### Pipeline and Output Semantics
- Helper expressions or cmdlets emitting unintended objects into a function's success stream and corrupting the function's documented return value.
- Assuming `return` suppresses objects emitted earlier in the function or script block.
- Accidental collection unrolling that changes a nested collection or single collection object into separate pipeline records; preserve shape explicitly when callers depend on it.
- Using formatting cmdlets such as `Format-Table` before data leaves a reusable function or module, converting structured objects into formatting instructions instead of returning data.
- Mixing host, information, warning, error, and success streams in a way that breaks redirection, automation, or structured consumers.
- Materializing an unbounded pipeline where memory exhaustion is reachable for expected input sizes. For array append costs, verify the supported version and workload: PowerShell 7.5 optimized array addition, so `+=` alone is not evidence of quadratic runtime.

#### State Changes, Idempotence, and Cleanup
- State-changing advanced functions that claim or require `-WhatIf`/`-Confirm` behavior but omit or bypass `SupportsShouldProcess` and `$PSCmdlet.ShouldProcess()`.
- Retry or rerun behavior that duplicates resources, appends configuration repeatedly, or corrupts state instead of converging on the requested result.
- Multiple related mutations that can leave a partially applied configuration after an intermediate failure without rollback, compensation, or a clearly documented partial-state contract.
- Scripts changing process-wide location, environment variables, preference variables, default parameter values, or module state without restoring them when used as reusable components.
- Resources, jobs, runspaces, sessions, subscriptions, streams, or temporary files that remain active after success, failure, or cancellation.
- Destructive wildcard operations whose resolved targets are not checked before mutation.

#### Credentials, Transport, and Sensitive Data
- Passwords, tokens, connection strings, private keys, or credentials embedded in source, command arguments, logs, exceptions, transcripts, or module manifests.
- Exposing plaintext credentials beyond a necessary API boundary or retaining/logging their plaintext representation. Conversion to `SecureString` alone is not a defect and does not erase the original plaintext; do not assume its contents are encrypted on non-Windows platforms.
- Accepting separate username/password strings where `PSCredential`, managed identity, or an established secret provider is required by the surrounding code.
- Disabling certificate validation, using `-SkipCertificateCheck`, weakening TLS, or suppressing host verification across a real trust boundary.
- Trusting execution policy as an authentication or authorization control; execution policy is not a security boundary.
- Logging full request headers, environment variables, process arguments, or remote-session configuration that may contain secrets.

#### Remoting, Jobs, and Concurrency
- Assuming local variables are available remotely without `Using:`, parameters, or an explicit argument list, or expanding them in the wrong session because of quoting.
- Depending on methods, live handles, or private-key material lost during out-of-process job or remoting serialization; verify the actual type because some types are rehydrated rather than returned as deserialized property bags.
- Starting jobs, thread jobs, runspaces, or remote commands without observing completion and failures when the result affects correctness.
- Shared mutable state accessed from thread jobs, parallel pipelines, event handlers, or runspaces without synchronization or an ownership invariant.
- Event subscriptions or background jobs surviving beyond their owner and continuing unexpected side effects.
- Remoting endpoints, authentication mechanisms, or credential delegation that broaden access beyond the intended hosts or users.

#### Modules, Scopes, and Manifests
- Module code leaking mutable variables, aliases, functions, drives, or preference changes into global scope unintentionally.
- Public commands missing from `FunctionsToExport`, or private helpers exported through wildcards when the manifest is expected to define a stable API.
- `RootModule`, `NestedModules`, `RequiredModules`, compatible editions, or PowerShell version constraints that do not match the module's actual dependencies and syntax.
- Module initialization performing irreversible side effects on import without an explicit module contract.
- Dot-sourcing or importing a path derived from untrusted input, the current directory, or an ambiguous module search path.
- Evaluating untrusted `.psd1` content as code instead of importing data safely, or adding values the actual loader rejects. Distinguish `Import-PowerShellDataFile` from module-manifest restricted language; supported manifest variables and expressions are not arbitrary code execution.

#### Version and Platform Compatibility
- Windows PowerShell 5.1-only and PowerShell 7-only syntax, cmdlets, parameters, or .NET APIs used without matching the project's declared support range.
- Windows-only providers, registry access, drive letters, path separators, environment-variable casing, or executable names used on code paths intended for macOS or Linux.
- Native-command quoting or argument-passing assumptions that differ across Windows PowerShell, modern PowerShell, and target operating systems; inspect PowerShell 7.3+ `$PSNativeCommandArgumentPassing` modes and legacy-command exceptions.
- Text encoding assumptions that corrupt non-ASCII input or output across Windows PowerShell and PowerShell 7 defaults.
- Platform checks performed after an incompatible command or type has already been resolved or invoked.

#### Test Correctness
- Pester mocks targeting a command name or module scope different from the one used by the code under test, allowing the real command to run or making the assertion meaningless.
- Assertions that cannot fail for the reported regression, or tests that exercise setup output instead of the function result.
- Tests sharing global variables, imported module state, environment changes, files, jobs, or sessions without isolation and cleanup.
- Destructive or privileged tests reaching real resources without an effective safety boundary. `TestDrive` isolates only file operations directed into it; mocks must intercept the actual call, and `-WhatIf` only protects operations that honor `ShouldProcess`.
- Tests depending on uncontrolled network, credentials, locale, installed modules, execution policy, or host state without declaring and isolating that dependency.

#### Official References
- [Command evaluation](https://learn.microsoft.com/en-us/powershell/scripting/learn/deep-dives/avoid-using-invoke-expression), [native-command preferences](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_preference_variables), and [execution policy](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies).
- [Advanced function lifecycle](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_functions_advanced_methods), [return/output semantics](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_return), and [array addition](https://learn.microsoft.com/en-us/powershell/scripting/dev-cross-plat/performance/script-authoring-considerations#array-addition).
- [ShouldProcess](https://learn.microsoft.com/en-us/powershell/scripting/learn/deep-dives/everything-about-shouldprocess), [SecureString](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/convertto-securestring), and [remoting serialization](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_remote_variables).
- [Module manifests](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_module_manifests), [safe data import](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/import-powershelldatafile), and [character encoding](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding).
- [Pester mocking](https://pester.dev/docs/usage/mocking) and [TestDrive isolation](https://pester.dev/docs/usage/testdrive); use the documentation matching the project's Pester version.
`````
