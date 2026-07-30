import { describe, it, expect, vi } from 'vitest';
import { DS5Controller } from './ds5-controller';
import type { HIDDeviceLike } from './base-controller';

/**
 * Tests for the DS5 NVS + stick-calibration operations (#67). These methods
 * talk to the controller only through `sendFeatureReport` / `receiveFeatureReport`,
 * so a fake device with canned feature-report responses exercises every branch
 * (success ack, wrong-ack failure, HID error, NVS-status decode table) without
 * real hardware.
 */

/** A fake HID device that records sent feature reports and serves canned reads. */
function makeCalibDevice(opts: { receive?: (id: number) => Promise<DataView> } = {}) {
  const sent: { reportId: number; data: Uint8Array }[] = [];
  return {
    opened: true,
    collections: [
      { featureReports: Array.from({ length: 256 }, (_, i) => ({ reportId: i, items: [{ reportCount: 64 }] })) },
    ],
    oninputreport: null,
    async sendFeatureReport(reportId: number, data: BufferSource) {
      const u8 = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data as Uint8Array);
      sent.push({ reportId, data: u8 });
    },
    receiveFeatureReport:
      opts.receive ?? (async (_id: number) => new DataView(new ArrayBuffer(64))),
    async sendReport(_id: number, _data: BufferSource) {},
    async close() {},
    sent,
  } as unknown as HIDDeviceLike & { sent: typeof sent };
}

/** Build a 64-byte DataView with `bytes` laid out from offset 0. */
function dvBytes(bytes: number[]): DataView {
  const v = new DataView(new ArrayBuffer(64));
  bytes.forEach((b, i) => v.setUint8(i, b));
  return v;
}

/** Write a big-endian u32 into a DataView at `offset`. */
function setBeU32(v: DataView, offset: number, val: number): void {
  v.setUint8(offset, (val >>> 24) & 0xff);
  v.setUint8(offset + 1, (val >>> 16) & 0xff);
  v.setUint8(offset + 2, (val >>> 8) & 0xff);
  v.setUint8(offset + 3, val & 0xff);
}

/** A 64-byte DataView with a big-endian u32 `val` at `offset` (the calib ack shape). */
function ackDv(val: number, offset = 0): DataView {
  const v = dvBytes([]);
  setBeU32(v, offset, val);
  return v;
}

/** A receive handler that serves a FIFO queue of canned DataViews. */
function queueReceive(responses: DataView[]) {
  return async (_id: number) =>
    responses.length ? responses.shift()! : new DataView(new ArrayBuffer(64));
}

