# 浏览器自动化超时排查

排查日期：2026-11-15；复测日期：2026-11-16。当前状态：已修复配置路径并恢复预览服务；用户重启 computer-use 后，桌面与内置浏览器读取、实际点击验证均已通过，本轮未再复现自动化超时。

## 已确认的事实

1. 排查开始时 127.0.0.1:7457 没有监听，本地预览无法访问；重新运行 npm run serve 后返回 HTTP 200，响应约 3ms。这与自动化连接故障需分别处理。
2. 桌面应用日志记录 `No ChatGPT browser route is available for browser session`，说明曾缺少当前对话的浏览器路由。请求重新打开面板时返回 queued；用户随后确认已打开当前对话和浏览器面板。
3. 同一日志还记录 `MCP client for computer-use failed to start`，底层为 `No such file or directory (os error 2)`。
4. 用户级配置的 computer-use 使用相对启动命令，cwd 为 `.`。该命令从本项目目录不能解析为现存文件。
5. 实际可执行程序位于已安装应用的 Resources/cua_node/lib/node_modules/@oai/sky 下，文件存在且具备执行权限。应用版本为 26.1103.60933（25894）。

## 已执行修复

仅修改 /Users/fangjiayun/.codex/config.toml 中 computer-use 的 command 一行，将相对路径替换为：

```
/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient
```

修改前备份为 /Users/fangjiayun/.codex/config.toml.backup-browser-fix-20261115-235146，备份权限设为 0600。已确认差异只有一行，未更改授权、环境变量、其他 MCP 服务或游戏存档。使用随应用提供的 codex mcp get computer-use --json 验证配置可解析，服务仍为启用状态，解析出的程序路径存在。

## 重启与复测结果

仅重置 CUA JavaScript 会话、打开当前对话和浏览器面板时，工具曾继续在约 30 秒后超时。因此相对路径错误是已确认的故障之一，不能认定为所有历史超时的唯一原因，也不能将工具超时解释为游戏卡死。

用户在设置的 MCP servers 中重启 computer-use 后，本轮完成以下验证：

- 原生 computer-use 能读取微信开发者工具窗口和截图。
- 统一 CUA 桌面接口可读取窗口；点击 Sources 后可见标签从 Console 切为 Sources，再切回 Console，实际控件操作已验证。
- 内置浏览器能列出标签页，并读取本地游戏页面 `http://127.0.0.1:7457/` 的 AX 状态和截图。首次绑定约 23 秒，后续截图及按钮操作约 0.05–0.24 秒，未发生超时。
- 点击游戏“新的旅程”后可见覆盖存档确认框，点击“保留原局”后返回菜单。没有确认创建新局，原存档保留。
- 返回菜单后的证据截图：`.cache/qa/automation-recovered-20261116.png`。

结论：启动路径修复已生效；重启后当前对话的浏览器操作链路也恢复。未强制退出桌面应用，未更改系统安全权限。微信模拟器内 Canvas 菜单的坐标点击尚未观察到画面变化，不能把桌面控件点击成功等同于全部微信游戏交互通过；这项保留为游戏 UAT 待验证事项。

官方配置与重启说明：https://learn.chatgpt.com/docs/extend/mcp?surface=cli

若需要回退，只应恢复本次 command 一行；备份可能包含其他私人配置，不应上传或公开其完整内容。游戏源码和存档不需要清理。
