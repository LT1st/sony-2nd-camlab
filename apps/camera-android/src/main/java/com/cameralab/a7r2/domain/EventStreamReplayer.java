package com.cameralab.a7r2.domain;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pure Java Deterministic JSONL Event Replayer.
 *
 * Mirrors packages/domain/src/events/index.ts `replayEventsJsonl` so that the exact same
 * JSONL diagnostic logs (e.g. `tests/fixtures/capture-duplicate.jsonl`) produce identical
 * FilmRollState, appliedEventsCount, deduplicatedCapturesCount, and failedCapturesCount
 * on both Web (TypeScript) and Android/JVM (Java).
 */
public final class EventStreamReplayer {
    public static final class ReplaySummary {
        public final int appliedEventsCount;
        public final int deduplicatedCapturesCount;
        public final int failedCapturesCount;
        public final String activeRollId;
        public final Map<String, FilmRollState> rolls;

        public ReplaySummary(
                int appliedEventsCount,
                int deduplicatedCapturesCount,
                int failedCapturesCount,
                String activeRollId,
                Map<String, FilmRollState> rolls
        ) {
            this.appliedEventsCount = appliedEventsCount;
            this.deduplicatedCapturesCount = deduplicatedCapturesCount;
            this.failedCapturesCount = failedCapturesCount;
            this.activeRollId = activeRollId;
            this.rolls = rolls;
        }
    }

    private static final Pattern STRING_FIELD_PATTERN = Pattern.compile("\"([a-zA-Z0-9_]+)\"\\s*:\\s*\"([^\"]*)\"");
    private static final Pattern INT_FIELD_PATTERN = Pattern.compile("\"capacity\"\\s*:\\s*(12|24|36)");
    private static final Pattern BOOL_STRICT_PATTERN = Pattern.compile("\"strictMode\"\\s*:\\s*(true|false)");

    private static String extractString(String line, String key) {
        Matcher m = STRING_FIELD_PATTERN.matcher(line);
        while (m.find()) {
            if (key.equals(m.group(1))) {
                return m.group(2);
            }
        }
        return null;
    }

    private static int extractCapacity(String line) {
        Matcher m = INT_FIELD_PATTERN.matcher(line);
        if (m.find()) {
            return Integer.parseInt(m.group(1));
        }
        return 12;
    }

    private static boolean extractStrictMode(String line) {
        Matcher m = BOOL_STRICT_PATTERN.matcher(line);
        if (m.find()) {
            return Boolean.parseBoolean(m.group(1));
        }
        return true;
    }

    public static ReplaySummary replayJsonl(String jsonlText) {
        Map<String, FilmRollState> rolls = new LinkedHashMap<String, FilmRollState>();
        String activeRollId = null;
        int applied = 0;
        int deduplicated = 0;
        int failed = 0;

        String[] lines = jsonlText.split("\\r?\\n");
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.isEmpty()) continue;

            String name = extractString(line, "name");
            String rollId = extractString(line, "rollId");
            String captureId = extractString(line, "captureId");
            if (name == null) continue;

            applied += 1;

            if ("roll.created".equals(name) && rollId != null) {
                int cap = extractCapacity(line);
                boolean strict = extractStrictMode(line);
                FilmRollState created = FilmRollState.createLoaded(rollId, "Replayed Roll", cap, strict);
                rolls.put(rollId, created);
                activeRollId = rollId;
            } else if ("capture.completed".equals(name) && rollId != null && captureId != null) {
                FilmRollState current = rolls.get(rollId);
                if (current != null) {
                    int beforeCount = current.getFrameIds().size();
                    FilmRollState next = current.onCaptureCompleted(captureId);
                    if (next.getFrameIds().size() == beforeCount) {
                        deduplicated += 1;
                    }
                    rolls.put(rollId, next);
                }
            } else if ("capture.failed".equals(name)) {
                failed += 1;
            } else if ("roll.sealed".equals(name) && rollId != null) {
                FilmRollState current = rolls.get(rollId);
                if (current != null) {
                    rolls.put(rollId, current.seal());
                }
            } else if ("develop.started".equals(name) && rollId != null) {
                FilmRollState current = rolls.get(rollId);
                if (current != null) {
                    rolls.put(rollId, current.startDevelop());
                }
            } else if ("develop.interrupted".equals(name) && rollId != null) {
                FilmRollState current = rolls.get(rollId);
                if (current != null) {
                    rolls.put(rollId, current.interruptDevelop());
                }
            } else if ("develop.completed".equals(name) && rollId != null) {
                FilmRollState current = rolls.get(rollId);
                if (current != null) {
                    rolls.put(rollId, current.completeDevelop());
                }
            } else if ("roll.archived".equals(name) && rollId != null) {
                FilmRollState current = rolls.get(rollId);
                if (current != null) {
                    rolls.put(rollId, current.archive());
                }
            }
        }

        return new ReplaySummary(applied, deduplicated, failed, activeRollId, rolls);
    }
}
