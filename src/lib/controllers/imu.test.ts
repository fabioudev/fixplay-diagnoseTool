import { describe, it, expect } from 'vitest';
import { parseDs5Imu } from './controller-manager';

/**
 * Tests for the DualSense IMU parser (#56). Builds a 64-byte common input
 * report DataView with known gyro/accel values at the documented struct
 * offsets (gyro xyz @ 15/17/19, accel xyz @ 21/23/25, 16-bit LE signed) and
 * checks the °/s (÷1024) and g (÷8192) scaling.
 */
function report(values: Record<number, number>): DataView {
  const buf = new ArrayBuffer(64);
  const v = new DataView(buf);
  for (const [off, val] of Object.entries(values)) {
    v.setInt16(Number(off), val, true);
  }
  return v;
}

describe('parseDs5Imu (#56)', () => {
  it('parses gyro axes scaled to °/s (÷1024)', () => {
    // gyro X = 1024 → 1 °/s, Y = -2048 → -2 °/s, Z = 512 → 0.5 °/s
    const v = report({ 15: 1024, 17: -2048, 19: 512 });
    const imu = parseDs5Imu(v);
    expect(imu.gyro.x).toBe(1);
    expect(imu.gyro.y).toBe(-2);
    expect(imu.gyro.z).toBeCloseTo(0.5, 5);
  });

  it('parses accel axes scaled to g (÷8192)', () => {
    // accel X = 8192 → 1 g, Y = -4096 → -0.5 g, Z = 16384 → 2 g
    const v = report({ 21: 8192, 23: -4096, 25: 16384 });
    const imu = parseDs5Imu(v);
    expect(imu.accel.x).toBe(1);
    expect(imu.accel.y).toBeCloseTo(-0.5, 5);
    expect(imu.accel.z).toBe(2);
  });

  it('reports a 1 g rest state on accel Z for the mock rest value (0x2000)', () => {
    const buf = new ArrayBuffer(64);
    const v = new DataView(buf);
    // accel Z lives at struct offset 25 ( getInt16(25, true) ): low byte 25,
    // high byte 26. 0x2000 LE → byte 25 = 0x00, byte 26 = 0x20.
    v.setUint8(25, 0x00);
    v.setUint8(26, 0x20);
    const imu = parseDs5Imu(v);
    expect(imu.accel.z).toBe(1);
    expect(imu.gyro.x).toBe(0);
  });

  it('returns zeros for a report too short to contain the IMU', () => {
    const v = new DataView(new ArrayBuffer(20));
    const imu = parseDs5Imu(v);
    expect(imu.gyro).toEqual({ x: 0, y: 0, z: 0 });
    expect(imu.accel).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('handles negative gyro/accel via signed 16-bit readback', () => {
    const v = report({ 15: -1024, 21: -8192 });
    const imu = parseDs5Imu(v);
    expect(imu.gyro.x).toBe(-1);
    expect(imu.accel.x).toBe(-1);
  });
});