// Mock for @tauri-apps/plugin-process — used only in MOCK mode (plain browser).

export async function relaunch(): Promise<void> {
  /* no-op in mock mode */
}

export async function exit(code = 0): Promise<void> {
  void code;
}
