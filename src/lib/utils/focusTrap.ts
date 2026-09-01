// Svelte action: focus the first focusable element in `node` on mount and keep
// Tab/Shift-Tab cycling inside it while the modal is open. Restores focus to
// the previously-focused element on teardown so the trigger button gets focus
// back when the dialog closes.
//
// Usage:  <div use:trapFocus> ... </div>

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function trapFocus(node: HTMLElement) {
  const previouslyFocused = document.activeElement as HTMLElement | null;

  function focusables(): HTMLElement[] {
    return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
  }

  // Focus first element shortly after mount so the DOM is settled.
  const t = setTimeout(() => {
    const first = focusables()[0];
    first?.focus();
  }, 0);

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const items = focusables();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  node.addEventListener('keydown', onKeydown);

  return {
    destroy() {
      clearTimeout(t);
      node.removeEventListener('keydown', onKeydown);
      previouslyFocused?.focus?.();
    },
  };
}
