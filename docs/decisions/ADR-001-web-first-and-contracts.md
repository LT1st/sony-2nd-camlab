# ADR-001：采用 Web-First 状态机与 JSON Schema 跨平台契约

- **状态**：已采纳（2026-11-09）
- **背景**：项目远期目标是在 Sony α7R II (ILCE-7RM2) 机内 PlayMemories Android 环境运行，但相机内部 Android 版本老旧（API 10~16）、无现代 WebView、调试链路慢且直接操作真机存在风险。
- **决策**：
  1. **M0 / M1 采用 Web-First（React + TypeScript + Vite + Vitest + Playwright）** 完整实现并验证三大模块（Film OS、Digital Darkroom、Ghost Viewfinder）与 `/debug` 故障注入诊断台。
  2. **跨平台唯一协议真源为 `packages/contracts/schemas/*.schema.json`** 与 `tests/contracts/state-machine-vectors.json`，不把 React 组件或现代 Web API 当作机内 APK 实现。
  3. **未来 M2 / M3 在 `apps/camera-android` 中使用纯 Java + OpenMemories-Framework** 独立实现 UI 与硬件适配层，直接消费相同的 JSON 契约与状态机测试向量。
- **后果**：无需任何相机硬件即可在任意桌面环境用 `pnpm install && pnpm dev` 完整验证产品体验与异常恢复逻辑，同时彻底消除了在 M0 阶段误伤真实相机的风险。
