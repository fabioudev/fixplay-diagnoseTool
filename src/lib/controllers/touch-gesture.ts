// Touchpad gesture recognition for the DualSense (#57). The controller exposes
// up to two touch points per input report (raw touchpad coords x: 0..1919,
// y: 0..941, each with an `active` flag and a stable finger `id`). This module
// turns that low-level stream into discrete gesture events (tap / swipe /
// hold / two-finger) plus a live "current contact" label, and keeps a short
// per-finger position trail for the visualizer to render as a fading stroke.
//
// All classification is split into a pure `classifyLift` function plus a
// deterministic stateful `TouchGestureTracker` that takes an explicit `now`
// timestamp on every `update()` — so the whole pipeline is unit-testable
// without a controller, timers, or Date.now().
import type { TouchPoint } from './controller-manager';

export type TouchGestureType = 'tap' | 'swipe' | 'hold' | 'two-finger' | 'touch';

export type SwipeDirection = 'links' | 'rechts' | 'oben' | 'unten';

export interface TouchGestureEvent {
  type: TouchGestureType;
  /** Swipe direction; only set for `swipe`. */
  direction?: SwipeDirection;
  /** Contact duration in ms (down→up). 0 for two-finger. */
  durationMs: number;
  /** Net finger travel in raw touchpad units (Euclidean). */
  displacement: number;
  /** Timestamp of the event (the `now` passed to update()). */
  at: number;
}

/** Live contact label (what the finger is doing right now). */
export type TouchContactLabel = 'idle' | 'touch' | 'hold' | 'two-finger';

// Recognition thresholds in raw touchpad units (pad is 1920×942) and ms.
const TAP_MAX_DISPLACEMENT = 80;
const TAP_MAX_DURATION = 250;
const HOLD_MIN_DURATION = 500;
const SWIPE_MIN_DISPLACEMENT = 200;

/**
 * Classify a single finger's down→up contact into a gesture (#57). Pure: given
 * the down position, the last-seen position before lift, the contact duration,
 * and a timestamp, returns the gesture event. A short, small contact is a tap;
 * a long, small contact is a hold; a large-displacement contact is a swipe with
 * a direction derived from the dominant axis (y grows downward, so +dy = unten).
 */
export function classifyLift(
  downX: number,
  downY: number,
  upX: number,
  upY: number,
  durationMs: number,
  at: number
): TouchGestureEvent {
  const dx = upX - downX;
  const dy = upY - downY;
  const displacement = Math.hypot(dx, dy);

  if (displacement < TAP_MAX_DISPLACEMENT && durationMs < TAP_MAX_DURATION) {
    return { type: 'tap', durationMs, displacement, at };
  }
  if (displacement < SWIPE_MIN_DISPLACEMENT) {
    return { type: 'hold', durationMs, displacement, at };
  }
  const direction: SwipeDirection =
    Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'rechts' : 'links') : dy > 0 ? 'unten' : 'oben';
  return { type: 'swipe', direction, durationMs, displacement, at };
}

interface FingerState {
  downAt: number;
  downX: number;
  downY: number;
  lastX: number;
  lastY: number;
  active: boolean;
}

/** A single fading trail sample (normalized 0..1 pad coords) for rendering. */
export interface TrailPoint {
  x: number;
  y: number;
}

/**
 * Stateful touchpad gesture tracker (#57). Feed it the current `TouchPoint[]`
 * from each input report plus a `now` timestamp; it accumulates per-finger
 * down/lift state, emits a `TouchGestureEvent` on each lift and on a
 * two-finger contact onset, exposes the live contact label, and keeps a short
 * normalized position trail per finger for the visualizer.
 *
 * Deterministic: the only time source is the `now` argument, so it tests
 * cleanly with synthetic timestamps.
 */
export class TouchGestureTracker {
  private fingers = new Map<number, FingerState>();
  private lastTwoFinger = false;

  /** Capped ring of recent gesture events (newest first). */
  events: TouchGestureEvent[] = [];
  private readonly maxEvents = 8;

  /** Live contact label, updated on every `update()`. */
  label: TouchContactLabel = 'idle';

  /** Per-finger fading trail (normalized 0..1), newest last. Capped per finger. */
  trails: TrailPoint[][] = [[], []];
  private readonly maxTrail = 24;

  private push(ev: TouchGestureEvent): void {
    this.events.unshift(ev);
    if (this.events.length > this.maxEvents) this.events.length = this.maxEvents;
  }

  private norm(x: number, y: number): TrailPoint {
    return { x: x / 1919, y: y / 941 };
  }

  private appendTrail(finger: number, x: number, y: number): void {
    const t = this.trails[finger] ?? (this.trails[finger] = []);
    const p = this.norm(x, y);
    const last = t[t.length - 1];
    // Skip near-duplicate samples so a held finger doesn't fill the trail.
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.004) return;
    t.push(p);
    if (t.length > this.maxTrail) t.shift();
  }

  /**
   * Ingest one input report's touch points. `now` is the caller's timestamp
   * (ms) — pass `Date.now()` from the UI, a synthetic value in tests.
   */
  update(points: TouchPoint[], now: number): void {
    const active = points.filter((p) => p.active);

    // Two-finger onset event.
    const twoFinger = active.length >= 2;
    if (twoFinger && !this.lastTwoFinger) {
      this.push({ type: 'two-finger', durationMs: 0, displacement: 0, at: now });
    }
    this.lastTwoFinger = twoFinger;

    const seen = new Set<number>();
    for (const p of active) {
      seen.add(p.id);
      const f = this.fingers.get(p.id);
      if (!f) {
        this.fingers.set(p.id, {
          downAt: now,
          downX: p.x,
          downY: p.y,
          lastX: p.x,
          lastY: p.y,
          active: true,
        });
        // Start a fresh trail on a new contact.
        this.trails[p.id] = [this.norm(p.x, p.y)];
      } else {
        f.lastX = p.x;
        f.lastY = p.y;
        this.appendTrail(p.id, p.x, p.y);
      }
    }

    // Lifts: fingers that were active but are no longer present.
    for (const [id, f] of this.fingers) {
      if (f.active && !seen.has(id)) {
        f.active = false;
        const ev = classifyLift(f.downX, f.downY, f.lastX, f.lastY, now - f.downAt, now);
        this.push(ev);
      }
    }

    // Live label.
    if (twoFinger) {
      this.label = 'two-finger';
    } else if (active.length === 1) {
      const f = this.fingers.get(active[0].id);
      if (f) {
        const dur = now - f.downAt;
        const disp = Math.hypot(f.lastX - f.downX, f.lastY - f.downY);
        this.label = dur > HOLD_MIN_DURATION && disp < TAP_MAX_DISPLACEMENT ? 'hold' : 'touch';
      } else {
        this.label = 'idle';
      }
    } else {
      this.label = 'idle';
    }
  }

  /** Clear all state (e.g. on controller disconnect). */
  reset(): void {
    this.fingers.clear();
    this.lastTwoFinger = false;
    this.events = [];
    this.label = 'idle';
    this.trails = [[], []];
  }
}
