# Camera Lab · 调试、重放与诊断工具说明

本目录包含脱离相机硬件即可复现和排查问题的命令行与配置工具：

- `replay-events.ts`：读取 JSONL 事件流（如 `tests/fixtures/capture-duplicate.jsonl`），确定性重放 `FilmRoll` 状态机并校验幂等性。运行方式：`pnpm debug:replay -- tests/fixtures/capture-duplicate.jsonl`
- `make-fixture.ts`：生成标准测试向量 JSONL。
- `collect-diagnostics.ts`：生成默认不含私人图像字节与 GPS EXIF 的诊断 ZIP 包。
- `fault-scenarios.json`：`/debug` 页面与自动化测试共用的 9 项故障注入定义。
