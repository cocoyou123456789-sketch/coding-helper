# 题解簿

一个为算法初学者设计的 LeetCode Hot 100 学习工作台。

## 功能

- 收录经典 LeetCode Hot 100 全部 100 道题，并按题型筛选
- 在网页里写 Python 3，运行内置快速测试
- 为每一行代码写解释，也可以自动补齐基础解释
- 记录解题思路、错误原因和复盘提示
- 自动在浏览器本地保存代码、笔记和掌握进度
- 桌面与手机均可使用

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

## 数据与隐私

代码和笔记保存在当前浏览器的 `localStorage`，不会上传到服务器。Python 通过浏览器中的 Pyodide 运行；第一次运行需要下载运行环境。

题单名称与题目链接归 LeetCode / 力扣所有；本站的简短中文说明为学习用途的改写。
