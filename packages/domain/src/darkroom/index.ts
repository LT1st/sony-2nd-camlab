import {
  DEFAULT_FILM_RECIPE,
  type DarkroomStageId,
  type DevelopJob,
  DevelopJobSchema,
  type FilmPreset,
  type FilmRecipe,
  type ImagePipelineMode
} from '@camera-lab/contracts';

export interface DarkroomStageDescriptor {
  id: DarkroomStageId;
  order: number;
  labelEn: string;
  labelZh: string;
  simulationDescription: string;
  rawPrecomputedDescription: string;
}

export const DARKROOM_STAGES: readonly DarkroomStageDescriptor[] = [
  {
    id: 'RAW_SENSOR',
    order: 0,
    labelEn: 'RAW / SENSOR',
    labelZh: '传感器拜耳马赛克',
    simulationDescription:
      '【演示/模拟 SIMULATED】从 RGB 图像重采样生成 RGGB 拜耳阵列视觉示意，用于理解单通道感光像素排列，非真实传感器 RAW 数据。',
    rawPrecomputedDescription:
      '【真实 RAW 教学管线】由离线 rawpy/LibRaw 读取授权 RAW 文件的未去马赛克 Bayer CFA 阵列生成的缩略可视化（非 Sony BIONZ X 原厂硬件 ISP 中间帧）。'
  },
  {
    id: 'BLACK_LEVEL',
    order: 1,
    labelEn: 'Black Level',
    labelZh: '黑电平校准与线性化',
    simulationDescription:
      '【演示/模拟 SIMULATED】模拟扣除传感器暗电流底噪与线性低反差响应，画面呈低饱和度、暗部抬升状态。',
    rawPrecomputedDescription:
      '【真实 RAW 教学管线】基于 RAW 元数据扣除各通道黑电平（Black Level Subtraction）并执行线性归一化后的阶段图像。'
  },
  {
    id: 'DEMOSAIC',
    order: 2,
    labelEn: 'Demosaic',
    labelZh: '去马赛克插值',
    simulationDescription:
      '【演示/模拟 SIMULATED】还原三通道连续像素并展示未加白平衡与色调曲线前的平淡基底，绝不冒充真实 CFA 去马赛克算法输出。',
    rawPrecomputedDescription:
      '【真实 RAW 教学管线】使用 LibRaw AHD/PPG 去马赛克将单通道 Bayer 阵列重建为全彩 RGB 线性图像（关闭自动亮度拉伸）。'
  },
  {
    id: 'WHITE_BALANCE',
    order: 3,
    labelEn: 'White Balance',
    labelZh: '白平衡与色温色偏校正',
    simulationDescription:
      '【演示/模拟 SIMULATED】应用当前配方的色温（Temperature）与色偏（Tint）通道增益矩阵。',
    rawPrecomputedDescription:
      '【真实 RAW 教学管线】乘以相机记录的 As-Shot 白平衡系数及用户自定义色温/色偏偏移。'
  },
  {
    id: 'TONE',
    order: 4,
    labelEn: 'Tone Curve',
    labelZh: '曝光与特征色调曲线',
    simulationDescription:
      '【演示/模拟 SIMULATED】应用近似 EV 曝光补偿、对比度及 S 型/哑光暗部色调映射曲线。',
    rawPrecomputedDescription:
      '【真实 RAW 教学管线】将线性光信号经过 Gamma 与 S-Curve 色调映射压缩至标准显示动态范围。'
  },
  {
    id: 'FILM_LOOK',
    order: 5,
    labelEn: 'Film Look',
    labelZh: '胶片色彩倾向与银盐颗粒',
    simulationDescription:
      '【演示/模拟 SIMULATED】叠加胶卷预设（Classic Color / Warm Amber / Mono Silver）色彩矩阵与可控银盐颗粒。',
    rawPrecomputedDescription:
      '【真实 RAW 教学管线】在 RAW 显影基础上应用胶片预设色彩分离与颗粒纹理。'
  },
  {
    id: 'JPEG_EXPORT',
    order: 6,
    labelEn: 'JPEG Output',
    labelZh: '最终成片输出',
    simulationDescription:
      '【演示/模拟 SIMULATED】编码输出最终 JPEG 衍生文件，保留原始样片不被修改，并写入 SIMULATED 审计标记。',
    rawPrecomputedDescription:
      '【真实 RAW 教学管线】编码输出最终 JPEG 成片，附带原始 RAW SHA256 与离线管线参数可追溯记录。'
  }
] as const;

export function createRecipeForPreset(preset: FilmPreset): FilmRecipe {
  switch (preset) {
    case 'WARM_AMBER':
      return {
        ...DEFAULT_FILM_RECIPE,
        temperatureShift: 24,
        tintShift: 6,
        contrast: 10,
        saturation: 12,
        toneCurve: 'MATTE_SHADOW',
        grainAmount: 18,
        filmPreset: 'WARM_AMBER'
      };
    case 'MONO_SILVER':
      return {
        ...DEFAULT_FILM_RECIPE,
        temperatureShift: 0,
        tintShift: 0,
        contrast: 22,
        saturation: -100,
        toneCurve: 'S_CURVE_CLASSIC',
        grainAmount: 28,
        filmPreset: 'MONO_SILVER'
      };
    case 'CLASSIC_COLOR':
    default:
      return {
        ...DEFAULT_FILM_RECIPE,
        filmPreset: 'CLASSIC_COLOR'
      };
  }
}

export function createDevelopJob(params: {
  jobId: string;
  assetId: string;
  rollId?: string;
  mode: ImagePipelineMode;
  preset?: FilmPreset;
  recipe?: Partial<FilmRecipe>;
  nowIso?: string;
}): DevelopJob {
  const now = params.nowIso ?? new Date().toISOString();
  const baseRecipe = createRecipeForPreset(params.preset ?? 'CLASSIC_COLOR');
  return DevelopJobSchema.parse({
    jobId: params.jobId,
    assetId: params.assetId,
    rollId: params.rollId,
    mode: params.mode,
    status: 'IDLE',
    currentStage: 'RAW_SENSOR',
    recipe: {
      ...baseRecipe,
      ...params.recipe
    },
    createdAt: now,
    updatedAt: now,
    version: 1
  });
}

export function advanceDevelopStage(current: DarkroomStageId, step: 1 | -1 = 1): DarkroomStageId {
  const index = DARKROOM_STAGES.findIndex((s) => s.id === current);
  const nextIndex = Math.max(0, Math.min(DARKROOM_STAGES.length - 1, index + step));
  return DARKROOM_STAGES[nextIndex]!.id;
}

export class MonotonicJobGuard {
  private latestToken = 0;
  private activeJobId: string | null = null;

  startNewJob(jobId: string): { token: number; jobId: string } {
    this.latestToken += 1;
    this.activeJobId = jobId;
    return { token: this.latestToken, jobId };
  }

  cancelActive(): void {
    this.latestToken += 1;
    this.activeJobId = null;
  }

  isCurrent(token: number, jobId: string): boolean {
    return this.latestToken === token && this.activeJobId === jobId;
  }
}
