package com.cameralab.a7r2.adapter;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * M2/M3 SD Card 8.3 Filename & Privacy Sanitizer Logger.
 * Enforces FAT/FUSE 8.3 uppercase path convention (e.g. CAMLAB/LOG0001.TXT)
 * and strips forbidden private keys before flushing.
 */
public final class SdCard83Logger {
    private final int maxFileSizeBytes;
    private int currentFileIndex = 1;
    private int currentFileBytes = 0;
    private final List<String> lines = new ArrayList<String>();

    public SdCard83Logger(int maxFileSizeBytes) {
        this.maxFileSizeBytes = Math.max(512, maxFileSizeBytes);
    }

    public static String format83Path(int index) {
        int clamped = Math.max(1, Math.min(9999, index));
        return String.format(Locale.US, "CAMLAB/LOG%04d.TXT", clamped);
    }

    public static boolean isValid83Filename(String relativePath) {
        if (relativePath == null) return false;
        String[] parts = relativePath.split("/");
        if (parts.length != 2) return false;
        String dir = parts[0];
        String file = parts[1];
        if (!dir.matches("^[A-Z0-9_]{1,8}$")) return false;
        return file.matches("^[A-Z0-9_]{1,8}\\.[A-Z0-9]{1,3}$");
    }

    public void appendEvent(String domain, String name, String detailsJson) {
        String sanitized = detailsJson
                .replaceAll("\"data:image/[^\"]+\"", "\"[IMAGE_DATA_URL_OMITTED]\"")
                .replaceAll("\"gpsLatitude\"\\s*:\\s*[^,}]+", "\"gpsLatitude\":\"[REDACTED]\"");
        String entry = String.format(Locale.US, "{\"domain\":\"%s\",\"name\":\"%s\",\"details\":%s}", domain, name, sanitized);
        int entryBytes = entry.length() + 1;
        if (currentFileBytes + entryBytes > maxFileSizeBytes) {
            currentFileIndex += 1;
            currentFileBytes = 0;
        }
        currentFileBytes += entryBytes;
        lines.add(entry);
    }

    public String getActiveLogFilePath() {
        return format83Path(currentFileIndex);
    }

    public List<String> getLines() {
        return Collections.unmodifiableList(lines);
    }
}
