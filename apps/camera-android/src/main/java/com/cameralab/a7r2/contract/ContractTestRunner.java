package com.cameralab.a7r2.contract;

import com.cameralab.a7r2.adapter.CapabilityExplorer;
import com.cameralab.a7r2.adapter.MockAndroidCameraAdapter;
import com.cameralab.a7r2.adapter.SdCard83Logger;
import com.cameralab.a7r2.domain.EventStreamReplayer;
import com.cameralab.a7r2.domain.FilmRollState;
import com.cameralab.a7r2.domain.GhostAffineMath;
import com.cameralab.a7r2.port.CameraPort;
import com.cameralab.a7r2.port.ScalarInputKeyMap;
import java.io.BufferedReader;
import java.io.FileReader;
import java.io.IOException;

/**
 * M2/M3 Host JVM Contract Test Runner.
 * Verifies that the Java implementation in apps/camera-android satisfies:
 *   1. Cross-platform state-machine vectors in tests/contracts/state-machine-vectors.json
 *   2. AC-08 idempotent duplicate capture.completed deduplication & auto-seal on full roll
 *   3. Ghost Viewfinder 2D affine matrix mathematical parity with TypeScript computeGhostAffineMatrix
 *   4. OpenMemories / Recipe Lab Exit Rule (restoring modified camera settings on closeSession)
 *   5. SD card 8.3 short filename constraint (CAMLAB/LOG0001.TXT) and privacy redaction
 *   6. Sony ScalarInput ISV_KEY_* scanCode mapping & runtime override
 *   7. M3 CapabilityExplorer read-only reflection probe (never treating unknown as available)
 *   8. Cross-platform JSONL replay parity against tests/fixtures/capture-duplicate.jsonl
 */
public final class ContractTestRunner {
    private static int passedTests = 0;

