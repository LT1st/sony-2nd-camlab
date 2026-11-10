package com.cameralab.a7r2.adapter;

import com.cameralab.a7r2.port.CameraPort;
import java.util.Locale;

/**
 * M3 Read-Only Capability Explorer (Reflection Probe).
 *
 * Per specification §8.2 & §8.3:
 *   - Never assume com.sony.scalar.hardware.CameraEx, CameraSequence, or DefaultDevelopFilter
 *     exist or behave identically on ILCE-7RM2 without probing.
 *   - Never treat UNKNOWN as AVAILABLE.
 *   - Performs safe, read-only ClassLoader.loadClass() probes without invoking native
 *     methods or writing to hardware partitions, and serializes a capability report JSON
 *     matching docs/hardware/capability-report.md.
 */
public final class CapabilityExplorer {
    public static final class ProbeResult {
        public final boolean cameraExPresent;
        public final boolean scalarInputPresent;
        public final boolean deviceInfoPresent;
        public final boolean cameraSequencePresent;
        public final boolean defaultDevelopFilterPresent;
        public final CameraPort.Capabilities negotiatedCapabilities;

        public ProbeResult(
                boolean cameraExPresent,
                boolean scalarInputPresent,
                boolean deviceInfoPresent,
                boolean cameraSequencePresent,
                boolean defaultDevelopFilterPresent,
                CameraPort.Capabilities negotiatedCapabilities
        ) {
            this.cameraExPresent = cameraExPresent;
            this.scalarInputPresent = scalarInputPresent;
            this.deviceInfoPresent = deviceInfoPresent;
            this.cameraSequencePresent = cameraSequencePresent;
            this.defaultDevelopFilterPresent = defaultDevelopFilterPresent;
            this.negotiatedCapabilities = negotiatedCapabilities;
        }

        public String toReportJson(String expectedModel) {
            return String.format(
                    Locale.US,
                    "{\n"
                            + "  \"reportStatus\": \"%s\",\n"
                            + "  \"expectedModel\": \"%s\",\n"
                            + "  \"probedClasses\": {\n"
                            + "    \"com.sony.scalar.hardware.CameraEx\": %b,\n"
                            + "    \"com.sony.scalar.sysutil.ScalarInput\": %b,\n"
                            + "    \"com.sony.scalar.hardware.CameraSequence\": %b,\n"
                            + "    \"com.sony.scalar.hardware.CameraSequence$DefaultDevelopFilter\": %b\n"
                            + "  },\n"
                            + "  \"negotiated\": {\n"
                            + "    \"liveView\": \"%s\",\n"
                            + "    \"captureJPEG\": \"%s\",\n"
                            + "    \"captureRAW\": \"%s\",\n"
                            + "    \"dspProcessing\": \"%s\"\n"
                            + "  }\n"
                            + "}",
                    cameraExPresent ? "PROBED_SONY_SCALAR_RUNTIME" : "PROBED_HOST_OR_EMULATOR_NO_SCALAR",
                    expectedModel,
                    cameraExPresent,
                    scalarInputPresent,
                    cameraSequencePresent,
                    defaultDevelopFilterPresent,
                    negotiatedCapabilities.liveView.name().toLowerCase(Locale.US),
                    negotiatedCapabilities.captureJPEG.name().toLowerCase(Locale.US),
                    negotiatedCapabilities.captureRAW.name().toLowerCase(Locale.US),
                    negotiatedCapabilities.dspProcessing.name().toLowerCase(Locale.US)
            );
        }
    }

    private static boolean isClassPresent(ClassLoader loader, String fqcn) {
        try {
            Class.forName(fqcn, false, loader);
            return true;
        } catch (ClassNotFoundException ex) {
            return false;
        } catch (LinkageError err) {
            return false;
        }
    }

    public static ProbeResult probeRuntime(ClassLoader loader) {
        ClassLoader effectiveLoader = loader != null ? loader : CapabilityExplorer.class.getClassLoader();
        boolean cameraEx = isClassPresent(effectiveLoader, "com.sony.scalar.hardware.CameraEx");
        boolean scalarInput = isClassPresent(effectiveLoader, "com.sony.scalar.sysutil.ScalarInput");
        boolean deviceInfo = isClassPresent(effectiveLoader, "com.github.ma1co.openmemories.framework.DeviceInfo");
        boolean cameraSeq = isClassPresent(effectiveLoader, "com.sony.scalar.hardware.CameraSequence");
        boolean developFilter = isClassPresent(
                effectiveLoader,
                "com.sony.scalar.hardware.CameraSequence$DefaultDevelopFilter"
        );

        // Even if CameraSequence class exists in classpath, its 42.4MP buffer behavior on A7R2 is UNKNOWN until sandboxed
        CameraPort.CapabilityState liveViewState = cameraEx
                ? CameraPort.CapabilityState.AVAILABLE
                : CameraPort.CapabilityState.SIMULATED;
        CameraPort.CapabilityState jpegState = cameraEx
                ? CameraPort.CapabilityState.AVAILABLE
                : CameraPort.CapabilityState.SIMULATED;
        CameraPort.CapabilityState rawState = cameraSeq
                ? CameraPort.CapabilityState.UNKNOWN
                : CameraPort.CapabilityState.UNAVAILABLE;
        CameraPort.CapabilityState dspState = developFilter
                ? CameraPort.CapabilityState.UNKNOWN
                : CameraPort.CapabilityState.UNAVAILABLE;

        CameraPort.Capabilities caps = new CameraPort.Capabilities(
                cameraEx ? "ILCE-7RM2 (Scalar-Probed)" : "ILCE-7RM2 (Simulated-Fallback)",
                "4.01",
                liveViewState,
                jpegState,
                rawState,
                CameraPort.CapabilityState.UNAVAILABLE,
                dspState
        );

        return new ProbeResult(cameraEx, scalarInput, deviceInfo, cameraSeq, developFilter, caps);
    }
}
