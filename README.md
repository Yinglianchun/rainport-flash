# Rainport

> A small Windows browser for the Flash games left behind by time.

Rainport 是一个专门用来运行旧 Flash 页游的轻量浏览器壳。它基于 Electron 11、
Chromium 87 和 PPAPI Flash Player 29，提供游戏画面缩放、游戏全屏、完整画面截图、
收藏夹、历史记录和直达页识别。

## 安全提示

Rainport 使用已经停止维护的浏览器内核与 Flash Player，只应用于旧游戏。
请勿用它登录邮箱、支付平台、网银或其他重要账号。

## 运行方式

仓库只包含 Rainport 自身的源码和图标，不包含 Electron/Chromium 运行时，也不包含
Adobe Flash Player。运行时需要自行准备：

1. 准备 Electron 11 的 Windows 运行目录。
2. 将本仓库文件放入运行目录的 `resources/app`。
3. 将兼容的 64 位 PPAPI Flash 插件放到 `resources/libs/pepflashplayer64.dll`。
4. 启动 Electron 可执行文件。

本机已构建版本直接运行 `Rainport.exe` 即可。

## 快捷键

- `Ctrl+L`：聚焦地址栏
- `Ctrl+R`：刷新
- `Ctrl++` / `Ctrl+-` / `Ctrl+0`：页面缩放
- `Ctrl+Shift+S`：截取完整游戏画面
- `Alt+Left` / `Alt+Right`：前进后退
- `F11`：游戏全屏

## 数据

为保留更名前已有的游戏登录状态，当前版本继续使用原有的本地用户数据目录和
`persist:haven-flash` 分区。收藏夹、历史记录和缩放设置也沿用旧键名。

## Authors

Haven × 池又雨
