# 题解簿

一个为算法初学者设计的 LeetCode Hot 100 + 加练学习工作台。

界面采用浅粉色“学习手账”风格，并用统一的四步路线帮助第一次使用的人快速上手。

## 功能

- 收录经典 LeetCode Hot 100 全部 100 道题，并加入 167「两数之和 II」加练题，可按题型和难度筛选
- 中文 / English 一键切换
- 在网页里写 Python 3，运行内置快速测试
- 完整题目练习工作台：题意重述、官方原题链接、代码测试和笔记同屏
- 课程笔记：导入 Bilibili 公开课程链接，点击后加载官方播放器，分段语音听写并整理自己的笔记
- 为每一行代码写解释，也可以自动补齐基础解释
- 记录解题思路、错误原因和复盘提示
- 自动在浏览器本地保存代码、笔记和掌握进度
- 桌面与手机均可使用；iPhone / Android 可安装到主屏幕作为 PWA App

## 安装到手机

- Android：打开网站后点“安装 App”，确认安装即可。
- iPhone / iPad：使用 Safari 打开网站，点“分享”→“添加到主屏幕”。

学习内容、进度和笔记支持设备本地离线访问；网页/PWA 第一次运行 Python 测试与加载外部课程播放器仍需联网。题解簿不会下载课程视频，也不会保存听写录音。

> 快速测试只覆盖典型示例，最终是否完全正确仍以力扣官方提交结果为准。

## 本地启动

```bash
npm ci
npm run dev
```

打开 `http://localhost:3000`。

## 检查与构建

```bash
npm test
GITHUB_PAGES=true npm run build
```

GitHub Pages 静态产物位于 `dist/client`。推送到 `main` 后，`.github/workflows/pages.yml` 会自动构建并部署。

## iOS 原生版本

iOS 版本使用 Capacitor 8 和 Swift Package Manager，最低支持 iOS 15。它会把网页资源、固定版本的 Pyodide、Python 标准库和测试全部放进安装包，不会在运行时加载 GitHub Pages 或远程 Python 运行环境。只有当用户主动加载课程播放器时，App 才会连接 Bilibili；只有当用户主动开始听写时，App 才会请求麦克风和语音识别权限。

```bash
npm run test:ios  # 构建、同步并检查完整 iOS 资源包
npm run ios:open  # 安装 Xcode 26+ 后打开工程
```

iOS 工程位于 `ios/App/App.xcodeproj`，Bundle ID 为 `com.coocylh.tijiebu`。首次真机或 TestFlight 构建需要在 Xcode 中登录 Apple Developer 账号并选择签名团队。完整上架清单见 `docs/app-store/README.md`。

## 数据与隐私

网页代码、课程听写和笔记保存在当前浏览器的 `localStorage`；iOS 版本使用系统设备偏好存储。两者都不会把学习内容上传到题解簿服务器。网页语音识别可能由浏览器服务处理，旧版 iOS 也可能使用 Apple 语音服务；App 本身不保存录音。网页通过浏览器中的 Pyodide 运行 Python；iOS 版本使用随 App 打包的离线运行环境。

题单名称与题目链接归 LeetCode / 力扣所有；本站的简短中文说明为学习用途的改写。
