# 素材来源与使用记录

## 2026-11-18 · 营地界面图标

[`assets/content/common/camp-ui-atlas.png`](../assets/content/common/camp-ui-atlas.png) 使用内置 ImageGen 生成，原图为相同生成目录下的 `exec-bfccec95-98e1-49b2-9fcc-ce401ecc13ba.png`。沿用 `scripts/pack-sprite-sheet.swift` 整理边缘、留白并缩放至 768×768；为通用包独立纹理，生命周期随通用包释放。

提示词：透明 4×4、16 个独立的亮色 Q 版森林生存游戏 UI 图标。暖棕描边、圆润形状、强轮廓、无字和卡片背景。逐行排列：皮帽、绿布衣、棕色靴子、工装手套；木剑、旅行背包、爱心、黄色闪电；面包、温度计、绿色横扫弧、蓝色冲击波环；金色号角、急救包、青色盾牌、蓝色疾行翼。

## 2026-11-18 · 亮色 Q 版

按用户最新要求，角色、敌人、首领、资源与营地建筑统一改成亮色 Q 版。使用内置 imagegen 生成透明 4×4 图集，以 `scripts/pack-sprite-sheet.swift` 整理边缘、帧间留白和脚底基线，输出两份 1280×1280 RGBA 图集。文件名、帧索引和存档格式不变；暗色版可从历史试玩包回看。

| 项目内素材 | 生成原图（同一 `generated_images/01a1dac0-36c1-7d90-bb82-594327f039e9` 目录） | 提示词内容 |
| --- | --- | --- |
| `assets/content/common/wilderness-atlas.png` | `exec-f2cde301-c68d-4d68-9241-84e534cf1c19.png` | 透明 4×4、16 个独立切图、明亮柔和色块、Q 版大头短身、棕色描边、无字；绿兜帽守望者和珊瑚帽猎手各正／左／右／背四视图，圆冠树、淡紫岩石、红莓、药草、黄顶木塔、木墙、紫史莱姆、篝火。 |
| `assets/content/common/defense-atlas.png` | `exec-713a867a-859d-4a75-b69e-e19e3420cd87.png` | 相同透明 4×4、Q 版配色和轮廓；蘑菇、蝙蝠、石甲虫、角兽，四个季节变种，藤冠王、火尾狐、琥珀守卫、冰晶巨人，以及石墙、强化墙、降温棚、木门。 |

地表由 Cocos Graphics 按实际逻辑格绘制。春绿、夏青黄、秋金、冬冰蓝；黄昏偏暖、夜晚偏蓝。未探索区降饱和，但保留清楚的方格边界；建筑占用与点击位置继续使用原世界网格。菜单、角色选择、背包和战斗提示统一采用浅色底、深色字。

## 2026-11-16 至 17 · 暗色版历史

当时用户选择“暗色手绘风，接近饥荒的氛围”。旧版使用原创荒野人物与生物，没有导入原游戏角色、纹理或音频。下表记录被替换前的资源。

| 资源 | 来源与处理 | 当前状态 |
| --- | --- | --- |
| assets/content/common/wilderness-atlas.png | 本次使用内置 imagegen 生成；原始文件 exec-8573ff99-e0c1-479a-b353-1c5878bd5a99.png 保留于 ~/.codex/generated_images/01a1dac0-36c1-7d90-bb82-594327f039e9/。复制至项目，未二次改图；1254×1254，RGBA，约 1.9 MB | 第一版；两个角色各四方向、四类资源、塔、木墙、怪物和篝火。运行时按 4×4 图集取帧 |
| attack/hit/gather/night/death.wav | 本项目生成的正弦波与包络短音，未采样第三方音乐或音效 | 操作与事件反馈；暂停菜单可开关 |
| 文字、图形底板、攻击预警 | Cocos Graphics 和系统默认字体 | 第一版布局 |

生成素材没有引用第三方素材许可证。此记录说明生成来源，不是对美术独创性、发行许可或用户视觉验收的法律保证。正式发布前仍需人工审阅。2026-11-17 已新增第二图集：12 种敌人（含四季变体及四首领）与石墙、强化墙、降温棚、门具有各自帧。真机辨识度与人工视觉确认仍未完成，任务 8.2 保持未验收。

运行时使用公共纹理和精灵节点池，按脚底位置排序。背景、角色、敌人和季节内容由五组 Asset Bundle 清单控制。按 [Cocos Bundle 文档](https://docs.cocos.com/creator/3.8/manual/zh/asset/bundle.html)加载内容，资源持有与释放按 [引用计数规则](https://docs.cocos.com/creator/3.8/manual/en/asset/release-manager.html)处理。

第二图集 assets/content/common/defense-atlas.png 来自本次内置 imagegen；原图 exec-1f63dd9e-110d-4595-a349-4baee6a29b7c.png 保留在同一 generated_images 对话目录。复制原图，1254×1254 RGBA。未修改或覆盖第一图集，运行时帧索引为 16～31。映射位于 common／monsters 的 manifest.json，art-manifest.test.ts 校验完整、唯一与范围；必要图片缺失时启动失败并可重试。
