import { z } from 'zod';

export const AssetOriginSchema = z.enum(['REMOTE_LICENSED', 'USER_IMPORT']);
export type AssetOrigin = z.infer<typeof AssetOriginSchema>;

export const ImagePipelineModeSchema = z.enum([
  'JPEG_SIMULATION',
  'RAW_PIPELINE_PRECOMPUTED'
]);
export type ImagePipelineMode = z.infer<typeof ImagePipelineModeSchema>;

export const FilmRollCapacitySchema = z.union([
  z.literal(12),
  z.literal(24),
  z.literal(36)
]);
export type FilmRollCapacity = z.infer<typeof FilmRollCapacitySchema>;

export const FilmPresetSchema = z.enum([
  'CLASSIC_COLOR',
  'WARM_AMBER',
  'MONO_SILVER'
]);
export type FilmPreset = z.infer<typeof FilmPresetSchema>;

export const FilmRollStatusSchema = z.enum([
  'EMPTY',
  'LOADED',
  'SEALED',
  'DEVELOPING',
  'DEVELOPED',
  'ARCHIVED'
]);
export type FilmRollStatus = z.infer<typeof FilmRollStatusSchema>;

export const FilmRollSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  capacity: FilmRollCapacitySchema,
  preset: FilmPresetSchema,
  strictMode: z.boolean(),
  status: FilmRollStatusSchema,
  frameIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().min(1)
});
export type FilmRoll = z.infer<typeof FilmRollSchema>;

export const ExposureMetaSchema = z.object({
  shutterSpeed: z.string().min(1),
  aperture: z.string().min(1),
  iso: z.number().int().min(50),
  focalLengthMm: z.number().min(1)
});
export type ExposureMeta = z.infer<typeof ExposureMetaSchema>;

export const CaptureSourceSchema = z.enum(['MOCK', 'SONY_CAMERA']);
export type CaptureSource = z.infer<typeof CaptureSourceSchema>;

export const CaptureResultSchema = z.object({
  captureId: z.string().min(1),
  rollId: z.string().min(1),
  frameIndex: z.number().int().min(1),
  assetId: z.string().min(1),
  capturedAt: z.string(),
  source: CaptureSourceSchema,
  mode: ImagePipelineModeSchema,
  originalPreserved: z.boolean(),
  exposureMeta: ExposureMetaSchema
});
export type CaptureResult = z.infer<typeof CaptureResultSchema>;

export const ImageAssetSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  origin: AssetOriginSchema,
  url: z.string().min(1),
  sourceUrl: z.string().optional(),
  downloadUrl: z.string().optional(),
  sha256: z.string().min(8),
  license: z.string().min(1),
  licenseUrl: z.string().min(1),
  author: z.string().min(1),
  attribution: z.string().optional(),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  mimeType: z.string().min(1),
  canRedistribute: z.boolean(),
  cameraModel: z.string().optional(),
  pipelineMode: ImagePipelineModeSchema,
  ghostPairId: z.string().optional(),
  ghostRole: z.enum(['REFERENCE', 'CURRENT']).optional(),
  rawStagesDir: z.string().optional(),
  createdAt: z.string(),
  version: z.number().int().min(1)
});
export type ImageAsset = z.infer<typeof ImageAssetSchema>;

export const DarkroomStageIdSchema = z.enum([
  'RAW_SENSOR',
  'BLACK_LEVEL',
  'DEMOSAIC',
  'WHITE_BALANCE',
  'TONE',
  'FILM_LOOK',
  'JPEG_EXPORT'
]);
export type DarkroomStageId = z.infer<typeof DarkroomStageIdSchema>;

export const ToneCurvePresetSchema = z.enum([
  'LINEAR',
  'S_CURVE_CLASSIC',
  'MATTE_SHADOW',
  'HIGH_KEY'
]);
export type ToneCurvePreset = z.infer<typeof ToneCurvePresetSchema>;

export const FilmRecipeSchema = z.object({
  exposureEv: z.number().min(-3).max(3),
  temperatureShift: z.number().min(-100).max(100),
  tintShift: z.number().min(-100).max(100),
  contrast: z.number().min(-50).max(50),
  saturation: z.number().min(-100).max(100),
  toneCurve: ToneCurvePresetSchema,
  grainAmount: z.number().min(0).max(100),
  filmPreset: FilmPresetSchema,
  jpegQuality: z.number().min(0.5).max(1)
});
export type FilmRecipe = z.infer<typeof FilmRecipeSchema>;

export const DevelopJobStatusSchema = z.enum([
  'IDLE',
  'DEVELOPING',
  'COMPLETED',
  'CANCELLED',
  'FAILED'
]);
export type DevelopJobStatus = z.infer<typeof DevelopJobStatusSchema>;

export const DevelopJobSchema = z.object({
  jobId: z.string().min(1),
  assetId: z.string().min(1),
  rollId: z.string().optional(),
  mode: ImagePipelineModeSchema,
  status: DevelopJobStatusSchema,
  currentStage: DarkroomStageIdSchema,
  recipe: FilmRecipeSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().min(1)
});
export type DevelopJob = z.infer<typeof DevelopJobSchema>;

