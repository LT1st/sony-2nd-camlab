# 参考仓库与开源资料源码审阅记录（Source Audit）

- **审阅日期**：2026-11-09
- **项目代号**：`camera-lab`（Sony ILCE-7RM2 / A7R II 摄影体验实验室）
- **审阅原则**：逐仓库核查真实源码路径、最新 commit SHA、许可证边界、已验证 API 与未验证（`UNVERIFIED`）能力，严禁仅凭 README 猜测相机底层行为或复制不兼容许可证代码。

---

## 1. 审阅仓库总览

| 仓库 / 资料 | 分支 / Commit SHA | 提交时间 | 许可证 | 本项目采用策略 |
|---|---|---|---|---|
| [`ma1co/PMCADemo`](https://github.com/ma1co/PMCADemo) | `master` @ `12f34e49d48a1d9496ea3c2792911867ea4c985b` | 2017-03-03 | MIT | 借鉴相机生命周期、按键扫描码与 SurfaceView 预览绑定模式；不直接照搬 UI，仅在 `CameraPort` 与 M2/M3 Android 适配器中对齐语义 |
| [`ma1co/OpenMemories-Framework`](https://github.com/ma1co/OpenMemories-Framework) | `master` @ `f8df3504d8684433a331ee869e64f67cc8be9730` | 2018-05-29 | MIT | 借鉴 `DeviceInfo`、`DisplayManager`、`MediaManager` 的真机/模拟器双实现（Dummy fallback）思想，设计本项目的 `CameraPort` + `MockCameraAdapter` |
| [`ma1co/Sony-PMCA-RE`](https://github.com/ma1co/Sony-PMCA-RE) | `master` @ `a82f5baaa8e9c3d9f28f94699e860fb2e48cc8e0` | 2022-08-18 | MIT | 仅作为远期 M3 APK 安装与 Android API Level 10（2.3.7）~16（4.1）兼容性边界参考；M0/M1 完全不调用任何 USB/安装/固件接口 |
| [`ma1co/OpenMemories-Tweak`](https://github.com/ma1co/OpenMemories-Tweak) | `master` @ `d1acfe8dba7e8cfb1d6faf69549adfbf090dca09` | 2018-02-28 | MIT | 仅了解 SD 卡日志（如 `TWEAKLOG.TXT`）与机身权限边界；本项目不依赖 root、telnet 或隐藏系统分区写操作 |
| [`voxivoid/recipe-lab-sony-pmca`](https://github.com/voxivoid/recipe-lab-sony-pmca) | `main` @ `97d4b30b2bcfa7ef2307fb1dbe192c40d8eb8ce5` | 2026-11-08 | GPL-3.0（含附加署名条款） | **严格隔离代码**：不复制任何源码文件；仅在架构上学习“纯逻辑与 Android API 解耦”“退出时恢复机身设置（Exit Rule）”“SD 卡 8.3 短文件名兼容”的设计思想 |
| [`up209d/open-memories-app-ai`](https://github.com/up209d/open-memories-app-ai) | `main` @ `f2c77da5ab181f8159c2c7c1e2c68c4023297c20` | 2026-07-14 | 未声明（含 Sony 原厂 App 反编译参考） | **严格隔离反编译产物**：不复制任何反编译代码或专有二进制；其针对 A6500 的 `CameraSequence` / `DefaultDevelopFilter` / `OptimizedImage` 全部标记为 `UNVERIFIED`（候选研究项） |
| [`raw.pixls.us`](https://raw.pixls.us/) & [`rawpy`](https://pypi.org/project/rawpy/) | 公开数据 / PyPI `rawpy` (LibRaw wrapper) | 2026-11-09 核查 | CC0（需逐文件核验）/ MIT (`rawpy`) | 用于离线预处理 M1 `RAW_PIPELINE_PRECOMPUTED` 教学阶段图；必须在 `assets/manifest.json` 与 `original.meta.json` 记录 SHA256 与作者许可 |
| [Sony ILCE-7RM2 官方规格](https://www.sony.com/electronics/support/e-mount-body/ilce-7rm2/specifications) | 官方文档 | 2026-11-09 核查 | 商标与商业页面版权归 Sony 所有 | 仅引用公开硬件参数（42.4MP 7952×5304、3:2 全画幅、14-bit ARW、640×480 LCD 逻辑分辨率），不抓取官方商业宣传图片 |

---

## 2. 逐仓关键源码路径与技术结论

### 2.1 `ma1co/PMCADemo`（MIT，Commit `12f34e49`）

- **已审阅关键文件**：
  - `app/src/main/java/com/github/ma1co/pmcademo/app/CameraActivity.java`
  - `app/src/main/java/com/github/ma1co/pmcademo/app/BaseActivity.java`
  - `app/src/main/java/com/github/ma1co/pmcademo/app/Logger.java`
- **源码级事实**：
  1. **相机打开与释放**：`CameraActivity.onResume()` 调用 `camera = CameraEx.open(0, null)` 并注册 `surfaceHolder.addCallback(this)`；`onPause()` 必须调用 `camera.release(); camera = null;`。
  2. **取景预览启动**：`surfaceCreated(SurfaceHolder holder)` 中通过 `camera.getNormalCamera().setPreviewDisplay(holder)` 与 `camera.getNormalCamera().startPreview()` 启动实时取景；`surfaceHolder` 需设置 `SurfaceHolder.SURFACE_TYPE_PUSH_BUFFERS`。
  3. **对焦与快门**：半按快门事件 `onShutterKeyDown()` 触发 `camera.getNormalCamera().autoFocus(null)`，抬起 `onShutterKeyUp()` 触发 `cancelAutoFocus()`；全按快门 `onEnterKeyDown()` 或快门键触发 `camera.getNormalCamera().takePicture(null, null, null)`，且通过 `camera.burstableTakePicture()` / `cancelTakePicture()` 控制状态。
  4. **实体按键分发**：`BaseActivity.onKeyDown(int keyCode, KeyEvent event)` 并非依赖标准 Android `keyCode`，而是读取 **`event.getScanCode()`** 并与 `com.sony.scalar.sysutil.ScalarInput.ISV_KEY_*`（如 `ISV_KEY_UP`、`ISV_KEY_DOWN`、`ISV_KEY_LEFT`、`ISV_KEY_RIGHT`、`ISV_KEY_ENTER`、`ISV_KEY_DELETE`、`ISV_KEY_MENU`、`ISV_KEY_S1_1`、`ISV_KEY_S2`、`ISV_DIAL_1_CLOCKWISE`）匹配。
  5. **显示色深控制**：`BaseActivity` 在 `onResume()` 调用 `setColorDepth(true)`（切换高色深模式以正常渲染图像），在 `onPause()` 恢复 `setColorDepth(false)`。
- **对 `camera-lab` 的架构转化**：
  - 在 `packages/camera-port` 中定义明确的会话生命周期（`openSession` / `closeSession`）与按键抽象（UP/DOWN/LEFT/RIGHT/ENTER/MENU/DELETE/S1/S2/DIAL）。
  - Web 端相机外壳提供 640×480 逻辑屏幕和一一对应的实体按键/键盘快捷键映射。

### 2.2 `ma1co/OpenMemories-Framework`（MIT，Commit `f8df3504`）

- **已审阅关键文件**：
  - `README.md`
  - `framework/src/main/java/com/github/ma1co/openmemories/framework/DeviceInfo.java`
  - `framework/src/main/java/com/github/ma1co/openmemories/framework/DisplayManager.java`
  - `framework/src/main/java/com/github/ma1co/openmemories/framework/MediaManager.java`
  - `stubs/` 目录（Sony `com.sony.scalar.*` 编译期占位接口）
- **源码级事实**：
  1. **真机与模拟器双模抽象**：框架为每个 Sony 专有能力提供真机实现和 Dummy 实现，使应用可以在无 Sony 硬件的标准 Android 模拟器中运行。
  2. **构建链老化风险**：示例 `build.gradle` 依赖已下线的 `jcenter()` 及 `jitpack.io` 的 `-SNAPSHOT` 动态坐标。
  3. **媒体查询边界**：`MediaManager` 支持枚举机内图片，但拍照完成到数据库索引落盘存在异步延迟，不能简单假设 `takePicture()` 返回瞬间立刻能查到最新文件。
- **对 `camera-lab` 的架构转化**：
  - M0 首版绝不引入老旧 Gradle 依赖；通过 TypeScript `CameraPort`、`MediaPort` 与 `MockCameraAdapter` 实现完整的浏览器端离线闭环。
  - M2/M3 Android 端需固定本地编译的 `stubs.jar`，不依赖 `jcenter()`。

### 2.3 `ma1co/Sony-PMCA-RE`（MIT，Commit `a82f5baa`）与 `ma1co/OpenMemories-Tweak`（MIT，Commit `d1acfe8d`）

- **已审阅关键内容**：
  - `Sony-PMCA-RE` 的 README 与 APK 兼容性说明；`OpenMemories-Tweak` 的日志落盘方式。
- **源码级事实**：
  1. Sony PlayMemories Camera Apps 运行在相机内部受限的 Android 环境（初代机型为 Android 2.3.7 API 10，A7R2 / A6500 等较新世代为 Android 4.1 API 16，但 Dalvik VM、内存与系统库依然高度精简）。
  2. 现代 Web 技术栈（React、现代 ES Modules、Web Workers、IndexedDB）无法也不应该通过相机内置旧 WebView 运行。
- **对 `camera-lab` 的架构转化**：
  - 明确写入 ADR-001：Web 版是独立运行的 **产品状态机参考实现与桌面工作台/模拟器**；跨平台复用的唯一真源是 `packages/contracts/schemas/` 下的 JSON Schema、事件流协议与黄金测试向量（fixtures），而非 React UI 代码。

### 2.4 `voxivoid/recipe-lab-sony-pmca`（GPL-3.0 + 附加条款，Commit `97d4b30b`）

- **已审阅关键文件**：
  - `docs/DEVELOPMENT.md`（Source layout, Exit rule, Keys on every body, Unit tests）
- **源码级事实与工程经验**：
  1. **纯函数与 Android 运行时解耦**：该仓库将 `Params.java`、`Recipes.java`、`Favorites.java`、`CustomRecipes.java` 写成无 Android 依赖的纯逻辑类，直接用本地 JVM 单测覆盖；仅 `MainActivity.java` 接触 `CameraEx` 与 Android View。
  2. **Exit Rule（安全退出还原规则）**：机内 App 修改相机参数后，如果不显式还原或处理生命周期中断（如用户按 MENU、拨动模式转盘、断电），可能污染用户原本的原生相机设置。
  3. **SD 卡 FUSE 与 8.3 文件名约束**：机内读写 SD 卡目录时，短路径与大写 8.3 文件名（如 `CAMLAB/LOG0001.TXT`）最具兼容性，且文件写入不能阻塞主线程。
- **许可证合规边界**：
  - 该仓库采用 **GPL-3.0** 且附带署名要求。`camera-lab` **完全不复制其任何 Java 代码、配方表或资源文件**，仅独立实现干净的领域层（`packages/domain`）与契约层（`packages/contracts`）。

### 2.5 `up209d/open-memories-app-ai`（无开源许可 / 含反编译参考，Commit `f2c77da5`）

- **已审阅关键文件**：
  - `README.md`（Target Hardware、Project Structure、Build Environment）
- **源码级事实与风险评估**：
  1. 该仓库主要面向 **Sony A6500（ILCE-6500，CXD90014，Android 4.1 API 16，640×480 屏幕）**，包含 Sony 一方应用（Smooth Reflection、Double Exposure、Live View Grading 等）的反编译研究与 `com.sony.scalar.hardware.CameraSequence`、`DefaultDevelopFilter`、`OptimizedImage` 文档。
  2. **机型差异风险**：A7R2（ILCE-7RM2）虽同属 BIONZ X 世代且屏幕逻辑分辨率同为 640×480，但传感器为 42.4MP 全画幅 BSI CMOS，内部 DSP 内存上限、RAW 缓冲区格式与部分 `CameraSequence` 扩展接口是否与 A6500 完全一致**未经验证**。
- **许可证与安全合规边界**：
  - **严禁复制**该仓库中的任何反编译源码或二进制进 `camera-lab`。
  - 所有涉及 `CameraSequence`、`DefaultDevelopFilter`、`OptimizedImage`、机内 RAW 截获及实时预览帧硬件叠图的能力，在本项目 `CameraCapabilities` 与 `docs/api/sony-playmemories.md` 中一律标记为 **`UNVERIFIED`（M0 Mock 下为 `unavailable`）**。

### 2.6 `raw.pixls.us` 与 `rawpy` / LibRaw

- **核查结论**：
  1. `raw.pixls.us` 提供按相机型号归档的 RAW 样片，大部分采用 CC0 1.0 许可，但也有个别样片附带特定条款，因此必须**逐文件检查并记录 SHA256、作者、源链接和许可证全文**。
  2. 浏览器前端直接解码 42.4MP（约 40MB~85MB）的 Sony 14-bit ARW 文件既缓慢又消耗数百 MB 内存。因此 M1 采用 **离线 Python `rawpy` / NumPy / Pillow 预处理管线（`tools/assets/prepare-raw.py`）**，输出可审计的 6 个阶段图（`stage-00-mosaic` 至 `stage-05-film` + `final.jpg`）与 `pipeline.json`，前端在 `RAW_PIPELINE_PRECOMPUTED` 模式下忠实展示并披露生成参数，绝不谎称是“Sony BIONZ X 原厂 ISP 的硬件实时输出”。

---

## 3. 审阅结论汇总（指导 M0 ~ M3 开发）

1. **Web-First 状态机先行（M0/M1）**：在浏览器内以 640×480 相机逻辑屏 + 桌面工作台双视图完整跑通 **Film OS（胶卷系统）**、**Digital Darkroom（数码暗房：显式区分 `JPEG_SIMULATION` 与 `RAW_PIPELINE_PRECOMPUTED`）**、**Ghost Viewfinder（时光重影）** 与 **`/debug` 六面板诊断系统**。
2. **协议单一真源**：`packages/contracts/schemas/*.schema.json` 作为 Web（TypeScript）与未来 Android（Java）的唯一数据契约真源。
3. **能力诚实协商**：UI 与业务层只能通过 `CameraPort.getCapabilities()` 判断能力（`available | simulated | web-rendered | unavailable | unknown`），严禁将 `unknown` 当作 `available`，严禁在组件中写死硬件分支。
