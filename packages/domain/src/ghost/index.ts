import {
  type GhostComparisonMode,
  type GhostSession,
  GhostSessionSchema
} from '@camera-lab/contracts';

export interface GhostTransformParams {
  translationX: number;
  translationY: number;
  scale: number;
  rotationDeg: number;
  opacity: number;
}

export interface AffineMatrix2D {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export function clampGhostParams(
  input: Partial<GhostTransformParams>
): GhostTransformParams {
  const clamp = (val: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Number.isFinite(val) ? val : 0));

  return {
    translationX: Number(clamp(input.translationX ?? 0, -2, 2).toFixed(4)),
    translationY: Number(clamp(input.translationY ?? 0, -2, 2).toFixed(4)),
    scale: Number(clamp(input.scale ?? 1, 0.1, 5).toFixed(4)),
    rotationDeg: Number(clamp(input.rotationDeg ?? 0, -180, 180).toFixed(2)),
    opacity: Number(clamp(input.opacity ?? 0.5, 0, 1).toFixed(2))
  };
}

/**
 * Computes the 2D affine matrix around the canvas center `(width / 2, height / 2)`
 * using normalized translation coordinates (`translationX * width`, `translationY * height`).
 * Identical math is used for both interactive preview and high-res export.
 */
export function computeGhostAffineMatrix(
  params: GhostTransformParams,
  canvasWidth: number,
  canvasHeight: number
): AffineMatrix2D {
  const clean = clampGhostParams(params);
  const rad = (clean.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad) * clean.scale;
  const sin = Math.sin(rad) * clean.scale;

  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  const dx = clean.translationX * canvasWidth;
  const dy = clean.translationY * canvasHeight;

  const tx = cx + dx - (cos * cx - sin * cy);
  const ty = cy + dy - (sin * cx + cos * cy);

  return {
    a: Number(cos.toFixed(6)),
    b: Number(sin.toFixed(6)),
    c: Number((-sin).toFixed(6)),
    d: Number(cos.toFixed(6)),
    tx: Number(tx.toFixed(3)),
    ty: Number(ty.toFixed(3))
  };
}

export function createGhostSession(input: {
  id: string;
  name: string;
  referenceAssetId: string;
  currentAssetId: string;
  params?: Partial<GhostTransformParams>;
  comparisonMode?: GhostComparisonMode;
  nowIso?: string;
}): GhostSession {
  const clamped = clampGhostParams(input.params ?? {});
  return GhostSessionSchema.parse({
    id: input.id,
    name: input.name.trim() || 'Ghost Session',
    referenceAssetId: input.referenceAssetId,
    currentAssetId: input.currentAssetId,
    ...clamped,
    comparisonMode: input.comparisonMode ?? 'overlay',
    updatedAt: input.nowIso ?? new Date().toISOString(),
    version: 1
  });
}

export function updateGhostSession(
  session: GhostSession,
  patch: Partial<GhostTransformParams> & {
    comparisonMode?: GhostComparisonMode;
    name?: string;
    referenceAssetId?: string;
    currentAssetId?: string;
  },
  nowIso?: string
): GhostSession {
  const clamped = clampGhostParams({
    translationX: patch.translationX ?? session.translationX,
    translationY: patch.translationY ?? session.translationY,
    scale: patch.scale ?? session.scale,
    rotationDeg: patch.rotationDeg ?? session.rotationDeg,
    opacity: patch.opacity ?? session.opacity
  });

  return GhostSessionSchema.parse({
    ...session,
    name: patch.name !== undefined ? patch.name : session.name,
    referenceAssetId: patch.referenceAssetId ?? session.referenceAssetId,
    currentAssetId: patch.currentAssetId ?? session.currentAssetId,
    ...clamped,
    comparisonMode: patch.comparisonMode ?? session.comparisonMode,
    updatedAt: nowIso ?? new Date().toISOString(),
    version: session.version + 1
  });
}
