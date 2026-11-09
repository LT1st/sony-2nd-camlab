# Camera Lab · Film & Darkroom (`sony-2nd-camlab`)

**索尼 α7R II（ILCE-7RM2）摄影体验实验室 · Web 模拟工作台、状态机真源与离线 RAW 教学系统**

[![M0/M1 Status](https://img.shields.io/badge/Milestone-M0_%26_M1_Complete-amber)](#)
[![Hardware Dependency](https://img.shields.io/badge/Camera_Hardware-None_(100%25_Offline_Mock)-emerald)](#)

---

## 1. 项目简介与核心原则

`camera-lab` 是一个围绕 **Sony α7R II (ILCE-7RM2)** 构建的摄影操作系统原型（Camera OS Prototype），包含三大紧密协同的核心功能与一套完整的六面板诊断工作台：

1. **Film OS（胶卷操作系统）**：限定 12 / 24 / 36 张定量胶卷；开启真实胶片规则时**拍摄期不可回看**（后台完整保留原始数据）；拍满自动封卷或二次确认提前封卷；进入冲洗室完成显影动画后生成接触印样（Contact Sheet），支持导出 JPEG / PNG 印样。
2. **Digital Darkroom（数码暗房）**：7 阶段交互式显影时间轴（`RAW / SENSOR` → `Black Level` → `Demosaic` → `White Balance` → `Tone` → `Film Look` → `JPEG`）。严格区分两条处理管线：
   - **模式 A：`JPEG_SIMULATION`（M0）**：基于 Web Worker + Canvas 像素缓冲区的实时可调参数管线，显著标注 `SIMULATED · 演示/模拟，非真实传感器 RAW`。
   - **模式 B：`RAW_PIPELINE_PRECOMPUTED`（M1）**：使用来自 `raw.pixls.us` 的 CC0 授权 Sony ILCE-7RM2 14-bit 压缩 `.ARW` 样片，经 `tools/assets/prepare-raw.py` (`rawpy` / LibRaw + NumPy + Pillow) 离线生成的 7 阶段真实 RAW 教学产物，附带完整 SHA256 与算法审计元数据（绝不谎称是 Sony BIONZ X 原厂硬件 ISP 中间帧）。
3. **Ghost Viewfinder（时光重影）**：加载历史参考图与当前重拍图，支持拖拽平移、缩放、旋转、0–100% 透明度调节、按住临时隐藏参考图，以及 `overlay` / `side-by-side` / `split-slider` / `difference` 四种对比模式；对齐会话持久化到 IndexedDB，刷新不丢失，支持导出合成图、左右对照图与变换参数 JSON。
4. **`/debug` 开发者诊断与故障注入台**：包含 **Events 时间线**、**Inspector 状态/能力检查器**、**Fault Injector 故障注入器**（第 4 张拍摄失败、3 秒延迟、重复事件、样片 404、损坏图片、存储已满、显影中断、并行导出冲突）、**JSONL 确定性重放器**、**Performance 性能遥测** 与 **默认脱敏的诊断 ZIP 导出器**。

### 首版安全与诚实边界（M0 / M1）

- **零真实硬件连接**：M0/M1 不连接任何 Sony 相机、不调用 USB/Wi-Fi Remote、不访问浏览器摄像头、不刷写固件、不生成未经验证的 APK。
- **Web 与未来 Android 架构边界**：Sony A7R II 的 PlayMemories Camera Apps 运行在 Android 2.3.7~4.1 (API 10~16) 受限环境中，React Web 应用不可直接打包为机内 APK。跨平台共享的唯一真源是 `packages/contracts/schemas/` 下的 JSON Schema、纯状态机规范与黄金测试向量；未来原生端位于 `apps/camera-android/`。

---

## 2. 快速开始（无需相机硬件）

```bash
# 1. 安装依赖
pnpm install

# 2. 环境自检与授权样片校验
pnpm doctor
pnpm assets:check

# 3. 启动本地开发服务器
pnpm dev

# 4. 运行代码检查、类型检查、单测、事件重放、E2E 测试与生产构建
pnpm lint
pnpm typecheck
pnpm test
pnpm debug:replay -- tests/fixtures/capture-duplicate.jsonl
pnpm test:e2e
pnpm build
```

---

## 3. Monorepo 目录结构

```text
camera-lab/
├── apps/
│   ├── web/                           # M0/M1: React + TypeScript + Vite 相机模拟器与工作台
│   └── camera-android/                # M2/M3: 原生 Java PlayMemories 骨架与端口映射（首版不构建）
├── packages/
│   ├── contracts/                     # JSON Schema 跨平台唯一协议真源 + Zod 校验 + 测试向量
│   ├── domain/                        # 纯 TS 领域状态机：FilmRoll, Darkroom, Ghost 仿射矩阵, JSONL Replay
│   ├── camera-port/                   # CameraPort, MediaPort, StoragePort, ClockPort, 物理按键抽象
│   ├── adapters-mock/                 # MockCameraAdapter, MockMediaAdapter, FaultInjector
│   ├── image-core/                    # 纯像素处理核心（无 UI 依赖，供 Web Worker 与单测调用）
│   ├── persistence/                   # Dexie / IndexedDB 本地持久化与 v1->v2 Schema 迁移
│   ├── diagnostics/                   # 结构化因果日志、Ring Buffer、隐私脱敏与 ZIP 诊断包导出
│   └── ui/                            # 640×480 逻辑相机屏幕外壳、3:2 取景框与机身物理按键面板
├── assets/
│   ├── manifest.json                  # 16 张 CC0 授权样片清单（含 3 组 Ghost 对照与 SHA256）
│   ├── licenses/                      # 逐文件许可证与 EXIF 隐私审计记录
│   ├── samples/                       # 可重分发小尺寸样片
│   └── generated/sample-001/          # M1 Sony ILCE-7RM2 真实 RAW 离线预处理阶段图与 pipeline.json
├── tools/
│   ├── assets/                        # fetch-assets.py, prepare-raw.py (rawpy), validate-assets.py
│   ├── debug/                         # replay-events.ts, make-fixture.ts, collect-diagnostics.ts
│   └── hardware/                      # M3 真机探测占位说明
├── tests/
│   ├── unit/                          # Vitest 核心状态机、幂等去重、仿射矩阵、暗房管线单测
│   ├── integration/                   # IndexedDB 迁移、Mock 故障注入、诊断 ZIP 集成测试
│   ├── e2e/                           # Playwright 端到端验收测试（覆盖 AC-01 ~ AC-12）
│   ├── contracts/                     # 跨平台共享状态机向量
│   └── fixtures/                      # JSONL 重放测试向量
└── docs/                              # 架构设计、ADR、源码审阅、API 证据清单、测试与路线图
```

---

## 4. 文档索引

- [参考仓库源码审阅记录 (`docs/research/source-audit.md`)](./docs/research/source-audit.md)
- [系统架构与数据流 (`docs/architecture.md`)](./docs/architecture.md)
- [ADR-001: 选择 Web-First 状态机与 JSON Schema 跨平台契约 (`docs/decisions/ADR-001-web-first-and-contracts.md`)](./docs/decisions/ADR-001-web-first-and-contracts.md)
- [端口接口与能力协商规范 (`docs/api/camera-port.md`)](./docs/api/camera-port.md)
- [Sony PlayMemories 原生 API 证据等级清单 (`docs/api/sony-playmemories.md`)](./docs/api/sony-playmemories.md)
- [真机能力探测报告模板 (`docs/hardware/capability-report.md`)](./docs/hardware/capability-report.md)
- [素材版权与 EXIF 隐私策略 (`docs/asset-policy.md`)](./docs/asset-policy.md)
- [测试策略与故障注入矩阵 (`docs/testing.md`)](./docs/testing.md)
- [M0 → M3 研发路线图 (`docs/roadmap.md`)](./docs/roadmap.md)
