# 样片资产版权与 EXIF 隐私合规策略（Asset Policy）

## 1. 许可准入规则

1. **逐文件核查许可证**：所有随仓库分发的样片（位于 `assets/samples/`、`apps/web/public/assets/samples/` 与 `assets/generated/sample-001/`）必须具备明确的 **CC0 1.0 Public Domain** 或同等允许无条件商业/非商业再分发的自由许可证。
2. **禁止外链热链与未授权抓取**：`fetch-assets.py` 与前端运行时仅加载白名单内的本地缓存资源，不依赖第三方图床热链。
3. **真实 RAW 样片溯源（M1）**：
   - `sample-001` 源自 `https://raw.pixls.us/` 编号 `#1312` 的 **Sony ILCE-7RM2 14-bit compressed (3:2) ARW**，由贡献者 Kelvie Wong 以 **CC0-1.0** 授权发布。
   - 原始 41.31MB ARW 文件（SHA256: `f067629e2b36706e8173e37f3e6e903b4501d97f51ce7ceb43e9d71da929aa54`）按 `.gitignore` 规则不直接提交进 Git，其离线生成的阶段图与完整哈希链保存在 `assets/generated/sample-001/original.meta.json` 与 `pipeline.json`。

## 2. EXIF 隐私与本地导入保护

1. **分发资产零隐私残留**：所有预置样片与 M1 衍生阶段图在生成时均通过 Pillow 重新编码，剥离全部 GPS 经纬度、机身序列号及个人生物特征信息。
2. **用户本地导入零上传**：用户在浏览器内拖入或选择的本地 JPEG/PNG 仅保存在当前浏览器内存与本地 IndexedDB（标记为 `USER_IMPORT`、`canRedistribute: false`），**绝不上传任何远程服务器**。
3. **诊断包默认脱敏**：`/debug` 页面的 `Export Diagnostics Bundle` 默认 `includeImages: false`，自动过滤 `data:image/*`、原始字节、GPS EXIF 与本地文件路径。
