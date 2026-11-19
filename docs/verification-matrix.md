# 规格与验证证据

更新：2026-11-18。状态以任务清单为准；有自动化证据不代表完整人工验收通过。

| 规格 | 实现与自动化证据 | 实际演示与待验 |
| --- | --- | --- |
| wechat-game-runtime | boot.test.ts、content.test.ts、platform-storage.test.ts；两平台构建检查；五组内容包 | 浏览器资源缺失→重试→菜单→地图通过；微信手绘启动与采集通过；真机、多指、性能待验 |
| world-cycle | survival.test.ts、seasons.test.ts、season-playtest.test.ts；冬季长夜、跨年、温度设施与暂停；默认时长全年规则浸泡，28 次逐日恢复 | 七段各 30 秒常速样本及中途恢复通过，见 season-checkpoints-20261117.md；完整常速一年人工试玩仍待验 |
| hero-combat | combat.test.ts、skills-resources.test.ts；动作冲突、四选二、范围、击退、急救与冷却 | 两角色起步、猎手闪现、训练拒绝已演示；格挡手感与双指待用户确认 |
| character-progression | progression.test.ts；经验去重、跨级、满级、复活与旧档 | 两角色 HUD、材料和恢复已演示；完整起步节奏待确认 |
| resource-gathering | survival.test.ts、skills-resources.test.ts；交付、成长、工具、季节刷新、占位与矿量 | 浏览器与微信采集交付 4 木通过；手机长时间资源循环待验 |
| equipment-crafting | defense-loot.test.ts、skills-resources.test.ts、persistence.test.ts、outcome-playtest.test.ts；20 模板、事务、保底、损失 | 浏览器与微信模拟器木剑制造穿戴通过；浏览器死亡后补制布衣并穿戴通过；紫金与恢复体感仍待用户确认 |
| tower-defense | survival.test.ts、defense-loot.test.ts、outcome-playtest.test.ts；多层破墙、维修、三种墙、迁塔及终局优先 | 浏览器攻城怪摧塔、刷新后仅能查看结算通过；真机迁塔和塔毁演示待验 |
| death-respawn | survival.test.ts、persistence.test.ts、outcome-playtest.test.ts；五槽混合、0／1 概率、重复死亡、复活、塔终局 | 浏览器五件穿戴中布衣／布鞋永久消失，刷新不重掷、复活和损失页回看通过；用户体验待确认 |
| local-persistence | persistence.test.ts、new-game.test.ts、platform-storage.test.ts；双槽、失败冻结、日志、版本 1／2／3 与技能待结算事件；微信转译产物的文件快照回读 | 浏览器普通进度、死亡结果和终局刷新恢复通过；微信模拟器保存退出通过，实际重启后进局核对尚未验证 |

## 本轮构建与回退

运行 npm test、npm run typecheck、npm run build:web、npm run build:wechat。Web 输出 build/web-mobile，微信输出 build/wechatgame；node scripts/check-build.mjs <web-mobile|wechatgame> 对实际转译模块检查关键规则，不只读取 CLI 成功码。

预览 npm run serve，地址 http://127.0.0.1:7457/。1／2 为已学习技能，I 为背包，B 建墙，T 迁塔，E 交互，R 维修；进阶防线可建温度设施并补充燃料。存档版本为 3，回退旧程序前备份原存储，不自动删除或覆盖不支持的存档；强杀回退边界为最近一次成功提交。

## 未完成门槛

任务 2.1、2.6、4.12、6.6、8.1、8.2、8.4、8.5、8.7 仍未全部满足。其中包括用户反馈、完整常速试玩、差异素材的人工验收、手机设备性能与内存验证。当前不归档、不标记整个变更完成、不上传或发布。

2026-11-17：任务 8.3 已补实际重载、耗时和 JS 堆观测，见 resource-observation.md。95 项测试、图集映射契约通过。第二差异图集已接入，8.2 仍等待真机与视觉验收。

2026-11-17 追加：任务 7.5 已补七段常速关键节点、两次完整快照核对和全部防具永久损失后的营地恢复路线。98 项测试、类型检查、两平台构建及 OpenSpec 严格校验通过；进度 46/55。临时样本不访问正式存档，详见 season-checkpoints-20261117.md。

2026-11-17 再次追加：新增“上次死亡损失”回看与隔离的死亡／塔毁样本，实际走通死亡保存刷新、复活、补制穿戴和终局保存刷新。101 项测试、类型检查、两平台实际转译检查通过；复合任务的用户与真机门槛仍保留，进度 46/55。证据见 outcomes-playtest-20261117.md。

2026-11-17 性能追加：40 敌人桌面浏览器一分钟基线为 59.97 FPS，帧间隔 P95 18.40 ms，组件逻辑与绘制提交 P95 3.20 ms；103 项测试及两平台构建检查通过。原始记录、方法与内存限制见 performance-baseline-20261117.md。手机、30 分钟与模式兼容尚未测，8.4／8.5 保持未验。

2026-11-18 本地交付：107 项测试、类型检查、OpenSpec 严格校验及两平台实际产物检查通过。新增六页玩法手册和横屏安全区适配，浏览器已验证翻页、返回暂停和保存退出；[微信模拟器](screenshots/wechat-menu-safe-area-20261118.png)可启动新版。微信模拟器此前实际[穿戴木剑](screenshots/wechat-equipped-20261117.png)并保存，重启后的进局核对仍待验。默认时长全年规则浸泡已完成，见 [试玩交付](local-playtest-delivery.md)。

2026-11-18 验收补测：修正多输入释放与自动存档打断格挡，补齐首夜死亡到黎明的提交及读档回归，新增独立 40 敌人 30 分钟样本。111 项测试通过，双端已在隔离目录重新构建，见 [验收补测与机型矩阵](acceptance-20261118.md)。

2026-11-18 亮色 Q 版：更换两张图集并统一菜单和世界配色，帧索引、玩法及存档格式不变。浏览器实际验证两个角色的选择页、[白天采集与按格建墙](screenshots/bright-build-20261118.png)、[夜间怪物和地格](screenshots/bright-night-20261118.png)。40 敌人实测 60 秒平均 60 FPS，帧间隔 P95 24.90 ms，见[截图](screenshots/bright-performance-20261118.png)。Web 与微信产物均包含新版图集并通过检查；真机视觉验收仍待执行，详见[素材来源](assets-provenance.md)。

2026-11-18 界面优化：新增[格子背包](screenshots/camp-backpack-20261118.png)、[人物状态](screenshots/camp-character-20261118.png)与[技能训练图卡](screenshots/camp-training-20261118.png)。浏览器实测木剑制造并自动选中、穿戴后攻击值更新、缺料与材料来源、学习两种后其余锁定、[急救回血与冷却](screenshots/camp-skill-cooldown-20261118.png)、冲击波及[战吼效果](screenshots/camp-warcry-20261118.png)。844×390 横屏通过选格和切页检查；112 项自动测试、类型检查与 Web／微信产物检查通过，手机真机体验仍待验。
