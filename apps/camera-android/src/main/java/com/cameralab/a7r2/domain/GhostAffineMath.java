package com.cameralab.a7r2.domain;

/**
 * Pure Java 2D affine matrix calculator mirroring packages/domain/src/ghost/index.ts.
 * Zero Android dependencies, compatible with Java 7 / API 10+.
 */
public final class GhostAffineMath {
    public static final class Matrix2D {
        public final double a;
        public final double b;
        public final double c;
        public final double d;
        public final double tx;
        public final double ty;

        public Matrix2D(double a, double b, double c, double d, double tx, double ty) {
            this.a = a;
            this.b = b;
            this.c = c;
            this.d = d;
            this.tx = tx;
            this.ty = ty;
        }
    }

    private static double clamp(double val, double min, double max) {
        if (Double.isNaN(val) || Double.isInfinite(val)) {
            return 0.0;
        }
        return Math.min(max, Math.max(min, val));
    }

    private static double roundTo(double val, int decimals) {
        return new java.math.BigDecimal(Double.toString(val))
                .setScale(decimals, java.math.RoundingMode.HALF_UP)
                .doubleValue();
    }

    public static Matrix2D computeMatrix(
            double translationX,
            double translationY,
            double scale,
            double rotationDeg,
            int canvasWidth,
            int canvasHeight
    ) {
        double cleanTx = roundTo(clamp(translationX, -2.0, 2.0), 4);
        double cleanTy = roundTo(clamp(translationY, -2.0, 2.0), 4);
        double cleanScale = roundTo(clamp(scale, 0.1, 5.0), 4);
        double cleanRot = roundTo(clamp(rotationDeg, -180.0, 180.0), 2);

        double rad = (cleanRot * Math.PI) / 180.0;
        double cos = Math.cos(rad) * cleanScale;
        double sin = Math.sin(rad) * cleanScale;

        double cx = canvasWidth / 2.0;
        double cy = canvasHeight / 2.0;
        double dx = cleanTx * canvasWidth;
        double dy = cleanTy * canvasHeight;

        double tx = cx + dx - (cos * cx - sin * cy);
        double ty = cy + dy - (sin * cx + cos * cy);

        return new Matrix2D(
                roundTo(cos, 6),
                roundTo(sin, 6),
                roundTo(-sin, 6),
                roundTo(cos, 6),
                roundTo(tx, 3),
                roundTo(ty, 3)
        );
    }
}
