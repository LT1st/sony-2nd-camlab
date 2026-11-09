# Sony PlayMemories Camera Apps 原生 API 证据等级与待验证清单

> 更新日期：2026-11-09。本表严格区分“已在开源代码中直接确认的调用”与“仅在逆向文档或其它机型见过的 `UNVERIFIED` 候选接口”。

| 功能领域 | 公开 API / 现有示例 | 证据强度 | M0/M1 状态 | M2/M3 真机验证计划与风险 |
|---|---|---|---|---|
| 打开与释放相机 | `com.sony.scalar.hardware.CameraEx.open(0, null)` / `release()` | **已确认**（`ma1co/PMCADemo` `CameraActivity.java`） | `MockCameraAdapter` 模拟会话 | A7R2 真机必须在 `onPause()` 释放，否则切回原生界面会锁死相机 |
| 实时取景预览 | `getNormalCamera().setPreviewDisplay(holder)` + `startPreview()` | **已确认**（`ma1co/PMCADemo` `CameraActivity.java`） | `simulated`（样片池） | 验证 SurfaceView 上叠加自定义 Canvas 图层（Ghost Overlay）的帧率与色深 |
| 半按快门对焦 | `getNormalCamera().autoFocus(null)` / `cancelAutoFocus()` | **已确认**（`ma1co/PMCADemo` `CameraActivity.java`） | `simulated`（S1 对焦框） | 不同卡口转接环与手动镜头下的回调行为需真机测试 |
| 全按快门拍照 | `getNormalCamera().takePicture(null, null, null)` / `cancelTakePicture()` | **已确认**（`ma1co/PMCADemo` `CameraActivity.java`） | `simulated`（幂等事件流） | 需验证拍照完成到 SD 卡文件可读取的精确关联方式，不能盲目取“最新一张” |
| 设备信息查询 | `DeviceInfo.getInstance().getModel()` / `getFirmwareVersion()` | **已确认**（`OpenMemories-Framework`） | 返回 `ILCE-7RM2 (Simulated)` | M3 启动时首先只读校验型号是否为 `ILCE-7RM2` |
| 显示器管理 | `DisplayManager.create(this)` / `setColorDepth(true)` | **已确认**（`PMCADemo` `BaseActivity.java`） | 640×480 逻辑屏模拟 | 验证 EVF 电子取景器与 LCD 切换时的通知回调 |
| 实体按键扫描码 | `event.getScanCode()` + `ScalarInput.ISV_KEY_*` | **已确认**（`PMCADemo` & `Recipe Lab`） | 键盘 + 屏幕按键面板映射 | 建立独立 `KeyMap`，不硬编码其他机型的 keyCode |
| 退出时参数还原 | Exit Rule（退出前恢复修改过的相机参数槽位） | **已确认架构经验**（`Recipe Lab` `DEVELOPMENT.md`） | 状态机支持安全中断/恢复 | 真机修改任何参数前先备份原始值，`onPause()` 强制还原 |
| 机内 RAW / DSP 滤镜 | `CameraSequence`、`DefaultDevelopFilter`、`OptimizedImage` | **`UNVERIFIED`（仅见于 A6500 逆向资料）** | **`unavailable`** | **严禁假设在 A7R2 可用**；42.4MP 全画幅内存限制与方法签名需只读反射探测 |
| 原生 P/A/S/M 界面常驻 | 无公开稳定接口 | **`UNVERIFIED` / 未知** | **不做** | PlayMemories App 拥有独立 Activity 生命周期，不承诺常驻原生拍摄界面 |
