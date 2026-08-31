import { writable } from 'svelte/store';
import { listen } from '@tauri-apps/api/event';
import type { FlashReadResult, FlashLogEntry, FlashProgressEvent, FlashPreviewResult, FlashStatusEvent, NorValidation } from '$lib/api/types';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import type { LocalizedString } from 'typesafe-i18n';
import { createLogStore } from './log';

export const flashBusy      = writable<boolean>(false);
export const flashProgress  = writable<FlashProgressEvent | null>(null);
export const flashResult    = writable<FlashReadResult | null>(null);

// Flash log: shared createLogStore backs the writable + monotonic id + capped
// prepend (the contract every component relies on when appending flashrom output).
const _flashLog = createLogStore<FlashLogEntry>();
export const flashLog       = _flashLog.entries;
export const nextFlashLogId = _flashLog.nextId;
/** Prepend a flash log entry (newest-first), capped at 200. */
export const pushFlashLog: (entry: FlashLogEntry) => void = _flashLog.push;

export const flashProgrammer = writable<string>('ch341a_spi');
export const flashProgrammers = writable<string[]>([]);
/**
 * A pending write target requested by another component (the archive panel's
 * "restore" action). FlashPanel consumes it as a one-shot request and clears
 * it. This is an explicit *write-request* channel — not a generic path store
 * repurposed as a cross-component event bus (which is what the old
 * `flashWritePath` was).
 */
export const flashWriteRequest = writable<string | null>(null);

/** Request that the flash panel write the NOR image at `path` (one-shot). */
export function requestFlashWrite(path: string): void {
  // Drop any stale preview: the armed request must be the *only* eligible
  // write target, otherwise the panel would show the new file in the banner
  // while "Jetzt schreiben" still wrote the old preview.
  flashWritePreview.set(null);
  flashWriteRequest.set(path);
}
export const flashWritePreview = writable<FlashPreviewResult | null>(null);

// --- Validation helpers (pure) ------------------------------------------------

/**
 * Checklist order shared by every validation display and the write gate —
 * the same sequence as the VALIDATION_ITEMS label list in FlashPanel.
 */
const VALIDATION_KEY_ORDER: (keyof NorValidation)[] = [
  'header_ok', 'mbr1_ok', 'mbr2_ok',
  'emc_ipl_a_ok', 'emc_ipl_b_ok',
  'usb_pdc_a_ok', 'usb_pdc_b_ok',
  'size_ok',
];

const KNOWN_VALIDATION_KEYS = new Set<string>(VALIDATION_KEY_ORDER);

/**
 * True only when *every* known check is explicitly `true` AND no unrecognized
 * check keys are present. The unrecognized-key rule is the fail-closed half:
 * when the Rust backend gains a new validation check (the NorValidation struct
 * in crates/fixplay-core/src/types.rs is the serde source of truth), an older
 * frontend sees it as an unknown key and blocks the write — instead of
 * silently passing a check it never knew about.
 */
export function isValidationOk(validation: NorValidation): boolean {
  return failedValidationKeys(validation).length === 0
    && Object.values(validation).every((v) => v === true);
}

/**
 * The failing checks in stable checklist order (missing keys count as failing),
 * plus any unrecognized keys — labeled verbatim in the UI so a mismatch with
 * the Rust struct is visible, not swallowed.
 */
export function failedValidationKeys(validation: NorValidation): string[] {
  const failed = VALIDATION_KEY_ORDER.filter((key) => validation[key] !== true);
  const unknown = Object.keys(validation).filter((key) => !KNOWN_VALIDATION_KEYS.has(key));
  return [...failed, ...unknown];
}

// --- ETA formatting + tracking (pure) -----------------------------------------

