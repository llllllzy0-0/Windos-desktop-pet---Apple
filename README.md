# 苹果 Windows 桌宠

一只由动作帧驱动的黑脸布偶猫桌宠，支持 Windows 10/11。

## 功能

- 透明无边框、始终置顶
- 鼠标拖动移动位置
- 待机、甩尾、玩耍、挥手、挠头、生气、睡觉、跳跃和翻肚皮动作
- 单击跳跃，双击随机挥手或挠头，右键生气，长时间无操作自动睡觉
- 系统托盘显示、隐藏与退出
- 兼容模式检测企业微信未读数字，不读取消息正文；有新消息时跳跃提醒
- 可打包为便携版 `.exe` 或安装程序

## 本地运行

1. 安装 [Node.js 20 或更高版本](https://nodejs.org/)。
2. 下载或克隆本仓库。
3. 在项目目录中运行：

```powershell
npm install
npm start
```

## 打包 Windows 程序

```powershell
npm install
npm run build:win
```

完成后在 `dist` 文件夹中获得便携版和安装版程序。

也可以打开仓库的 **Actions → Build Windows desktop pet → Run workflow**，运行完成后在页面底部下载 `Apple-Windows-Desktop-Pet`，解压即可获得 `.exe`。

> 源动作总览中的棋盘格并非真正透明，本项目的提取脚本会将其转换为透明背景并生成动画图集。若需要重新提取帧，把原图放到 `upload/image(77).png` 后运行 `python tools/extract_sprites.py`。
