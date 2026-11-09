# 研发路线图与里程碑状态（Roadmap）

## M0：浏览器端完整 Camera OS 闭环（已完成 ✅）

- [x] Sprint 0：参考仓库源码审阅（`docs/research/source-audit.md`）、pnpm monorepo、JSON Schema 契约、`CameraPort`、`MockCameraAdapter`、640×480 相机模拟器外壳。
- [x] Sprint 1：Film OS 完整状态机（12/24/36 张、严格不可回看、自动/提前封卷、显影动画、接触印样导出、IndexedDB 刷新恢复）。
- [x] Sprint 2：Digital Darkroom `JPEG_SIMULATION` 7 阶段管线、Web Worker 异步像素处理、旧任务取消保护、显影配方导出。
- [x] Sprint 3：Ghost Viewfinder 双图仿射对齐、4 种对比视图、会话持久化、合成图与对照图导出。
- [x] Sprint 4：`/debug` 六面板诊断台、9 种故障注入、JSONL 确定性重放、脱敏 ZIP 诊断包导出、Vitest + Playwright 自动化测试全绿。

## M1：真实 RAW 离线教学管线（已完成 ✅）

- [x] Sprint 5：从 `raw.pixls.us` 获取 CC0 授权的 **Sony ILCE-7RM2 14-bit compressed ARW** 样片，通过 `tools/assets/prepare-raw.py` (`rawpy` + NumPy + Pillow) 生成 7 个可追溯阶段图与 `pipeline.json`，在暗房中与 `JPEG_SIMULATION` 明确区分展示。

## M2：Android 模拟器原生适配（远期规划 ⏳）

- [x] Sprint 6 设计先行：完成 `apps/camera-android` 架构规范、Java `CameraPort` 与 `FilmRollState` 骨架及旧 Android (API 10~16) 工具链版本冻结文档。
- [ ] 在标准 Android Emulator (API 16, 640×480) 中运行基于 `OpenMemories-Framework` Dummy 实现的 APK 并跑通共享 JSON 契约测试。

## M3：Sony α7R II (ILCE-7RM2) 真机安全探测与接入（远期规划 ⏳）

- [ ] 运行只读 Capability Explorer 生成真实的 `docs/hardware/capability-report.md`。
- [ ] 验证 `CameraEx.open`、`SurfaceView` 预览、`ScalarInput` 按键映射、`onPause()` 释放与 Exit Rule 参数还原、SD 卡 8.3 短文件名日志落盘。
