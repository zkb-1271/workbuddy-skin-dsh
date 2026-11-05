## 这个 PR 做了什么

<!-- 一句话说明；如果是修样式，写清是哪个区域/哪条规则 -->

## 类型

- [ ] 修 bug
- [ ] 样式调整（颜色 / 字体 / 间距）
- [ ] 新功能（设置页可调项、界面模块）
- [ ] 安装 / 卸载 / 守护进程
- [ ] 文档

## 自测清单

- [ ] 在真实 WorkBuddy 上跑过：`bash tools/restore.sh` → `bash tools/apply.sh` 往返正常
- [ ] 关掉皮肤后（`./uninstall.sh`）**没有残留**：界面回到原生，无多余 DOM
- [ ] `bash -n install.sh uninstall.sh tools/*.sh` 通过
- [ ] `node --check skin/*.js tools/*.mjs` 通过
- [ ] 没有提交个人信息：`skin/avatar.local.js`、截图里的账号 / 会话标题 / UID
- [ ] 涉及行为变化时同步更新了 README

## 截图 / 录屏

<!-- 样式类改动请贴前后对比 -->

## 已知限制

<!-- 比如：只适配 5.9.3；依赖的类名可能在下次更新变掉 -->