export const GhostComparisonModeSchema = z.enum([
  'overlay',
  'side-by-side',
  'split-slider',
  'difference'
]);
export type GhostComparisonMode = z.infer<typeof GhostComparisonModeSchema>;

export const GhostSessionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  referenceAssetId: z.string().min(1),
  currentAssetId: z.string().min(1),
  translationX: z.number().min(-2).max(2),
  translationY: z.number().min(-2).max(2),
  scale: z.number().min(0.1).max(5),
  rotationDeg: z.number().min(-180).max(180),
  opacity: z.number().min(0).max(1),
  comparisonMode: GhostComparisonModeSchema,
  updatedAt: z.string(),
  version: z.number().int().min(1)
});
export type GhostSession = z.infer<typeof GhostSessionSchema>;

export const CapabilityStateSchema = z.enum([
  'available',
  'simulated',
  'web-rendered',
  'unavailable',
  'unknown'
]);
export type CapabilityState = z.infer<typeof CapabilityStateSchema>;

export const CameraCapabilitiesSchema = z.object({
  deviceModel: z.string().min(1),
  firmwareVersion: z.string().min(1),
  adapterType: z.enum(['MOCK', 'SONY_ANDROID_STUB', 'SONY_A7R2']),
  screenLogicalSize: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive()
  }),
  sensorAspect: z.literal('3:2'),
  liveView: z.enum(['available', 'simulated', 'unavailable', 'unknown']),
  captureJPEG: z.enum(['available', 'simulated', 'unavailable', 'unknown']),
  captureRAW: z.enum(['available', 'simulated', 'unavailable', 'unknown']),
  rawDemoAssets: z.enum(['available', 'unavailable', 'unknown']),
  keyEvents: z.enum(['available', 'simulated', 'unavailable', 'unknown']),
  previewOverlay: z.enum(['available', 'web-rendered', 'unavailable', 'unknown']),
  focusDrive: z.enum(['available', 'simulated', 'unavailable', 'unknown']),
  rawBuffer: z.enum(['available', 'unavailable', 'unknown']),
  saveToCard: z.enum(['available', 'simulated', 'unavailable', 'unknown']),
  dspProcessing: z.enum(['available', 'unavailable', 'unknown']),
  maxPreviewSize: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive()
  })
});
export type CameraCapabilities = z.infer<typeof CameraCapabilitiesSchema>;

export const DiagnosticDomainSchema = z.enum([
  'FILM',
  'DARKROOM',
  'GHOST',
  'CAMERA',
  'STORAGE',
  'SYSTEM'
]);
export type DiagnosticDomain = z.infer<typeof DiagnosticDomainSchema>;

export const DiagnosticLevelSchema = z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']);
export type DiagnosticLevel = z.infer<typeof DiagnosticLevelSchema>;

export const ErrorCodeSchema = z.enum([
  'ASSET_MISSING',
  'ASSET_CORRUPTED',
  'STORAGE_FULL',
  'CAMERA_BUSY',
  'SHUTTER_FAILED',
  'ROLL_ALREADY_SEALED',
  'ROLL_NOT_LOADED',
  'REVIEW_LOCKED_BEFORE_DEVELOP',
  'DEVELOP_INTERRUPTED',
  'EXPORT_CONFLICT',
  'INVALID_SCHEMA',
  'CAPABILITY_UNAVAILABLE'
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const DiagnosticEventSchema = z.object({
  timestamp: z.string(),
  sessionId: z.string().min(1),
  eventId: z.string().min(1),
  level: DiagnosticLevelSchema,
  domain: DiagnosticDomainSchema,
  name: z.string().min(1),
  rollId: z.string().optional(),
  captureId: z.string().optional(),
  durationMs: z.number().min(0).optional(),
  errorCode: ErrorCodeSchema.optional(),
  adapter: CaptureSourceSchema,
  stateBefore: z.string().optional(),
  stateAfter: z.string().optional(),
  details: z.record(z.unknown())
});
export type DiagnosticEvent = z.infer<typeof DiagnosticEventSchema>;

export const ExportRecordSchema = z.object({
  id: z.string().min(1),
  sourceAssetId: z.string().min(1),
  rollId: z.string().optional(),
  kind: z.enum([
    'DARKROOM_JPEG',
    'DARKROOM_STAGE_SHEET',
    'DARKROOM_RECIPE_JSON',
    'FILM_CONTACT_SHEET',
    'GHOST_COMPOSITE',
    'GHOST_SIDE_BY_SIDE',
    'GHOST_SESSION_JSON'
  ]),
  mode: ImagePipelineModeSchema,
  mimeType: z.string().min(1),
  dataUrl: z.string().min(1),
  filename: z.string().min(1),
  originalPreserved: z.literal(true),
  createdAt: z.string(),
  metadata: z.record(z.unknown())
});
export type ExportRecord = z.infer<typeof ExportRecordSchema>;

export const DEFAULT_FILM_RECIPE: FilmRecipe = {
  exposureEv: 0,
  temperatureShift: 0,
  tintShift: 0,
  contrast: 8,
  saturation: 5,
  toneCurve: 'S_CURVE_CLASSIC',
  grainAmount: 15,
  filmPreset: 'CLASSIC_COLOR',
  jpegQuality: 0.92
};
