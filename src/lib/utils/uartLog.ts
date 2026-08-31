import type { UartLogEntry } from '$lib/api/types';

/**
 * Canonical `0xXXXXXXXX` form used by every error-code display in the panels.
 * Keeping all producers on one format is what makes the search box match:
 * clicking a DB result used to insert the *decimal* code string, which can
 * never match the hex-formatted log text (verified bug).
 */
/** Zero-padded 8-digit uppercase hex without prefix — the wire/log text form. */
export function formatHex8(code: number): string {
  return code.toString(16).toUpperCase().padStart(8, '0');
}

export function formatErrorCodeHex(code: number): string {
  return '0x' + formatHex8(code);
}

/**
 * True when the search-box text matches this log entry. Parsed errlog entries
 * match by canonical error-code hex (case-insensitive, with or without `0x`
 * prefix), by DB description, and by the padded up_cause / power_states wire
 * hex; unparsed entries match by raw line text. Empty queries match everything
 * (the caller owns the "no filter" branch).
 */
export function uartLogMatches(entry: UartLogEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (entry.raw.toLowerCase().includes(q)) return true;
  const parsed = entry.parsed;
  if (!parsed) return false;
  if (formatErrorCodeHex(parsed.entry.error_code).toLowerCase().includes(q)) return true;
  if (parsed.description?.toLowerCase().includes(q)) return true;
  return formatErrorCodeHex(parsed.entry.up_cause).toLowerCase().includes(q)
      || formatErrorCodeHex(parsed.entry.power_states).toLowerCase().includes(q);
}