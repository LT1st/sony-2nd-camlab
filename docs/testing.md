# 自动化测试策略与故障注入矩阵（Testing Guide）

## 1. 测试金字塔与执行命令

| 层级 | 工具 | 命令 | 覆盖目标 |
|---|---|---|---|
| 资产与许可证校验 | Node / Python | `pnpm assets:check` | 校验 16 张 CC0 样片、3 组 Ghost 配对、7 个 M1 RAW 阶段图的存在性与 SHA256 |
| 单元测试 | Vitest | `pnpm test` | `FilmRoll` 状态机（分支覆盖率 ≥ 90%）、幂等去重、严格不可回看锁、暗房像素管线、`MonotonicJobGuard`、Ghost 仿射矩阵 |
| 集成测试 | Vitest + `fake-indexeddb` | `pnpm test` | Dexie v1→v2 Schema 升级迁移、`MockCameraAdapter` 故障注入恢复、诊断包 ZIP 隐私脱敏 |
| 事件流重放测试 | `tsx` CLI | `pnpm debug:replay -- tests/fixtures/capture-duplicate.jsonl` | 验证 JSONL 事件流重放的确定性与重复 `captureId` 幂等性 |
| 端到端测试 (E2E) | Playwright | `pnpm test:e2e` | 在无相机的真实 Chromium 浏览器中验证 AC-01 ~ AC-12 完整用户旅程 |

## 2. 故障注入验证矩阵

| 故障场景 ID | 触发方式 | 期望系统行为 |
|---|---|---|
| 第 4 张拍摄失败 (`AC-07`) | `failOnFrameNumber: 4` | 第 4 次按快门返回 `SHUTTER_FAILED`；已拍帧数保持 3 张不虚增；界面显示错误横幅并可直接重试第 4 张 |
| 重复完成事件 (`AC-08`) | `duplicateCaptureCompleted: true` 或 JSONL 重放 | 同一 `captureId` 到达两次只计 1 张，日志记录 `capture.deduplicated` |
| 样片 404 / 损坏 (`AC-09`) | `simulateAsset404` / `simulateCorruptedAsset` | 抛出 `ASSET_MISSING` / `ASSET_CORRUPTED`，UI 显示恢复按钮与换图入口，不白屏崩溃 |
| 存储空间已满 | `simulateStorageFull: true` | 拍照或导出返回 `STORAGE_FULL`，不破坏已有胶卷或原始样片 |
| 显影中途中断 | `interruptDevelopOnStage: 'DEMOSAIC'` | 胶卷退回 `SEALED` 状态，原始底片完整保留，支持一键重新冲洗 |
| 并行导出冲突 | `simulateParallelExportConflict: true` | 返回 `EXPORT_CONFLICT` 提示重试，不覆盖已有导出记录 |
