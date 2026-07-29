/** Copy text to clipboard with a brief visual feedback callback. */
export async function copyToClipboard(text: string, onDone?: (ok: boolean) => void): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    onDone?.(true);
  } catch {
    // Fallback for older browsers or insecure contexts
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); onDone?.(true); } catch { onDone?.(false); }
    document.body.removeChild(ta);
  }
}
