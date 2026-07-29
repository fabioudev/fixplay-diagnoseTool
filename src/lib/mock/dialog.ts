// Mock replacement for '@tauri-apps/plugin-dialog'.
// Only active in MOCK mode via the vite alias.
// Returns a fake path so file/folder pickers don't block UI testing.

/** Drop-in replacement for the dialog plugin's `open`. */
export async function open(
  _options?: unknown,
  _opts?: unknown,
): Promise<string | string[] | null> {
  await new Promise<void>((r) => setTimeout(r, 80));
  return '/mock/selected-dump.bin';
}

/** Drop-in replacement for the dialog plugin's `save`. */
export async function save(
  _options?: unknown,
  _target?: unknown,
): Promise<string | null> {
  await new Promise<void>((r) => setTimeout(r, 80));
  return '/mock/controller-log.txt';
}