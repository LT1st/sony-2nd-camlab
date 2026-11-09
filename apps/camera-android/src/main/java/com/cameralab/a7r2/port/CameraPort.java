package com.cameralab.a7r2.port;

/**
 * M2/M3 Java Port Interface corresponding 1:1 with packages/camera-port/src/camera/index.ts.
 * Pure interface with zero AndroidX or modern JVM dependencies (compatible with API 10 / Java 7).
 */
public interface CameraPort {
    enum CapabilityState {
        AVAILABLE,
        SIMULATED,
        UNAVAILABLE,
        UNKNOWN
    }

    final class Capabilities {
        public final String deviceModel;
        public final String firmwareVersion;
        public final CapabilityState liveView;
        public final CapabilityState captureJPEG;
        public final CapabilityState captureRAW;
        public final CapabilityState focusDrive;
        public final CapabilityState dspProcessing;

        public Capabilities(
                String deviceModel,
                String firmwareVersion,
                CapabilityState liveView,
                CapabilityState captureJPEG,
                CapabilityState captureRAW,
                CapabilityState focusDrive,
                CapabilityState dspProcessing
        ) {
            this.deviceModel = deviceModel;
            this.firmwareVersion = firmwareVersion;
            this.liveView = liveView;
            this.captureJPEG = captureJPEG;
            this.captureRAW = captureRAW;
            this.focusDrive = focusDrive;
            this.dspProcessing = dspProcessing;
        }
    }

    Capabilities getCapabilities();

    String openSession();

    void closeSession();
}
