# Sony ILCE-7RM2 真机硬件能力探测报告模板（Capability Report）

> **当前状态**：`UNVERIFIED_NO_HARDWARE_CONNECTED`（M0 / M1 阶段按规范不连接任何真实相机硬件）。
> 当未来进入 M3 阶段并连接真实 Sony α7R II 时，由只读探测工具填写以下表格：

```json
{
  "reportStatus": "TEMPLATE_UNVERIFIED",
  "probedAt": null,
  "device": {
    "expectedModel": "ILCE-7RM2",
    "actualModel": "UNVERIFIED",
    "firmwareVersion": "UNVERIFIED",
    "androidSdkInt": "UNVERIFIED"
  },
  "capabilities": {
    "cameraExOpen": "UNVERIFIED",
    "surfaceViewPreview": "UNVERIFIED",
    "customCanvasOverlayOnPreview": "UNVERIFIED",
    "scalarInputKeyScanCodes": "UNVERIFIED",
    "sdCard8Dot3Logging": "UNVERIFIED",
    "cameraSequenceRawAccess": "UNVERIFIED",
    "defaultDevelopFilterDsp": "UNVERIFIED"
  },
  "safetyChecklist": {
    "onPauseReleaseVerified": false,
    "exitRuleParameterRestoreVerified": false,
    "originalArwJpegUntouched": true,
    "noRootOrSystemPartitionWrite": true
  }
}
```