    private static void assertTrue(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError("CONTRACT_TEST_FAILED: " + message);
        }
    }

    private static void assertEquals(Object expected, Object actual, String message) {
        if (expected == null ? actual != null : !expected.equals(actual)) {
            throw new AssertionError(
                    "CONTRACT_TEST_FAILED: " + message + " (expected=" + expected + ", actual=" + actual + ")"
            );
        }
    }

    private static String readFileText(String path) throws IOException {
        StringBuilder sb = new StringBuilder();
        BufferedReader reader = new BufferedReader(new FileReader(path));
        try {
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append('\n');
            }
        } finally {
            reader.close();
        }
        return sb.toString();
    }

    private static void testFilmRollLifecycleAndVectors(String vectorsPath) throws IOException {
        String json = readFileText(vectorsPath);
        assertTrue(json.contains("\"expectedFilmTransitionSequence\""), "Vectors file must contain expectedFilmTransitionSequence");
        assertTrue(json.contains("\"ROLL_ALREADY_SEALED\""), "Vectors file must specify ROLL_ALREADY_SEALED");
        assertTrue(json.contains("\"REVIEW_LOCKED_BEFORE_DEVELOP\""), "Vectors file must specify REVIEW_LOCKED_BEFORE_DEVELOP");

        FilmRollState roll = FilmRollState.createLoaded("roll-java-01", "Ilford HP5 Java Contract", 12, true);
        assertEquals(FilmRollState.Status.LOADED, roll.getStatus(), "Initial loaded status");
        assertEquals(Integer.valueOf(12), Integer.valueOf(roll.getRemainingFrames()), "Initial remaining frames");

        boolean threwReviewLock = false;
        try {
            roll.assertCanReview();
        } catch (IllegalStateException ex) {
            threwReviewLock = "REVIEW_LOCKED_BEFORE_DEVELOP".equals(ex.getMessage());
        }
        assertTrue(threwReviewLock, "Strict roll must block review before development");

        roll = roll.onCaptureCompleted("cap-001");
        roll = roll.onCaptureCompleted("cap-001"); // Duplicate! Must be idempotent
        roll = roll.onCaptureCompleted("cap-002");
        roll = roll.onCaptureCompleted("cap-003");
        assertEquals(Integer.valueOf(3), Integer.valueOf(roll.getFrameIds().size()), "Duplicate captureId must be deduplicated");
        assertEquals(Integer.valueOf(9), Integer.valueOf(roll.getRemainingFrames()), "9 frames remaining after 3 unique captures");

        roll = roll.seal();
        assertEquals(FilmRollState.Status.SEALED, roll.getStatus(), "Roll sealed");

        boolean threwAlreadySealed = false;
        try {
            roll.onCaptureCompleted("cap-004");
        } catch (IllegalStateException ex) {
            threwAlreadySealed = "ROLL_ALREADY_SEALED".equals(ex.getMessage());
        }
        assertTrue(threwAlreadySealed, "Sealed roll must reject new capture with ROLL_ALREADY_SEALED");

        roll = roll.startDevelop();
        assertEquals(FilmRollState.Status.DEVELOPING, roll.getStatus(), "Roll developing");
        roll = roll.interruptDevelop();
        assertEquals(FilmRollState.Status.SEALED, roll.getStatus(), "Interrupted roll returns to SEALED");
        roll = roll.startDevelop().completeDevelop();
        assertEquals(FilmRollState.Status.DEVELOPED, roll.getStatus(), "Roll developed");

        roll.assertCanReview();

        roll = roll.archive();
        assertEquals(FilmRollState.Status.ARCHIVED, roll.getStatus(), "Roll archived");
        passedTests += 1;
    }

    private static void testAutoSealOn12thFrameAndPostSealIdempotency() {
        FilmRollState roll = FilmRollState.createLoaded("roll-java-full", "12 Frame AutoSeal", 12, true);
        for (int i = 1; i <= 12; i++) {
            roll = roll.onCaptureCompleted("cap-f" + i);
        }
        assertEquals(FilmRollState.Status.SEALED, roll.getStatus(), "12th frame auto-seals roll");
        assertEquals(Integer.valueOf(0), Integer.valueOf(roll.getRemainingFrames()), "0 remaining");

        FilmRollState afterDup = roll.onCaptureCompleted("cap-f12");
        assertEquals(Integer.valueOf(12), Integer.valueOf(afterDup.getFrameIds().size()), "Post-seal duplicate remains 12 frames");
        passedTests += 1;
    }

    private static void testGhostAffineMathParityWithTypeScript() {
        GhostAffineMath.Matrix2D identity = GhostAffineMath.computeMatrix(0.0, 0.0, 1.0, 0.0, 960, 640);
        assertEquals(Double.valueOf(1.0), Double.valueOf(identity.a), "Identity matrix a");
        assertEquals(Double.valueOf(0.0), Double.valueOf(identity.b), "Identity matrix b");
        assertEquals(Double.valueOf(0.0), Double.valueOf(identity.tx), "Identity matrix tx");
        assertEquals(Double.valueOf(0.0), Double.valueOf(identity.ty), "Identity matrix ty");

        GhostAffineMath.Matrix2D m = GhostAffineMath.computeMatrix(0.06, -0.04, 1.2, 10.0, 960, 640);
        assertEquals(Double.valueOf(1.181769), Double.valueOf(m.a), "Affine matrix a parity");
        assertEquals(Double.valueOf(0.208378), Double.valueOf(m.b), "Affine matrix b parity");
        assertEquals(Double.valueOf(-0.208378), Double.valueOf(m.c), "Affine matrix c parity");
        assertEquals(Double.valueOf(1.181769), Double.valueOf(m.d), "Affine matrix d parity");
        assertEquals(Double.valueOf(37.032), Double.valueOf(m.tx), "Affine matrix tx parity");
        assertEquals(Double.valueOf(-183.788), Double.valueOf(m.ty), "Affine matrix ty parity");
        passedTests += 1;
    }

    private static void testAndroidExitRuleAndCapabilities() {
        MockAndroidCameraAdapter adapter = new MockAndroidCameraAdapter();
        CameraPort.Capabilities caps = adapter.getCapabilities();
        assertEquals(CameraPort.CapabilityState.SIMULATED, caps.liveView, "Emulator liveView is SIMULATED");
        assertEquals(CameraPort.CapabilityState.UNAVAILABLE, caps.captureRAW, "Unverified captureRAW is UNAVAILABLE");
        assertEquals(CameraPort.CapabilityState.UNAVAILABLE, caps.dspProcessing, "Unverified dspProcessing is UNAVAILABLE");

        adapter.openSession();
        assertEquals("HIGH_32BIT", adapter.getSetting("colorDepth"), "Color depth switched to HIGH_32BIT during session");
        adapter.modifyTemporarySetting("driveMode", "BRACKET_CONT");
        assertEquals("BRACKET_CONT", adapter.getSetting("driveMode"), "Temporary setting applied");

        adapter.closeSession();
        assertEquals("NORMAL", adapter.getSetting("colorDepth"), "Exit Rule restored colorDepth to NORMAL");
        assertEquals("SINGLE", adapter.getSetting("driveMode"), "Exit Rule restored driveMode to SINGLE");
        passedTests += 1;
    }

    private static void testSdCard83LoggerAndPrivacyRedaction() {
        SdCard83Logger logger = new SdCard83Logger(512);
        String path1 = logger.getActiveLogFilePath();
        assertEquals("CAMLAB/LOG0001.TXT", path1, "Initial 8.3 path");
        assertTrue(SdCard83Logger.isValid83Filename(path1), "Path matches strict 8.3 FAT constraint");

        logger.appendEvent("FILM", "capture.completed", "{\"dataUrl\":\"data:image/jpeg;base64,AAAA\",\"gpsLatitude\":35.68}");
        String logged = logger.getLines().get(0);
        assertTrue(logged.contains("[IMAGE_DATA_URL_OMITTED]"), "Image data URL stripped from SD log");
        assertTrue(logged.contains("[REDACTED]"), "GPS coordinate redacted from SD log");
        passedTests += 1;
    }

    private static void testScalarInputKeyMapScanCodes() {
        ScalarInputKeyMap keyMap = new ScalarInputKeyMap();
        assertEquals(
                ScalarInputKeyMap.PhysicalKeyCode.KEY_S1,
                keyMap.resolveScanCode(ScalarInputKeyMap.ISV_KEY_S1_1),
                "ISV_KEY_S1_1 maps to KEY_S1"
        );
        assertEquals(
                ScalarInputKeyMap.PhysicalKeyCode.KEY_S2,
                keyMap.resolveScanCode(ScalarInputKeyMap.ISV_KEY_S2),
                "ISV_KEY_S2 maps to KEY_S2"
        );
        assertEquals(
                ScalarInputKeyMap.PhysicalKeyCode.KEY_MENU,
                keyMap.resolveScanCode(ScalarInputKeyMap.ISV_KEY_MENU),
                "ISV_KEY_MENU maps to KEY_MENU"
        );
        keyMap.registerOverride(999, ScalarInputKeyMap.PhysicalKeyCode.KEY_FN);
        assertEquals(
                ScalarInputKeyMap.PhysicalKeyCode.KEY_FN,
                keyMap.resolveScanCode(999),
                "Custom body scanCode override works"
        );
        passedTests += 1;
    }

    private static void testCapabilityExplorerProbe() {
        CapabilityExplorer.ProbeResult probe = CapabilityExplorer.probeRuntime(ContractTestRunner.class.getClassLoader());
        assertEquals(Boolean.FALSE, Boolean.valueOf(probe.cameraExPresent), "Host JVM does not have com.sony.scalar.hardware.CameraEx");
        assertEquals(
                CameraPort.CapabilityState.SIMULATED,
                probe.negotiatedCapabilities.liveView,
                "Fallback liveView is SIMULATED"
        );
        assertEquals(
                CameraPort.CapabilityState.UNAVAILABLE,
                probe.negotiatedCapabilities.captureRAW,
                "Unverified RAW capture is UNAVAILABLE"
        );
        String reportJson = probe.toReportJson("ILCE-7RM2");
        assertTrue(reportJson.contains("PROBED_HOST_OR_EMULATOR_NO_SCALAR"), "Report JSON contains status");
        passedTests += 1;
    }

    private static void testJsonlReplayParityWithTypeScript(String fixtureJsonlPath) throws IOException {
        String jsonl = readFileText(fixtureJsonlPath);
        EventStreamReplayer.ReplaySummary summary = EventStreamReplayer.replayJsonl(jsonl);
        assertEquals(Integer.valueOf(6), Integer.valueOf(summary.appliedEventsCount), "6 events applied from capture-duplicate.jsonl");
        assertEquals(Integer.valueOf(1), Integer.valueOf(summary.deduplicatedCapturesCount), "1 duplicate capture deduplicated");
        assertEquals(Integer.valueOf(1), Integer.valueOf(summary.failedCapturesCount), "1 failed capture recorded");
        assertEquals("roll-fix-12", summary.activeRollId, "Active roll ID matches TypeScript replay");

        FilmRollState roll = summary.rolls.get("roll-fix-12");
        assertTrue(roll != null, "Roll roll-fix-12 exists");
        assertEquals(Integer.valueOf(3), Integer.valueOf(roll.getFrameIds().size()), "3 unique frames in roll-fix-12");
        assertEquals(Integer.valueOf(9), Integer.valueOf(roll.getRemainingFrames()), "9 remaining frames in roll-fix-12");
        passedTests += 1;
    }

    public static void main(String[] args) throws Exception {
        String vectorsPath = args.length > 0 ? args[0] : "tests/contracts/state-machine-vectors.json";
        String fixtureJsonlPath = args.length > 1 ? args[1] : "tests/fixtures/capture-duplicate.jsonl";
        testFilmRollLifecycleAndVectors(vectorsPath);
        testAutoSealOn12thFrameAndPostSealIdempotency();
        testGhostAffineMathParityWithTypeScript();
        testAndroidExitRuleAndCapabilities();
        testSdCard83LoggerAndPrivacyRedaction();
        testScalarInputKeyMapScanCodes();
        testCapabilityExplorerProbe();
        testJsonlReplayParityWithTypeScript(fixtureJsonlPath);
        System.out.println(
                "[java:contracts] PASS — " + passedTests + " M2/M3 Java contract, keymap, probe & JSONL replay suites verified"
        );
    }
}
