package com.cameralab.a7r2.domain;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Pure Java state model mirroring packages/domain/src/film/index.ts and
 * packages/contracts/schemas/film-roll.schema.json.
 * Zero Android dependencies so it can be unit-tested on host JVM (Java 7+ compatible).
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

    public static FilmRollState createLoaded(String id, String name, int capacity, boolean strictMode) {
        return new FilmRollState(
                id,
                name,
                capacity,
                strictMode,
                Status.LOADED,
                Collections.<String>emptyList(),
                1
        );
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public int getCapacity() {
        return capacity;
    }

    public boolean isStrictMode() {
        return strictMode;
    }

    public Status getStatus() {
        return status;
    }

    public List<String> getFrameIds() {
        return frameIds;
    }

    public int getVersion() {
        return version;
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

    public FilmRollState seal() {
        if (this.status == Status.SEALED) {
            return this;
        }
        if (this.status != Status.LOADED) {
            throw new IllegalStateException("ROLL_ALREADY_SEALED");
        }
        return new FilmRollState(
                this.id,
                this.name,
                this.capacity,
                this.strictMode,
                Status.SEALED,
                this.frameIds,
                this.version + 1
        );
    }

    public FilmRollState startDevelop() {
        if (this.status != Status.SEALED && this.status != Status.DEVELOPING) {
            throw new IllegalStateException("ROLL_NOT_LOADED");
        }
        return new FilmRollState(
                this.id,
                this.name,
                this.capacity,
                this.strictMode,
                Status.DEVELOPING,
                this.frameIds,
                this.version + 1
        );
    }

    public FilmRollState interruptDevelop() {
        if (this.status != Status.DEVELOPING) {
            return this;
        }
        return new FilmRollState(
                this.id,
                this.name,
                this.capacity,
                this.strictMode,
                Status.SEALED,
                this.frameIds,
                this.version + 1
        );
    }

    public FilmRollState completeDevelop() {
        if (this.status != Status.DEVELOPING && this.status != Status.SEALED) {
            throw new IllegalStateException("DEVELOP_INTERRUPTED");
        }
        return new FilmRollState(
                this.id,
                this.name,
                this.capacity,
                this.strictMode,
                Status.DEVELOPED,
                this.frameIds,
                this.version + 1
        );
    }

    public FilmRollState archive() {
        if (this.status != Status.DEVELOPED) {
            throw new IllegalStateException("ROLL_NOT_LOADED");
        }
        return new FilmRollState(
                this.id,
                this.name,
                this.capacity,
                this.strictMode,
                Status.ARCHIVED,
                this.frameIds,
                this.version + 1
        );
    }

    public void assertCanReview() {
        if (this.strictMode
                && (this.status == Status.EMPTY
                || this.status == Status.LOADED
                || this.status == Status.SEALED
                || this.status == Status.DEVELOPING)) {
            throw new IllegalStateException("REVIEW_LOCKED_BEFORE_DEVELOP");
        }
    }

    public int getRemainingFrames() {
        return Math.max(0, this.capacity - this.frameIds.size());
    }
}
