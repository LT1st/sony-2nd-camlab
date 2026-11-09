# `CameraPort` 端口接口与能力协商规范

## 1. 设计目标

隔离 UI / 领域状态机与底层硬件实现。业务代码严禁判断当前是 `MOCK` 还是 `SONY_CAMERA`，只能通过 `CameraPort`、`MediaPort`、`StoragePort`、`DiagnosticsPort` 调用，并依据 `CameraCapabilities` 动态启用或禁用功能。

## 2. `CameraCapabilities` 状态取值

每个能力字段仅允许取以下显式枚举值之一：
- `available`：真实硬件已验证可用
- `simulated`：M0/M1 模拟实现可用
- `web-rendered`：由前端 Canvas/CSS 合成渲染
- `unavailable`：当前环境不可用
- `unknown`：尚未探测验证（**客户端必须将 `unknown` 当作不可用处理，严禁默认当成 `true`**）

## 3. M0 Mock 默认协商表

| 字段 | M0 Mock 值 | 说明 |
|---|---|---|
| `deviceModel` | `ILCE-7RM2 (Simulated)` | 模拟机身型号 |
| `screenLogicalSize` | `{ width: 640, height: 480 }` | Sony Alpha 3.0 英寸 LCD 逻辑像素 |
| `sensorAspect` | `3:2` | 全画幅 3:2 传感器画幅比 |
| `liveView` | `simulated` | 从合法授权样片池提供模拟取景 |
| `captureJPEG` | `simulated` | 模拟快门曝光与落盘 |
| `captureRAW` | `unavailable` | 模拟器不产生实时相机 RAW 字节流 |
| `rawDemoAssets` | `available` | 提供 M1 离线预处理的真实 Sony ILCE-7RM2 RAW 阶段资产 |
| `previewOverlay` | `web-rendered` | Ghost Viewfinder 采用 Web 图层叠加 |
| `focusDrive` | `unavailable` | M0 无物理镜头马达驱动 |
| `dspProcessing` | `unavailable` | 不调用 Sony BIONZ X 专有 DSP |
