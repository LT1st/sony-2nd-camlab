# AGENTS.md · Camera Lab AI 研发与工程守则

1. **硬件安全红线**：M0/M1 阶段严禁连接真实 Sony 相机、严禁编写刷写固件或修改相机系统分区代码。
2. **严禁混淆模拟与真实 RAW**：
   - `JPEG_SIMULATION` 必须在 UI、导出记录和日志中标注 `SIMULATED`。
   - `RAW_PIPELINE_PRECOMPUTED` 必须使用 `tools/assets/prepare-raw.py` 离线处理合规授权的 RAW 文件，并在 `pipeline.json` 中披露 `rawpy`/LibRaw 参数，严禁声称是 Sony BIONZ X 原厂硬件 ISP 输出。
3. **端口与适配器解耦**：React 组件严禁出现 `if (mock) ... else if (sony) ...`；所有设备交互必须通过 `@camera-lab/camera-port` 接口与 `CameraCapabilities` 协商。
4. **原始数据神圣不可侵犯**：无论是“拍摄期不可回看”、冲洗中断、存储满故障还是暗房导出，都不得覆盖或删除原始拍摄资产。
5. **每次提交前验证**：运行 `pnpm preflight`（包含 `doctor`、`assets:check`、`lint`、`typecheck`、`test`、`debug:replay`、`build`）。
