// Utility functions for DualSense controller operations, ported from dualshock-tools.

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function buf2hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function dec2hex(i: number): string {
  return (i + 0x10000).toString(16).slice(-4).toUpperCase();
}

export function dec2hex32(i: number): string {
  return (i >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

export function dec2hex8(i: number): string {
  return (i + 0x100).toString(16).slice(-2).toUpperCase();
}

export function formatMacFromView(view: DataView, startIndexInclusive: number): string {
  const bytes: string[] = [];
  for (let i = 0; i < 6; i++) {
    const idx = startIndexInclusive + (5 - i);
    bytes.push(dec2hex8(view.getUint8(idx)));
  }
  return bytes.join(':');
}

export function reverseStr(s: string): string {
  return s.split('').reverse().join('');
}

export function floatToStr(f: number, precision = 2): string {
  if (precision <= 2 && f < 0.004 && f >= -0.004) return '+0.00';
  return (f < 0 ? '' : '+') + f.toFixed(precision);
}