describe('DS5Controller NVS lock/unlock', () => {
  it('nvsLock sends 0x80 [3,1] and returns ok on a clean 0x81 ack', async () => {
    const dev = makeCalibDevice();
    const ctrl = new DS5Controller(dev);
    const res = await ctrl.nvsLock();
    expect(res).toEqual({ ok: true });
    const fr = dev.sent.find((s) => s.reportId === 0x80)!;
    expect(fr.data[0]).toBe(3);
    expect(fr.data[1]).toBe(1);
  });

  it('nvsLock returns ok:false (not a throw) when the HID read fails', async () => {
    const dev = makeCalibDevice({ receive: async () => { throw new Error('hid'); } });
    const ctrl = new DS5Controller(dev);
    const res = await ctrl.nvsLock();
    expect(res.ok).toBe(false);
    expect(res.error).toBeInstanceOf(Error);
  });

  it('nvsUnlock sends 0x80 [3,2,101,50,64,12] and resolves on a clean ack', async () => {
    const dev = makeCalibDevice();
    const ctrl = new DS5Controller(dev);
    await ctrl.nvsUnlock();
    const fr = dev.sent.find((s) => s.reportId === 0x80)!;
    expect(Array.from(fr.data.slice(0, 6))).toEqual([3, 2, 101, 50, 64, 12]);
  });

  it('nvsUnlock throws "NVS Unlock failed" after the retry delay when the HID read fails', async () => {
    vi.useFakeTimers();
    try {
      const dev = makeCalibDevice({ receive: async () => { throw new Error('hid'); } });
      const ctrl = new DS5Controller(dev);
      const p = ctrl.nvsUnlock();
      // Pre-attach a handler so the rejection is never "unhandled" while the
      // fake timer is advancing the 500 ms retry delay.
      const caught = p.catch((e) => e);
      await vi.advanceTimersByTimeAsync(500);
      const err = await caught;
      expect(err).toBeInstanceOf(Error);
      expect(String((err as Error).message)).toContain('NVS Unlock failed');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('DS5Controller stick center calibration', () => {
  it('calibrateSticksBegin: 0x83010101 ack → ok, sends 0x82 [1,1,1]', async () => {
    const dev = makeCalibDevice({ receive: queueReceive([ackDv(0x83010101)]) });
    const ctrl = new DS5Controller(dev);
    const res = await ctrl.calibrateSticksBegin();
    expect(res).toEqual({ ok: true });
    const fr = dev.sent.find((s) => s.reportId === 0x82)!;
    expect(Array.from(fr.data.slice(0, 3))).toEqual([1, 1, 1]);
  });

  it('calibrateSticksBegin: wrong ack → ok:false with a "begin failed" message', async () => {
    const dev = makeCalibDevice({ receive: queueReceive([ackDv(0x83010102)]) });
    const ctrl = new DS5Controller(dev);
    const res = await ctrl.calibrateSticksBegin();
    expect(res.ok).toBe(false);
    expect(String((res.error as Error)?.message)).toContain('begin failed');
  });

  it('calibrateSticksSample: 0x83010101 ack → ok, sends 0x82 [3,1,1]', async () => {
    const dev = makeCalibDevice({ receive: queueReceive([ackDv(0x83010101)]) });
    const ctrl = new DS5Controller(dev);
    const res = await ctrl.calibrateSticksSample();
    expect(res).toEqual({ ok: true });
    const fr = dev.sent.find((s) => s.reportId === 0x82)!;
    expect(Array.from(fr.data.slice(0, 3))).toEqual([3, 1, 1]);
  });

  it('calibrateSticksEnd: 0x83010102 ack → ok, sends 0x82 [2,1,1]', async () => {
    const dev = makeCalibDevice({ receive: queueReceive([ackDv(0x83010102)]) });
    const ctrl = new DS5Controller(dev);
    const res = await ctrl.calibrateSticksEnd();
    expect(res).toEqual({ ok: true });
    const fr = dev.sent.find((s) => s.reportId === 0x82)!;
    expect(Array.from(fr.data.slice(0, 3))).toEqual([2, 1, 1]);
  });
});

describe('DS5Controller stick range calibration', () => {
  it('calibrateRangeBegin: 0x83010201 ack → ok, sends 0x82 [1,1,2]', async () => {
    const dev = makeCalibDevice({ receive: queueReceive([ackDv(0x83010201)]) });
    const ctrl = new DS5Controller(dev);
    const res = await ctrl.calibrateRangeBegin();
    expect(res).toEqual({ ok: true });
    const fr = dev.sent.find((s) => s.reportId === 0x82)!;
    expect(Array.from(fr.data.slice(0, 3))).toEqual([1, 1, 2]);
  });

  it('calibrateRangeEnd: 0x83010202 ack → ok, sends 0x82 [2,1,2]', async () => {
    const dev = makeCalibDevice({ receive: queueReceive([ackDv(0x83010202)]) });
    const ctrl = new DS5Controller(dev);
    const res = await ctrl.calibrateRangeEnd();
    expect(res).toEqual({ ok: true });
    const fr = dev.sent.find((s) => s.reportId === 0x82)!;
    expect(Array.from(fr.data.slice(0, 3))).toEqual([2, 1, 2]);
  });

  it('calibrateRangeEnd: wrong ack → ok:false with a "range calibration end failed" message', async () => {
    const dev = makeCalibDevice({ receive: queueReceive([ackDv(0x83010201)]) });
    const ctrl = new DS5Controller(dev);
    const res = await ctrl.calibrateRangeEnd();
    expect(res.ok).toBe(false);
    expect(String((res.error as Error)?.message)).toContain('range calibration end failed');
  });
});

describe('DS5Controller queryNvStatus decode table', () => {
  function statusReport(ret: number): DataView {
    const v = dvBytes([]);
    setBeU32(v, 1, ret); // queryNvStatus reads getUint32(1, false)
    return v;
  }

  it('0x15010100 → pending_reboot (code 4)', async () => {
    const dev = makeCalibDevice({ receive: queueReceive([statusReport(0x15010100)]) });
    const ctrl = new DS5Controller(dev);
    const nv = await ctrl.queryNvStatus();
    expect(nv.status).toBe('pending_reboot');
    expect(nv.code).toBe(4);
    expect(nv.raw).toBe(0x15010100);
  });

  it('0x03030201 → locked (temporary, code 1)', async () => {
    const dev = makeCalibDevice({ receive: queueReceive([statusReport(0x03030201)]) });
    const ctrl = new DS5Controller(dev);
    const nv = await ctrl.queryNvStatus();
    expect(nv.status).toBe('locked');
    expect(nv.locked).toBe(true);
    expect(nv.code).toBe(1);
  });

  it('0x03030200 → unlocked (permanent, code 0)', async () => {
    const dev = makeCalibDevice({ receive: queueReceive([statusReport(0x03030200)]) });
    const ctrl = new DS5Controller(dev);
    const nv = await ctrl.queryNvStatus();
    expect(nv.status).toBe('unlocked');
    expect(nv.locked).toBe(false);
    expect(nv.code).toBe(0);
  });

  it('ret=1 → unknown (code 2)', async () => {
    const dev = makeCalibDevice({ receive: queueReceive([statusReport(1)]) });
    const ctrl = new DS5Controller(dev);
    const nv = await ctrl.queryNvStatus();
    expect(nv.status).toBe('unknown');
    expect(nv.code).toBe(2);
  });

  it('ret=2 → unknown (code 2)', async () => {
    const dev = makeCalibDevice({ receive: queueReceive([statusReport(2)]) });
    const ctrl = new DS5Controller(dev);
    const nv = await ctrl.queryNvStatus();
    expect(nv.status).toBe('unknown');
    expect(nv.code).toBe(2);
  });

  it('any other ret → unknown with code=ret', async () => {
    const dev = makeCalibDevice({ receive: queueReceive([statusReport(0x12345678)]) });
    const ctrl = new DS5Controller(dev);
    const nv = await ctrl.queryNvStatus();
    expect(nv.status).toBe('unknown');
    expect(nv.code).toBe(0x12345678);
    expect(nv.raw).toBe(0x12345678);
  });

  it('HID read error → status "error" (code 2)', async () => {
    const dev = makeCalibDevice({ receive: async () => { throw new Error('hid'); } });
    const ctrl = new DS5Controller(dev);
    const nv = await ctrl.queryNvStatus();
    expect(nv.status).toBe('error');
    expect(nv.code).toBe(2);
  });
});

describe('DS5Controller in-memory finetune module', () => {
  it('getInMemoryModuleData: valid header → 12 little-endian u16 values', async () => {
    const v = dvBytes([129, 12, 2, 2]); // cmd=129, p1=12, p2=2, p3=2
    const want = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
    want.forEach((w, i) => v.setUint16(4 + i * 2, w, true));
    const dev = makeCalibDevice({ receive: queueReceive([v]) });
    const ctrl = new DS5Controller(dev);
    const data = await ctrl.getInMemoryModuleData();
    expect(data).toEqual(want);
  });

  it('getInMemoryModuleData: accepts p2=4 as well as p2=2', async () => {
    const v = dvBytes([129, 12, 4, 2]);
    const dev = makeCalibDevice({ receive: queueReceive([v]) });
    const ctrl = new DS5Controller(dev);
    const data = await ctrl.getInMemoryModuleData();
    expect(data).not.toBeNull();
    expect(data).toHaveLength(12);
  });

  it('getInMemoryModuleData: wrong cmd → null', async () => {
    const v = dvBytes([0, 12, 2, 2]); // cmd != 129
    const dev = makeCalibDevice({ receive: queueReceive([v]) });
    const ctrl = new DS5Controller(dev);
    const data = await ctrl.getInMemoryModuleData();
    expect(data).toBeNull();
  });

  it('writeFinetuneData: packs values as little-endian pairs prefixed with [12,1]', async () => {
    const dev = makeCalibDevice();
    const ctrl = new DS5Controller(dev);
    ctrl.setTransport('usb');
    await ctrl.writeFinetuneData([0x1234, 0xabcd]);
    const fr = dev.sent.find((s) => s.reportId === 0x80)!;
    expect(Array.from(fr.data.slice(0, 6))).toEqual([12, 1, 0x34, 0x12, 0xcd, 0xab]);
  });
});

describe('DS5Controller hwToBoardModel', () => {
  it('maps the high byte to the BDM board model', () => {
    const dev = makeCalibDevice();
    const ctrl = new DS5Controller(dev);
    expect(ctrl.hwToBoardModel(0x0300)).toBe('BDM-010');
    expect(ctrl.hwToBoardModel(0x0400)).toBe('BDM-020');
    expect(ctrl.hwToBoardModel(0x0500)).toBe('BDM-030');
    expect(ctrl.hwToBoardModel(0x0600)).toBe('BDM-040');
    expect(ctrl.hwToBoardModel(0x0700)).toBe('BDM-050');
    expect(ctrl.hwToBoardModel(0x0800)).toBe('BDM-050');
    expect(ctrl.hwToBoardModel(0x1100)).toBe('BDM-060M');
    expect(ctrl.hwToBoardModel(0x1300)).toBe('BDM-060X');
  });

  it('returns "Unknown" for an unmapped high byte', () => {
    const dev = makeCalibDevice();
    const ctrl = new DS5Controller(dev);
    expect(ctrl.hwToBoardModel(0x9900)).toBe('Unknown');
  });
});