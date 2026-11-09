package com.cameralab.a7r2.domain;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Pure Java state model mirroring packages/domain/src/film/index.ts and
 * packages/contracts/schemas/film-roll.schema.json.
 * Zero Android dependencies so it can be unit-tested on host JVM.
 */
public final class FilmRollState {
    public enum Status {
        EMPTY,
        LOADED,
        SEALED,
        DEVELOPING,
        DEVELOPED,
        ARCHIVED
    }

    private final String id;
    private final String name;
    private final int capacity;
    private final boolean strictMode;
    private final Status status;
    private final List<String> frameIds;
    private final int version;

    public FilmRollState(
            String id,
            String name,
            int capacity,
            boolean strictMode,
            Status status,
            List<String> frameIds,
            int version
    ) {
        this.id = id;
        this.name = name;
        this.capacity = capacity;
        this.strictMode = strictMode;
        this.status = status;
        this.frameIds = Collections.unmodifiableList(new ArrayList<String>(frameIds));
        this.version = version;
    }

    public FilmRollState onCaptureCompleted(String captureId) {
        if (this.frameIds.contains(captureId)) {
            return this; // Idempotent deduplication matching AC-08
        }
        if (this.status != Status.LOADED) {
            throw new IllegalStateException("ROLL_ALREADY_SEALED");
        }
        List<String> next = new ArrayList<String>(this.frameIds);
        next.add(captureId);
        Status nextStatus = next.size() >= this.capacity ? Status.SEALED : Status.LOADED;
        return new FilmRollState(
                this.id,
                this.name,
                this.capacity,
                this.strictMode,
                nextStatus,
                next,
                this.version + 1
        );
    }

    public int getRemainingFrames() {
        return Math.max(0, this.capacity - this.frameIds.size());
    }
}
