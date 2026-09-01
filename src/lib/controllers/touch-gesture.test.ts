import { describe, it, expect } from 'vitest';
import { classifyLift, TouchGestureTracker } from './touch-gesture';
import type { TouchPoint } from './controller-manager';

/** Build a TouchPoint (active by default) at raw pad coords. */
function pt(id: number, x: number, y: number, active = true): TouchPoint {
  return { active, id, x, y };
}

describe('classifyLift (#57)', () => {
  it('classifies a short, small contact as a tap', () => {
    const ev = classifyLift(100, 100, 130, 120, 100, 1000);
    expect(ev.type).toBe('tap');
    expect(ev.direction).toBeUndefined();
    expect(ev.durationMs).toBe(100);
  });

  it('classifies a long, small-displacement contact as a hold', () => {
    const ev = classifyLift(500, 400, 540, 430, 800, 5000);
    expect(ev.type).toBe('hold');
    expect(ev.durationMs).toBe(800);
  });

  it('classifies a large horizontal travel as a right swipe', () => {
    const ev = classifyLift(100, 400, 900, 410, 150, 2000);
    expect(ev.type).toBe('swipe');
    expect(ev.direction).toBe('rechts');
  });

  it('classifies a large leftward travel as a left swipe', () => {
    const ev = classifyLift(900, 400, 100, 410, 150, 2000);
    expect(ev.direction).toBe('links');
  });

  it('classifies a large downward travel as a down swipe (y grows down)', () => {
    const ev = classifyLift(400, 100, 410, 800, 150, 2000);
    expect(ev.direction).toBe('unten');
  });

  it('classifies a large upward travel as an up swipe', () => {
    const ev = classifyLift(400, 800, 410, 100, 150, 2000);
    expect(ev.direction).toBe('oben');
  });
});

describe('TouchGestureTracker (#57)', () => {
  it('emits a tap on a quick down→up with small travel', () => {
    const t = new TouchGestureTracker();
    t.update([pt(0, 100, 100)], 0);
    t.update([], 100);
    expect(t.events[0].type).toBe('tap');
    expect(t.label).toBe('idle');
  });

  it('emits a swipe on a large-travel down→up', () => {
    const t = new TouchGestureTracker();
    t.update([pt(0, 100, 400)], 0);
    t.update([pt(0, 900, 410)], 100);
    t.update([], 250);
    expect(t.events[0].type).toBe('swipe');
    expect(t.events[0].direction).toBe('rechts');
  });

  it('emits a two-finger event when a second finger lands', () => {
    const t = new TouchGestureTracker();
    t.update([pt(0, 100, 100)], 0);
    t.update([pt(0, 100, 100), pt(1, 1500, 800)], 50);
    expect(t.events[0].type).toBe('two-finger');
    expect(t.label).toBe('two-finger');
  });

  it('reports a hold label while one finger rests stationary past the threshold', () => {
    const t = new TouchGestureTracker();
    t.update([pt(0, 500, 400)], 0);
    t.update([pt(0, 502, 401)], 600);
    expect(t.label).toBe('hold');
  });

  it('reports a touch label while one finger moves before the hold threshold', () => {
    const t = new TouchGestureTracker();
    t.update([pt(0, 500, 400)], 0);
    t.update([pt(0, 700, 400)], 200);
    expect(t.label).toBe('touch');
  });

  it('caps the event log and the per-finger trail', () => {
    const t = new TouchGestureTracker();
    // Many taps in place.
    for (let i = 0; i < 20; i++) {
      t.update([pt(0, 100, 100)], i * 200);
      t.update([], i * 200 + 50);
    }
    expect(t.events.length).toBeLessThanOrEqual(8);
    // Long swipe to fill the trail with many distinct samples.
    t.update([pt(0, 0, 0)], 10000);
    for (let i = 1; i <= 40; i++) t.update([pt(0, i * 48, i * 23)], 10000 + i * 10);
    expect(t.trails[0].length).toBeLessThanOrEqual(24);
  });

  it('reset() clears all state', () => {
    const t = new TouchGestureTracker();
    t.update([pt(0, 100, 100), pt(1, 1500, 800)], 0);
    t.reset();
    expect(t.events).toEqual([]);
    expect(t.label).toBe('idle');
    expect(t.trails).toEqual([[], []]);
  });
});
