# `apps/camera-android` · Sony A7R II (ILCE-7RM2) 原生 PlayMemories App 骨架与工具链冻结说明

> **当前里程碑状态（M0 / M1）**：本目录仅作为 Sprint 6 / M2 / M3 架构骨架与 Java 接口映射规范，**首版不参与 Web 构建，也不向真实相机安装任何 APK。**

## 1. 为什么不能把 React Web 版直接打包成相机 APK？

Sony A7R II（ILCE-7RM2）机内 PlayMemories Camera Apps 运行在高度裁剪的旧版 Android 环境中（API Level 10 ~ 16，Android 2.3.7 兼容层至 Android 4.1 Dalvik VM）：

1. 机内没有现代 Chromium WebView（不支持 ES2022、Web Workers、IndexedDB v2、现代 Canvas 色彩空间管理）。
2. 机身仅提供 **640×480 逻辑屏幕**与**纯物理按键/拨轮**（通过 `com.sony.scalar.sysutil.ScalarInput` 扫描码触发），无触摸屏。
3. 机内 RAM 极度受限，加载 Web 引擎会导致 OOM 或相机看门狗重启。

因此，跨平台复用的唯一真源是：
- `packages/contracts/schemas/*.schema.json`（JSON Schema 协议）
- `tests/contracts/state-machine-vectors.json`（状态机黄金测试向量）
- `packages/domain` 的纯算法与状态转换规则（在 Java 端以无 Android 依赖的纯 POJO 类对等实现）

## 2. 工具链版本冻结（M2 模拟器构建基线）

| 组件 | 冻结版本 | 原因 |
|---|---|---|
| JDK | Eclipse Temurin 1.8 (`1.8.0_422`) | 兼容旧版 Android Gradle Plugin 与 Dalvik 字节码（Java 6/7 sourceLevel） |
| Android Gradle Plugin | `com.android.tools.build:gradle:4.2.2` | 支持 `minSdkVersion 10` / `compileSdkVersion 16` |
| `minSdkVersion` / `targetSdkVersion` | `10` (Android 2.3.7) | 符合 `ma1co/Sony-PMCA-RE` 与 `OpenMemories-Framework` 机身安装校验 |
| `compileSdkVersion` | `16` (Android 4.1) | 覆盖 A7R II 机内 Android 运行时 |
| Sony API Stubs | 本地固定 `openmemories-stubs.jar` | **禁止**使用已下线的 `jcenter()` 或 `-SNAPSHOT` 浮动依赖 |

## 3. TypeScript `CameraPort` 与 Java 原生接口映射表

| Web 端端口 (`packages/camera-port`) | Java 原生接口 (`apps/camera-android`) | 底层 Sony / Android 实现（M3 待真机验证） |
|---|---|---|
| `CameraPort.getCapabilities()` | `CameraPort.getCapabilities()` | `DeviceInfo.getInstance()` + 反射探测 `com.sony.scalar.hardware.CameraEx` |
| `CameraPort.openSession()` | `CameraActivity.onResume()` | `CameraEx.open(0, null)` + `DisplayManager.create(this)` |
| `CameraPort.closeSession()` | `CameraActivity.onPause()` | `cameraEx.release()` + 还原已修改的机身参数（Exit Rule） |
| `CameraPort.capturePhoto()` | `CameraPort.capturePhoto()` | `cameraEx.getNormalCamera().takePicture(null, null, callback)` |
| `PhysicalKeyCode` | `BaseActivity.onKeyDown()` | `event.getScanCode()` 匹配 `ScalarInput.ISV_KEY_*` |
| `DiagnosticsPort.emit()` | `SdCardLogger.append()` | 异步写入 SD 卡 `CAMLAB/LOG0001.TXT`（严格遵守 8.3 文件名与容量滚动） |
