export interface ClockPort {
  nowIso(): string;
  nowMs(): number;
}

export class SystemClock implements ClockPort {
  nowIso(): string {
    return new Date().toISOString();
  }
  nowMs(): number {
    return Date.now();
  }
}
