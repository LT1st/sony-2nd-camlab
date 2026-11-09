package com.cameralab.a7r2.adapter;

import com.cameralab.a7r2.port.CameraPort;
import java.util.HashMap;
import java.util.Map;

/**
 * M2 Android Emulator Dummy Camera Adapter.
 * Mirrors OpenMemories-Framework's dummy fallback pattern and enforces the
 * Recipe Lab "Exit Rule" (restoring camera settings on closeSession / onPause).
 */
public final class MockAndroidCameraAdapter implements CameraPort {
    private boolean sessionOpen = false;
    private String activeSessionId = null;
    private final Map<String, String> originalHardwareSettings = new HashMap<String, String>();
    private final Map<String, String> currentHardwareSettings = new HashMap<String, String>();

    public MockAndroidCameraAdapter() {
        originalHardwareSettings.put("colorDepth", "NORMAL");
        originalHardwareSettings.put("driveMode", "SINGLE");
        originalHardwareSettings.put("pictureEffect", "OFF");
        currentHardwareSettings.putAll(originalHardwareSettings);
    }

    @Override
    public Capabilities getCapabilities() {
        // Unverified Sony hardware DSP / rawBuffer capabilities are strictly marked UNAVAILABLE or UNKNOWN, never true
        return new Capabilities(
                "ILCE-7RM2 (M2-Android-Emulator-Dummy)",
                "4.01-emu",
                CapabilityState.SIMULATED,
                CapabilityState.SIMULATED,
                CapabilityState.UNAVAILABLE,
                CapabilityState.UNAVAILABLE,
                CapabilityState.UNAVAILABLE
        );
    }

    @Override
    public String openSession() {
        this.sessionOpen = true;
        this.activeSessionId = "emu-sess-" + System.currentTimeMillis();
        // Simulate BaseActivity.setColorDepth(true) on resume
        this.currentHardwareSettings.put("colorDepth", "HIGH_32BIT");
        return this.activeSessionId;
    }

    public void modifyTemporarySetting(String key, String value) {
        if (!this.sessionOpen) {
            throw new IllegalStateException("SESSION_NOT_OPEN");
        }
        this.currentHardwareSettings.put(key, value);
    }

    @Override
    public void closeSession() {
        // Exit Rule: restore all modified hardware settings back to pre-session state
        this.currentHardwareSettings.clear();
        this.currentHardwareSettings.putAll(this.originalHardwareSettings);
        this.sessionOpen = false;
        this.activeSessionId = null;
    }

    public boolean isSessionOpen() {
        return sessionOpen;
    }

    public String getSetting(String key) {
        return currentHardwareSettings.get(key);
    }
}
