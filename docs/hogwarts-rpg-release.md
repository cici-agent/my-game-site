# 霍格沃茨第一学年 RPG 发布说明

正式入口是 `https://www.cici2.fun/stone.html`。宇宙首页的魔法星球进入这一页；原来的 `magic-academy.html` 入学序章与校园探索仍保留，页头增加了“组队冒险”链接。游乐园、萌宠小屋、其他星球与角色工作室继续使用原来的入口。

## 代码、静态站与运行服务

- GitHub 仓库：`cici-agent/my-game-site`，生产分支 `main`。
- Vercel 项目：`ilvcici4ever-9949s-projects/my-game-site`，正式域名 `cici2.fun` / `www.cici2.fun`。
- `hogwarts-rpg/` 保留可构建的 RPG 源码，根目录的 `stone.html`、`stone-play.mjs`、四份 CSS 与静态图片是正式站产物。Vercel 沿用原站的静态托管方式。
- 存档、组队、任务进度、战斗与奖励结算继续由现有权威服务处理：`https://hogwarts-adventure-journal.mingyang83400.chatgpt.site`。该服务仍使用 Cloudflare Worker、D1 与 R2。

本次是正式站入口和前端发布接入，不是数据库迁移，也没有把现有存档改为 Vercel 本地文件或 Supabase 表。原宇宙的 Supabase 登录与 RPG 的恢复码身份仍是独立系统。

## 同源接口与资源转接

浏览器只请求当前正式域名下的路径。根目录 `vercel.json` 将以下明确路径转接至原运行服务，不重写首页或其他网站路径：

| 请求 | 处理方式 |
| --- | --- |
| `/api/stone/:path*` | 同源代理存档、角色、组队和操作请求；原样转发 `Authorization`、请求方法与请求体 |
| 三个固定版本角色 GLB | 同源代理既有 R2 资源，继续使用原始模型字节与 SHA-256 校验 |
| 场景材质清单中的十二张 JPG | 同源代理原场景材质服务 |
| `/assets/chapter-one/materials/manifest.json` | 由 Vercel 提供构建时复制的静态清单 |

三个角色资源位于 `/assets/chapter-one/workshop/65154a9106f3/assets/3d/magic/characters/`，文件分别为 `harry-pathfinder.glb`、`hermione-scholar.glb`、`ron-weasley.glb`。不重做角色，不修改工坊模型和动作。

`/api/stone/` 的响应明确设置 `no-store`，并关闭 Vercel 外部转接缓存。不能给这一组路径添加共享 CDN 缓存；角色模型则保留上游的固定版本缓存策略。

## 从旧试玩域名恢复进度

不同域名不能自动读取彼此的浏览器存储。旧试玩地址中的恢复凭据不会因为前端发布而自动出现在 `www.cici2.fun`。

1. 在原试玩地址打开设置，复制自己的恢复码。
2. 在正式站打开设置中的恢复入口，粘贴该恢复码。
3. 从读取到的角色列表继续原角色。存档仍来自同一权威后端，角色、奖励和任务记录不会因域名变化重新结算。

恢复码相当于存档的访问凭据，应由玩家自行保管。没有输入原恢复码的新浏览器会使用新的独立身份；原有存档不会被覆盖。

## 选角演示与声音

选角场景常驻哈利、罗恩、赫敏及一张共享演示桌。桌上的双面练习靶、羽毛与软垫一直保留；切换人物只改变人物表演和魔法效果。哈利与罗恩均向同一靶子释放基础咒击，赫敏让同一根羽毛升起、旋转并落回。切换时未完成的羽毛动作平滑收回，工坊模型及原始施法动画保持不变。罗恩的实战专属技能与职业属性没有因此更改。

原创合成音乐按选角、车站、火车、湖面、校园、禁林及战斗切换，配合环境声、施法、命中、脚步与落地音效。声音不额外下载音频文件，也不使用影视配乐。首次点击人物或页头“开启声音”后播放；页头可快速静音，设置中分别控制总音量、背景音乐、环境声音和动作音效。设置仅保存在此浏览器，不改变角色进度。网页进入后台时暂停，回到前台后继续；浏览器不支持声音时，游戏仍可正常操作。

本地检查正式静态构建可运行 `node hogwarts-rpg/scripts/preview-vercel.mjs`，默认监听 `127.0.0.1:4192`。预览仅提供明确的静态文件，复用仓库内校验一致的三个人物模型与十二张材质；只有 `/api/stone/` 转接至现有后端，不能把它作为通用文件服务器或任意网址代理。

## 重建静态产物

在此仓库根目录执行：

```sh
npm --prefix hogwarts-rpg ci --ignore-scripts
node hogwarts-rpg/scripts/build-vercel.mjs --out-dir .
```

脚本只写入明确列出的 RPG 静态文件，不清空输出目录，也不替换宇宙首页。默认不传 `--out-dir` 时，输出到 `hogwarts-rpg/dist/vercel/`。可用 `--metadata-dir` 指定发布元数据目录，或用 `--backend-origin` 指定经过验证的 HTTPS 后端源站。

每次构建同时生成：

- `hogwarts-rpg/dist/vercel-source-manifest.json`：最小构建源文件、静态产物哈希、复制排除项与运行时资源路径。
- `hogwarts-rpg/dist/vercel.config.suggested.json`：仅包含 RPG 路由与缓存头的配置建议。若正式站以后增加其他 Vercel 配置，应合并这些规则，不能直接覆盖其他配置。

构建不调用 `restoreWorkshopAssets`，不下载或恢复 GLB，也不访问存档数据库。复制源码时保留 `assets/chapter-one/workshop/65154a9106f3/js/magic/` 中的动作与表情代码；它们是脚本依赖。排除 `.git`、`.openai`、`.vercel`、`node_modules`、`.local`、旧 `dist`、GLB、模型 `.part` 分块及本地环境文件。

GitHub 中的 `hogwarts-rpg/` 发布源码不包含 RPG 的 GLB 或模型分块。静态构建可在没有这些大文件的干净副本中完整重建；完整的模型、骨架与动作资产测试仍需原受保护的校验资产包。不要在缺少资产时把模型测试失败当作前端构建失败，也不要跳过模型校验后宣称完整资产测试通过。静态发布链路可单独执行：

```sh
node --test hogwarts-rpg/tests/chapter-one-vercel-build.test.mjs
```

## 发布核验

发布前先验证最新后端已具备前端调用的操作，再在 Vercel Preview 检查：

- 宇宙的魔法星球进入 `stone.html`，原学院页和其他星球仍能打开。
- 哈利、罗恩、赫敏三个人物正常载入，固定模型资源的长度与校验标识一致。
- 新建角色、组队、移动、退出继续、装备更换与恢复码读取通过正式域名的接口完成。
- `/api/stone/` 的未授权请求返回正确的身份错误；授权请求不会被 CDN 共享缓存。
- 三个 GLB 和十二张材质 JPG 都由精确转接规则成功提供；其他站点资源不被 RPG 规则接管。

GitHub 更新生产分支后，由既有 Vercel Git 集成部署。此说明不代表部署已经执行；实际完成以对应提交的 Vercel 成功状态及正式域名核验为准。回滚前端提交不会回滚数据库，回退版本必须仍兼容当前后端操作与存档格式。
