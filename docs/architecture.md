# 系统架构与数据流设计（Architecture）

## 1. C4 容器与分层边界

```text
+-----------------------------------------------------------------------------------+
|                              Browser Host (M0 / M1)                               |
|                                                                                   |
|  +-----------------------+    +------------------------+    +------------------+  |
|  |   React UI Pages      |    |  640x480 Camera Shell  |    |   /debug Suite   |  |
|  | (Film/Darkroom/Ghost) |    |  + Physical Key Deck   |    |  (6 Diagnostics) |  |
|  +-----------+-----------+    +-----------+------------+    +--------+---------+  |
|              |                            |                          |            |
|              +----------------------------+--------------------------+            |
|                                           |                                       |
|                                           v                                       |
|  +-----------------------------------------------------------------------------+  |
|  |                     @camera-lab/domain (Pure TypeScript)                    |  |
|  |  - FilmRoll FSM (EMPTY->LOADED->SEALED->DEVELOPING->DEVELOPED->ARCHIVED)    |  |
|  |  - Idempotent Capture Deduplication & Strict No-Review Guard                |  |
|  |  - Darkroom Stage Descriptors & Monotonic Job Cancellation Guard            |  |
|  |  - Ghost 2D Affine Matrix Engine & Deterministic JSONL Event Replayer       |  |
|  +----------------------------------------+------------------------------------+  |
|                                           |                                       |
|              +----------------------------+----------------------------+          |
|              v                            v                            v          |
|  +-----------------------+    +------------------------+    +------------------+  |
|  | @camera-lab/camera-   |    | @camera-lab/image-core |    |  @camera-lab/    |  |
|  | port & adapters-mock  |    |  + Web Worker Pipeline |    |  persistence &   |  |
|  | (MockCamera, Faults)  |    |  + M1 Precomputed RAW  |    |  diagnostics     |  |
|  +-----------------------+    +------------------------+    +------------------+  |
+-----------------------------------------------------------------------------------+
                                            |
                                            | Shared JSON Schemas & Fixtures
                                            v
+-----------------------------------------------------------------------------------+
|                     @camera-lab/contracts (Single Source of Truth)                |
|   schemas/*.schema.json  <===>  apps/camera-android (Future M2/M3 Java Native)    |
+-----------------------------------------------------------------------------------+
```

## 2. 关键数据流

1. **拍摄与幂等计数流（Film OS）**：
   - 用户按下空格或 `S2` 快门 → `CameraPort.capturePhoto(request)` → 发出 `capture.requested` → `capture.started` → `capture.completed`。
   - `applyCaptureCompleted(roll, capture)` 首先检查 `roll.frameIds.includes(captureId)`：若重复到达则直接幂等返回 `deduplicated: true`，不会虚增帧数；若故障注入触发 `capture.failed`，胶卷保持原帧数并提供可恢复重试提示。
2. **暗房双轨显影流（Digital Darkroom）**：
   - **路径 A (`JPEG_SIMULATION`)**：主线程提取工作尺寸 `ImageData`（最长边 <= 720px），通过 `DarkroomProcessorClient` 发送至 `darkroom.worker.ts`；`MonotonicJobGuard` 分配单调递增 token，若用户在计算途中切换照片或拖动滑杆，旧任务结果被标记为 `stale` 并丢弃，绝不污染当前 UI。
   - **路径 B (`RAW_PIPELINE_PRECOMPUTED`)**：离线通过 `tools/assets/prepare-raw.py` 解析 CC0 Sony ILCE-7RM2 14-bit `.ARW`，输出 `stage-00-mosaic.webp` 至 `final.jpg` 及 `pipeline.json`，前端加载阶段产物并展示 SHA256 与 LibRaw 算法参数。
3. **时光重影仿射变换流（Ghost Viewfinder）**：
   - 归一化位移 `(translationX, translationY)`、缩放 `scale`、旋转角 `rotationDeg` 与透明度 `opacity` 通过 `computeGhostAffineMatrix` 生成统一的 2D 仿射变换矩阵，同时驱动实时预览与高分辨率 Canvas 合成导出。
