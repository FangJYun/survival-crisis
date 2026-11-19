# 开发环境与启动前检查

## 最新补充（2026-11-17）

进度 45/55，95 项测试通过。第二张差异图集为全部 12 种怪物和石墙、强化墙、门、降温棚提供独立帧；用户选择的暗色手绘方向继续保留待审阅。新增仅本地可见的资源观测入口，实测与方法见 resource-observation.md；缓存资产数保持 35，三次重载耗时 467～500ms，JS 堆有 GC 波动，不等同于真机长时间稳定性。

## 最新状态（2026-11-16）

当前进度 44/55，94 项 Node 测试、类型检查、Web／微信实际产物检查通过。新增双主动技能、20 装备、三类围墙与敌人、精英保底、四季温度和季末首领、手绘图集、音效与五组内容包。审核和验收矩阵见 implementation-review.md、verification-matrix.md，下方早期记录保留为历史。

浏览器资源缺失、重试、制造穿戴、双角色起步与保存恢复已有实际操作。微信模拟器已加载手绘版、角色地图与采集背包，内容包加载观测为 startup 45ms、common 427ms、heroes 47ms、monsters 41ms、seasons 47ms（单次桌面模拟器样本，非手机性能）。菜单坐标操作需先将目标窗口置前；后台截图成功不代表坐标点击已生效。微信实际文件重启恢复、内存采样、正常节奏一年和真机继续标为未验证。

本轮微信 CLI 冷启动两次触发导入类型降级，防护脚本恢复元数据并停止交付；通过 Dashboard 打开现有工程完成导入后，编辑器及后续 CLI 构建均通过。不能把这个恢复步骤描述为已找出根因。


## 首夜原型最新补充（2026-11-15）

当前 OpenSpec 完成 30/55。72 项 Node 测试、TypeScript 检查、Web 和微信实际构建代码检查通过，覆盖碰撞、采集、制造、穿戴、存档恢复、新局确认及成长天赋。下文早期战斗记录保留为历史，当前范围见 [首夜试玩说明](first-night-playtest.md)。

本轮补齐终局、新局取消与防重复确认、浏览器／微信存储契约、保存并发和周期提交检查。修复自动保存期间另一保存请求立即返回失败的问题，调用方现在共同等待进行中的提交。微信存储契约使用临时目录真实文件测试，微信运行环境的文件存储和手机真机尚未验证。本轮 CUA 浏览器连接连续超时，未声称新版菜单已人工验收。

浏览器实际完成采集、制造穿戴、建墙、死亡损失和复活，并验证保存退出后刷新继续，保留材料、建筑、塔血量及复活状态。微信新版已加载首夜菜单，调试器 Errors: 0、Warnings: 1；warning 为 `Failed to set shading scale, pipelineSceneData is invalid.`。微信按钮与文件存档交互、手机真机仍待验证。

一次 Creator CLI 构建将资源类型降为通用 `*`，返回完成码却生成空 main。已备份元数据及生成缓存至 /tmp，保留 UUID，恢复资源类型并重建 library；随后两平台构建通过。根本触发原因尚未确定。现已添加构建前关键资源类型检查，构建后验证初始场景存在，防止误报成功。

本轮复现了此异常。构建脚本新增构建前元数据快照，检测已知类型降级后恢复原始内容及 UUID，将异常 library 移至 temp/asset-cache-recovery-* 保留排查，最多重试一次，失败仍返回非零。已恢复编辑器确认过的 scene 1.1.50 与 typescript 4.0.24 元数据格式，最新 Web 构建及实际代码检查通过；微信产物检查亦通过。引擎子进程退出的收尾日志仍存在，不能表述为零错误日志。

任务中断后本地预览服务也停止，已重新运行 `npm run serve` 并确认 HTTP 200。地址拒绝连接时应先检查服务；工具调用 Bad Request 或超时不能作为游戏内部报错的证据。

## 当前状态

2026-11-15 继续执行 OpenSpec 变更 `build-single-player-survival-defense`。已由 Creator 官方入口生成工程，使用编辑器随附的 empty-2d 配置与官方 scene-2d 场景模板建立当前项目。Web Mobile 与微信小游戏的空场景构建成功，已建立分层规则代码及独立测试。任务进度以 tasks.md 为准，尚未交付完整游戏。

