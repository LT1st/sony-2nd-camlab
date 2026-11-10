# 研发路线图与里程碑状态（Roadmap）

## M0：浏览器端完整 Camera OS 闭环（已完成 ✅）

- [x] Sprint 0：参考仓库源码审阅（`docs/research/source-audit.md`）、pnpm monorepo、JSON Schema 契约、`CameraPort`、`MockCameraAdapter`、640×480 相机模拟器外壳。
- [x] Sprint 1：Film OS 完整状态机（12/24/36 张、严格不可回看、自动/提前封卷、显影动画、接触印样导出、IndexedDB 刷新恢复）。
- [x] Sprint 2：Digital Darkroom `JPEG_SIMULATION` 7 阶段管线、Web Worker 异步像素处理、旧任务取消保护、显影配方导出。
- [x] Sprint 3：Ghost Viewfinder 双图仿射对齐、4 种对比视图、会话持久化、合成图与对照图导出。
- [x] Sprint 4：`/debug` 六面板诊断台、9 种故障注入、JSONL 确定性重放、脱敏 ZIP 诊断包导出、Vitest + Playwright 自动化测试全绿。

## M1：真实 RAW 离线教学管线（已完成 ✅）

- [x] Sprint 5：从 `raw.pixls.us` 获取 CC0 授权的 **Sony ILCE-7RM2 14-bit compressed ARW** 样片，通过 `tools/assets/prepare-raw.py` (`rawpy` + NumPy + Pillow) 生成 7 个可追溯阶段图与 `pipeline.json`，在暗房中与 `JPEG_SIMULATION` 明确区分展示。
- [x] v0.2.0 深度迭代：扩展至 **3 组真实 Sony CC0 RAW 数据集**（`sample-001` ILCE-7RM2 14-bit ARW、`sample-017` ILCE-7RM2 12-bit ARW、`sample-018` ILCE-7M2 14-bit ColorChecker D65 ARW，共 21 个可验证阶段文件），支持实时 256-bin RGB/Luma 直方图、动态范围 EV 遥测与 7 阶段对比拼图导出。

## M2：Android 模拟器原生适配（已完成宿主 JVM 契约测试与模拟器 Dummy 适配 ✅）

- [x] Sprint 6 设计先行：完成 `apps/camera-android` 架构规范、Java `CameraPort` 与 `FilmRollState` 骨架及旧 Android (API 10~16) 工具链版本冻结文档。
- [x] v0.2.0 真实契约执行：实现零 AndroidX 依赖的 `FilmRollState`、`GhostAffineMath`、`MockAndroidCameraAdapter`（含 Exit Rule 参数还原）与 `SdCard83Logger`（FAT 8.3 短文件名校验与隐私脱敏），通过 `pnpm test:java`（`javac --release 8`）直接运行 `ContractTestRunner` 对齐 `tests/contracts/state-machine-vectors.json`。
- [x] v0.3.0 物理交互与 M2/M3 桥接迭代：实现零外部音频文件的 Web Audio API 机械声效合成器（默认静音）、全模块物理快捷键操作、暗房 CFA 像素探针与实时 SVG 曲线图，以及 Java 端 `ScalarInputKeyMap`（`ISV_KEY_*` 扫描码映射）、`CapabilityExplorer`（只读反射能力探测）与 `EventStreamReplayer`（JSONL 事件流跨平台幂等重放）。

## M3：Sony α7R II (ILCE-7RM2) 真机安全探测与接入（远期规划 ⏳）

- [ ] 运行只读 Capability Explorer 生成真实的 `docs/hardware/capability-report.md`。
- [ ] 验证 `CameraEx.open`、`SurfaceView` 预览、`ScalarInput` 按键映射、`onPause()` 释放与 Exit Rule 参数还原、SD 卡 8.3 短文件名日志落盘。
