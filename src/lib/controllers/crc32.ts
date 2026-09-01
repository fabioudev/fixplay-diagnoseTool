// CRC32 for DualSense Bluetooth HID framing.
//
// The DS5 wraps every Bluetooth report (output 0x31 and feature reports) in a
// CRC32 trailer so the controller can validate integrity over the BT link.
// USB reports carry no CRC. The seed/prefix differs per report class:
//
//   - output report 0x31: prefix bytes [0xA2, 0x31] before the frame body
//   - feature reports:    prefix bytes [0x53, reportId] before the report body
//
// Polynomial 0xEDB88320 (reflected), init/xorout 0xFFFFFFFF — the standard
// crc32_le the kernel/hid-playstation uses, and the same algorithm daidr's
// dualsense-tester uses (verified against real BT hardware). Ported from
// daidr's utils/dualsense/crc32.util.ts (MIT) so our framing matches a known-
// working implementation byte-for-byte.

let table: Uint32Array | null = null;

function makeTable(): Uint32Array {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
}

function tableInstance(): Uint32Array {
  if (!table) table = makeTable();
  return table;
}

/** Compute CRC32 over `prefix` ++ `data` ++ `suffix` (all byte arrays). */
export function crc32(
  data: Uint8Array | DataView,
  prefix: number[] = [],
  suffix: number[] = []
): number {
  const t = tableInstance();
  let crc = 0xffffffff;
  for (const b of prefix) crc = (crc >>> 8) ^ t[(crc ^ b) & 0xff];
  const view =
    data instanceof DataView ? data : new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < view.byteLength; i++) {
    crc = (crc >>> 8) ^ t[(crc ^ view.getUint8(i)) & 0xff];
  }
  for (const b of suffix) crc = (crc >>> 8) ^ t[(crc ^ b) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Write the Bluetooth output-report CRC32 (seed 0xA2, report id 0x31) into the
 * last four bytes of `frame` (little-endian). `frame` must already contain the
 * full 77-byte BT output payload (header + 47-byte common + 24 padding), with
 * the trailing 4 CRC bytes reserved.
 */
export function fillOutputReportCrc(frame: Uint8Array): void {
  const crc = crc32(frame.subarray(0, frame.byteLength - 4), [0xa2, 0x31]);
  const off = frame.byteLength - 4;
  frame[off] = crc & 0xff;
  frame[off + 1] = (crc >>> 8) & 0xff;
  frame[off + 2] = (crc >>> 16) & 0xff;
  frame[off + 3] = (crc >>> 24) & 0xff;
}

/**
 * Write the Bluetooth feature-report CRC32 (seed 0x53, report id) into the last
 * four bytes of `report` (little-endian). `report` is the padded feature-report
 * buffer with the trailing 4 CRC bytes reserved (DS5 feature reports are 64
 * bytes → CRC at offset 60).
 */
export function fillFeatureReportCrc(reportId: number, report: Uint8Array): void {
  const crc = crc32(report.subarray(0, report.byteLength - 4), [0x53, reportId]);
  const off = report.byteLength - 4;
  report[off] = crc & 0xff;
  report[off + 1] = (crc >>> 8) & 0xff;
  report[off + 2] = (crc >>> 16) & 0xff;
  report[off + 3] = (crc >>> 24) & 0xff;
}
