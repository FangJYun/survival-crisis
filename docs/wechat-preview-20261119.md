# 微信真机预览准备

2026-11-19：用户提供 AppID `wx316c8e0d7d10297a`，与后台截图一致。该字段可以用于配置，但截图写有“小程序”，不能单凭 AppID 格式判断是否已经注册为小游戏；请在微信后台确认账号类型或游戏相关设置。

## 当前构建

- 构建命令：`npm run build:wechat`；配置为 `config/build-wechatgame.json`。
- 使用压缩构建，主包 2,764,708 字节（约 2.64 MiB），总大小 6,869,572 字节（约 6.55 MiB）。这是本地文件计量，最终预览大小以微信工具为准。
- `game-common`、`game-heroes`、`game-monsters`、`game-seasons` 四个资源包放入 `subpackages/`；启动清单与入口场景保留在主包。
- 当前 Creator 版本的构建配置未实际生成预期分包，包装脚本使用 `packageWechatContent` 整理已生成的本地 Bundle，并同步 `game.json`、引擎 `settings.json` 与分包 `game.js` 入口。加载仍通过 Cocos 的微信适配层调用分包接口，不引入远程资源服务器。
- `scripts/check-build.mjs wechatgame` 检查主包 4 MiB 与项目总包 30 MiB 预算、分包路径、AppID 和完整玩法转译代码。分包测试覆盖真实目录移动、入口及清单一致、主包超限和 AppID 不匹配时拒绝。
- 本轮完成本地构建与规则检查；尚未执行登录、生成二维码或真机加载，不能据此视作手机验收通过。

## 手机运行

1. 确认此 AppID 属于小游戏，且登录微信是管理员或有开发权限的成员。
2. 微信开发者工具导入本工程的 `build/wechatgame`，项目类型选择小游戏；核对“详情”中 AppID。
3. 点击编译。首次加载四个分包后出现菜单；查看是否有分包、账号权限或资源错误。
4. 点击“预览”，用相应微信账号扫码在手机打开。需要定位手机异常时使用“真机调试”。此步骤不需要发布或提交审核。
5. 先测移动同时攻击、背包／人物／训练面板、切后台及保存恢复，再按现有验收矩阵进行长时间测试。

当前默认非调试构建不会开启微信启动参数 `qa=performance-long`；如要执行真机专用长测，需要另外构建调试样本，不能直接用本包代替。

参考：[Cocos 3.8 微信发布](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-wechatgame.html)、[微信分包](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/subpackage.html)。
