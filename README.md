# dsh-superagent-lab

## 我的 DSH 学习打卡页（index.html）

无需构建、无需依赖：直接用浏览器打开仓库根目录的 `index.html` 即可使用，也可以双击文件通过 `file://` 打开。

### 功能

- **姓名**：默认展示黄依敏，也可编辑（最多 40 字），下方提示同步显示本次打卡姓名。
- **3 个学习项复选框**：已安装 DSH、已接入 Super-agent、已完成第一个案例。
- **完成数与进度百分比**：实时显示「已完成 N / 3 项」与百分比，并用进度条同步展示。
- **重置按钮**：清空全部勾选，回到 0 / 3 与 0%。

### 验收用例

| 场景 | 操作 | 期望 |
| --- | --- | --- |
| 初始 | 打开页面 | 已完成 0 / 3 项，0% |
| 勾选一项 | 勾选任意 1 项 | 已完成 1 / 3 项，33% |
| 全选 | 勾选全部 3 项 | 已完成 3 / 3 项，100% |
| 取消一项 | 从全选状态取消 1 项 | 已完成 2 / 3 项，67% |
| 重置 | 点击「重置」 | 已完成 0 / 3 项，0% |

百分比按 `Math.round(完成数 / 3 * 100)` 计算，因此 1 / 3 = 33%、2 / 3 = 67%。

### 验证方式

页面为单文件纯前端实现，可用任意静态服务器或无头浏览器加载 `index.html`，断言 `#count`、`#percent`、`progress` 的取值覆盖上表全部场景；勾选与重置均通过页面上的真实控件触发。

本次实操同时保留了 900×900 桌面和 420×900 移动端截图及状态记录，见 `evidence/`。基线提交只有 README，没有旧版页面；基线 README 截图不代表旧版 UI。

附带脚本是本机实操辅助工具，不是页面运行依赖：`verify.mjs` 使用 Node.js 和本机 `C:/fancloud/dsh-superagent-lab/prototype` 中的 jsdom；截图脚本使用 Windows 已安装的 Microsoft Edge。换机器复验时需先调整脚本中的依赖和浏览器路径。`inspect-image.mjs` 的像素统计只检测空白或损坏图片，不能代替视觉审查。

### Windows 受限沙箱补验（2026-11-14）

原 C:\fancloud 工作树存在沙箱初始化权限拒绝。保留该工作树，另将同一 PR 提交复制到用户自有目录 C:\Users\admin\dsh-superagent-workspaces\learning-checklist-page。该目录继承登录用户的完整权限，无需手工改 ACL 或启用完全权限。

DSH 会话记录确认 preset/mode 均为 workspace-write。index.html、README.md、既有 evidence/acceptance.json 可写打开，以及根目录/evidence 的创建、读取、删除探针共五项全部通过；随后在同一受限模式执行 node verify.mjs，全部状态通过，实际更新报告。旧目录的权限未被重置，本结果仅证明新验收目录正常。

面板截图：evidence/superagent-source.jpg；Ticket 授权详情：evidence/superagent-ticket.jpg；关联 Issue/PR 和编号：evidence/superagent-ticket-links-id.jpg。Ticket 的人工停止状态如实保留。面板“CI通过”为原型的显示；本仓库未配置 CI，不把此标记当成 CI 测试证明。