| 项目 | 实测结果 |
| --- | --- |
| 主机架构 | macOS arm64 |
| Node.js | `/opt/homebrew/bin/node`，v26.10.0，已运行 npm 安装、25 项 Node 测试与 TypeScript 5.8.3 检查；编辑器使用随附 Electron/Node 运行时 |
| 工作目录 | `/Users/fangjiayun/myproject/wx-game/survival-crisis` |
| Cocos Dashboard | `/Applications/CocosDashboard.app`，2.2.2，已启动；界面显示开发者账号登录页，并提示需先安装编辑器 |
| Cocos Creator 编辑器 | `/Applications/Cocos/Creator/3.8.8/CocosCreator.app`，Info.plist 确认版本 3.8.8，可执行文件存在；已启动，显示创建空项目／打开项目入口 |
| 微信开发者工具 | `/Applications/wechatwebdevtools.app`，界面版本 2.02.2609250，已启动至项目入口，可见游客模式；尚未验证游戏工程导入 |
| 游戏测试 AppID | 构建采用 Cocos 官方测试 ID `wx6ac3f5090a6b99c5`，仅供开发验证，不代表用户正式小游戏账号，发布前替换 |
| 游戏源码／工程 | 当前根目录，package.json 锁定 Creator 3.8.8；assets/scripts/ 按 domain/application/presentation/platform 分层 |
| 编辑器／构建／真机验证 | 编辑器已打开 Battle.scene 并实际绑定保存 BattleView；战斗版本的 Web Mobile 和微信包构建通过；浏览器与微信游客模式模拟器已运行，真机尚未验证 |

上述检查不能排除软件放在未索引的自定义目录。若已有安装，优先确认其实际应用路径与版本，不重复安装。

## 工具链准备

1. Dashboard 与 Creator 3.8.8 已安装，无需重复下载。以 3.8.8 作为工程验证候选，构建通过后锁定；尚不能声称微信构建已验证。
2. Creator 直接启动已成功显示项目选择入口。可通过 Dashboard 管理和打开项目；如后续官方流程需要账号登录，由用户在官方应用中完成。账号密码及验证码不放入项目、对话、脚本或日志。
3. 微信开发者工具已安装，无需重复下载；后续准备小游戏测试项目所需的登录及 AppID。官方入口为 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
4. 工具链记录见上表。正式 AppID、微信接口与真机表现仍需后续阶段分别验收，不能由测试 ID 构建成功推断发布已具备条件。

