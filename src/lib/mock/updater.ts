// Mock for @tauri-apps/plugin-updater — used only in MOCK mode (plain browser).
// The real plugin is never loaded there; we report "no update available".

export interface Update {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
  downloadAndInstall: (
    onEvent?: (event: { event: string; data: unknown }) => void
  ) => Promise<void>;
  download: (onEvent?: (event: { event: string; data: unknown }) => void) => Promise<void>;
  install: () => Promise<void>;
}

export async function check(): Promise<Update | null> {
  return null;
}
