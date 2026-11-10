package com.cameralab.a7r2.port;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/**
 * M2/M3 Sony PlayMemories ScalarInput ScanCode KeyMap.
 *
 * Per docs/research/source-audit.md §2.1 (ma1co/PMCADemo BaseActivity.java & ScalarInput):
 * Sony cameras dispatch hardware button presses via KeyEvent.getScanCode() matching
 * com.sony.scalar.sysutil.ScalarInput.ISV_KEY_* constants rather than standard Android keyCode.
 *
 * This class provides a pure, configurable scanCode -> PhysicalKeyCode table with
 * default Sony Alpha (A7R2 / A6000 / RX100 series) ISV_KEY_* constants and allows
 * runtime override if a body reports custom scanCodes.
 */
public final class ScalarInputKeyMap {
    public enum PhysicalKeyCode {
        KEY_UP,
        KEY_DOWN,
        KEY_LEFT,
        KEY_RIGHT,
        KEY_ENTER,
        KEY_MENU,
        KEY_FN,
        KEY_PLAY,
        KEY_DELETE,
        KEY_S1,
        KEY_S2,
        DIAL_CW,
        DIAL_CCW
    }

    // Canonical com.sony.scalar.sysutil.ScalarInput ISV_KEY_* scanCodes from OpenMemories-Framework stubs
    public static final int ISV_KEY_UP = 103;
    public static final int ISV_KEY_DOWN = 108;
    public static final int ISV_KEY_LEFT = 105;
    public static final int ISV_KEY_RIGHT = 106;
    public static final int ISV_KEY_ENTER = 232;
    public static final int ISV_KEY_MENU = 514;
    public static final int ISV_KEY_FN = 520;
    public static final int ISV_KEY_PLAY = 207;
    public static final int ISV_KEY_DELETE = 595;
    public static final int ISV_KEY_S1_1 = 516;
    public static final int ISV_KEY_S2 = 518;
    public static final int ISV_DIAL_1_CLOCKWISE = 525;
    public static final int ISV_DIAL_1_COUNTERCW = 526;

    private final Map<Integer, PhysicalKeyCode> scanCodeMap;

    public ScalarInputKeyMap() {
        Map<Integer, PhysicalKeyCode> map = new HashMap<Integer, PhysicalKeyCode>();
        map.put(Integer.valueOf(ISV_KEY_UP), PhysicalKeyCode.KEY_UP);
        map.put(Integer.valueOf(ISV_KEY_DOWN), PhysicalKeyCode.KEY_DOWN);
        map.put(Integer.valueOf(ISV_KEY_LEFT), PhysicalKeyCode.KEY_LEFT);
        map.put(Integer.valueOf(ISV_KEY_RIGHT), PhysicalKeyCode.KEY_RIGHT);
        map.put(Integer.valueOf(ISV_KEY_ENTER), PhysicalKeyCode.KEY_ENTER);
        map.put(Integer.valueOf(ISV_KEY_MENU), PhysicalKeyCode.KEY_MENU);
        map.put(Integer.valueOf(ISV_KEY_FN), PhysicalKeyCode.KEY_FN);
        map.put(Integer.valueOf(ISV_KEY_PLAY), PhysicalKeyCode.KEY_PLAY);
        map.put(Integer.valueOf(ISV_KEY_DELETE), PhysicalKeyCode.KEY_DELETE);
        map.put(Integer.valueOf(ISV_KEY_S1_1), PhysicalKeyCode.KEY_S1);
        map.put(Integer.valueOf(ISV_KEY_S2), PhysicalKeyCode.KEY_S2);
        map.put(Integer.valueOf(ISV_DIAL_1_CLOCKWISE), PhysicalKeyCode.DIAL_CW);
        map.put(Integer.valueOf(ISV_DIAL_1_COUNTERCW), PhysicalKeyCode.DIAL_CCW);
        this.scanCodeMap = map;
    }

    public PhysicalKeyCode resolveScanCode(int scanCode) {
        return scanCodeMap.get(Integer.valueOf(scanCode));
    }

    public void registerOverride(int scanCode, PhysicalKeyCode key) {
        if (key == null) {
            throw new IllegalArgumentException("PhysicalKeyCode cannot be null");
        }
        scanCodeMap.put(Integer.valueOf(scanCode), key);
    }

    public Map<Integer, PhysicalKeyCode> getSnapshot() {
        return Collections.unmodifiableMap(new HashMap<Integer, PhysicalKeyCode>(scanCodeMap));
    }
}