官方安装参考：[Cocos 安装和启动](https://docs.cocos.com/creator/3.8/manual/zh/getting-started/install/)、[Dashboard 使用](https://docs.cocos.com/creator/3.8/manual/zh/getting-started/dashboard/)。

## 后续工程创建与验证

工具链可用后按任务 1.2 创建官方可识别的 TypeScript 2D 工程，保留现有 `openspec/` 和本文件；不猜测或手写编辑器场景格式。依次验证编辑器打开、空场景浏览器预览、微信包构建及开发者工具导入，再锁定版本与依赖。

已验证的命令：

```sh
npm ci
npm test
npm run typecheck
npm run build:web
npm run build:wechat
npm run serve
```

测试使用固定步长、可控随机与无引擎依赖的领域对象；TypeScript 编译测试后由 Node 自带测试运行器执行。类型检查依赖 Creator 自动生成的 temp/declarations，因此新检出项目应先用 Creator 打开或构建一次，再执行 typecheck。

最新规则与启动测试为 32 项全部通过。独立测试覆盖战斗规则和失败路径，不能替代触控／真机体验验收。

构建包装脚本额外执行 scripts/check-build.mjs，读取实际 Cocos 产物并运行网格与移动规则，检查网格数量、有限坐标、薄墙阻挡及解除阻挡。浏览器实测曾发现 Creator loose 转译把 Set 的展开转换成 [].concat(Set)，现已改为 Array.from，并增加非法地图初始化检查；Web 与微信两种实际构建产物均需通过此回归检查。

构建脚本默认使用表中的 macOS 编辑器路径，其他位置通过 COCOS_CREATOR_BIN 环境变量指定。Creator 成功构建的退出码为 36，包装脚本将其转换为常规成功码 0。构建结果位于 build/web-mobile 与 build/wechatgame，前者可通过本地预览服务器查看，后者导入微信开发者工具。

首次无场景构建曾报告缺少初始场景，加入编辑器自带的官方 2D 场景模板后，Web 与微信构建均成功；模板来源是编辑器 resources/3d/engine/editor/assets/default_file_content/scene/scene-2d.scene，不是猜测序列化结构。

## 验收记录原则

浏览器、开发者工具、Android 微信、iOS 微信分别记录结果；没有设备、未运行或需要用户操作的项目明确标为未验证。任务只有在描述中的全部完成条件满足后才勾选。

## 当前验证证据

| 环境／检查 | 结果 |
| --- | --- |
| npm ci / npm test / npm run typecheck | 成功；32 项规则与启动测试通过 |
| Web Mobile 构建 | 成功，Creator 原生退出码 36，包装脚本退出码 0 |
| 微信小游戏构建 | 成功，已生成横屏 game.json、小游戏 project.config.json 及运行资源 |
| 浏览器实际操作 | 已进入菜单与战斗，验证 D 键移动、J 持续攻击并击败敌人、K 闪现位移与冷却、L 正面格挡后的减伤与体力下降、暂停及重新开始 |
| 微信开发者工具 | 已以游客模式导入 build/wechatgame，选择不使用云服务；小游戏模拟器成功载入 Battle.scene 并显示游戏菜单，调试器显示 Errors: 0、Warnings: 1 |
| 手机真机与体感 | 未验证；需要用户扫码登录与符合权限的小游戏 AppID、实际设备及试玩反馈 |

微信工具当前存在一条未展开归因的 warning，不能将“无错误”写成“无警告”；发布前在兼容性阶段继续核查。Creator 构建日志也包含信息服务请求超时与构建子进程收尾消息，构建返回成功且产物实际可运行，但不能因此声称外部服务网络完全正常。

2026-11-15 用户确认暂时没有自己的小游戏 AppID，先进行本地试玩。继续交付本地构建与操作原型，真机测试条目保持未完成，不能将此决定解释为免除最终真机验收。编辑器空模板默认包含 Box2D，项目已在 engine 配置中关闭未使用的 2D 物理模块，移动与攻击使用领域碰撞规则。

浏览器截图见 [战斗原型](screenshots/combat-prototype.png)。操作与用户验收清单见 [combat-playtest.md](combat-playtest.md)。当前暂名及占位美术尚未确认，未实现的生存系统见该文档范围说明。

## 双角色与成长追加

任务 5.1～5.3 已实现，详见 progression-playtest.md。新局角色固定，旧档补初始守望者，存档写入版本提升到 2，兼容读取版本 1。攻击伤害在攻击开始锁定并保存；角色／采集经验、工具和天赋计数可恢复。72 项测试和两平台实际构建检查通过。新版界面的浏览器自动化调用在约 30 秒后超时，根因未定位；此故障不能证明游戏运行异常，也不替代界面和真机验收。

## 2026-11-17 四季常速验证

七段各 30 秒浏览器常速样本、中途与末尾完整快照恢复一致；98 项测试、类型检查、Web／微信实际构建检查与 OpenSpec 严格校验通过。任务 7.5 完成，当前 46/55；完整正常速度一年、用户体感和手机项目仍待验。常速入口 /?qa=seasons 使用隔离内存存储，不访问正式存档。详情见 season-checkpoints-20261117.md。

## 2026-11-17 死亡与终局追加

新增背包损失回看、/?qa=outcomes 隔离样本，101 项测试通过。浏览器已实际验证五槽部分永久损失、死亡节点保存刷新不重掷、复活后补制穿戴、攻城摧塔及刷新仍为终局。Web／微信构建与增强的实际转译产物检查通过，详细截图见 outcomes-playtest-20261117.md。微信模拟器输入仍未取得可靠完成证据，文件存档重启恢复继续待验；进度仍 46/55。

该轮一次 Web 构建结束后出现 Creator 窗口布局 JSON 读取失败，实际新代码已进入产物且检查通过；随后读取 ~/.CocosCreator/editor/window.json 已是有效 JSON，微信构建通过。本轮未修改全局编辑器偏好，不将这条收尾错误解释为游戏代码失败或根因已解决。

## 2026-11-17 40 敌人桌面负载

新增 /?qa=performance 内存隔离负载场景和 npm run benchmark:domain 复跑命令。103 项测试、类型检查与两平台实际转译产物检查通过；浏览器保持 40 敌人运行 60 秒，平均 59.97 FPS、帧间隔 P95 18.40 ms，详见 performance-baseline-20261117.md。手机与 30 分钟门槛保持未验，总进度 46/55。该轮微信构建仍报告编辑器布局／窗口 JSON 读取错误，实际新产物已通过检查，未据此宣称编辑器偏好根因解决。