/** Human-readable, locale-neutral duration ("~5s", "~2m 5s"); '' when unknowable. */
export function formatFlashDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `~${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `~${m}m ${r}s`;
}

/** Anchored ETA bookkeeping: which phase started when. */
export interface EtaState {
  phase: string;
  /** Anchor timestamp (ms) of the first progress event of the current phase. */
  start: number;
}

/**
 * Pure ETA math extracted from the progress listener: progress resets to 0 at
 * each phase (read1/read2/write/verify), so we re-anchor on any phase change
 * and only extrapolate remaining time from the observed once the phase is at
 * least 20 % done (below that the rate is too noisy to be useful).
 */
export function computeEta(
  state: EtaState,
  phase: string,
  percent: number,
  nowMs: number,
): { state: EtaState; remainingMs: number | null } {
  if (state.phase !== phase) {
    return { state: { phase, start: nowMs }, remainingMs: null };
  }
  const elapsed = nowMs - state.start;
  if (percent <= 0 || percent >= 100 || elapsed <= 0 || percent < 20) {
    return { state, remainingMs: null };
  }
  return { state, remainingMs: Math.round((100 - percent) * elapsed / percent) };
}

// --- Live phase/ETA state + panel-independent event wiring ---------------------

/**
 * Raw phase key of the running operation ('' when idle). The localized display
 * label is derived where it is rendered so it stays correct if the operator
 * switches locale mid-operation (freezing it at event time would not).
 */
export const flashPhase = writable<string>('');

/** Extrapolated remaining time of the current phase in ms; null while too noisy. */
export const flashEtaRemainingMs = writable<number | null>(null);

/** Localized label per flash phase (read1/read2/write/verify). */
export const FLASH_PHASE_LABELS: Record<string, (ll: TranslationFunctions) => LocalizedString> = {
  read1:  (ll) => ll.flash.phase.read1(),
  read2:  (ll) => ll.flash.phase.read2(),
  write:  (ll) => ll.flash.phase.write(),
  verify: (ll) => ll.flash.phase.verify(),
};

let etaState: EtaState = { phase: '', start: 0 };
let listenersReady = false;

/**
 * Register the `flash://progress|status|result` listeners once at app start
 * (from `+page.svelte`'s onMount) instead of inside FlashPanel's onMount.
 *
 * The backend emits progress/status events and then a final result event; if
 * the only listener lived in the (unmountable) FlashPanel, navigating away mid
 * operation would drop the result and leave `flashBusy` true forever — every
 * read/write/detect button dead for the rest of the session. As a module-level
 * store companion the wiring survives panel switches.
 */
export async function initFlashListeners(): Promise<void> {
  if (listenersReady) return;
  listenersReady = true;

  try {
    await Promise.all([
      listen<FlashProgressEvent>('flash://progress', (e) => {
        flashProgress.set(e.payload);
        // Raw phase key only — the localized label is derived where it is
        // rendered (FLASH_PHASE_LABELS) so a locale switch mid-operation keeps
        // showing the right text.
        flashPhase.set(e.payload.phase);
        const { state, remainingMs } = computeEta(etaState, e.payload.phase, e.payload.percent, Date.now());
        etaState = state;
        flashEtaRemainingMs.set(remainingMs);
      }),
      listen<FlashStatusEvent>('flash://status', (e) => {
        pushFlashLog({
          id: nextFlashLogId(),
          timestamp_ms: Date.now(),
          message: e.payload.message,
          level: e.payload.level as 'info' | 'warn' | 'error',
        });
      }),
      listen<FlashReadResult>('flash://result', (e) => {
        flashResult.set(e.payload);
        flashBusy.set(false);
        flashProgress.set(null);
        flashPhase.set('');
        flashEtaRemainingMs.set(null);
        etaState = { phase: '', start: 0 };
      }),
    ]);
  } catch (err) {
    // Registration failed (transient IPC error at startup) — drop the flag so
    // a retry is possible instead of leaving the app permanently deaf to
    // flash://result (which would strand flashBusy on true).
    listenersReady = false;
    throw err;
  }
}