// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ConfirmDialog from './ConfirmDialog.svelte';
import { initI18n } from '$lib/i18n/init';

// The modals use `transition:fade`/`scale` whose outro delays DOM removal until
// the Web Animations API fires onfinish. The setup file polyfills animate() to
// fire onfinish on the next macrotask, so we flush one macrotask after a click
// before asserting the dialog has actually unmounted.
const flushTransition = () => new Promise((r) => setTimeout(r, 50));

// First real component tests — the Svelte components (5k+ lines) previously had
// zero coverage. ConfirmDialog is small and self-contained, so it's a good
// anchor: it exercises conditional rendering, the type-to-confirm gate, and
// the confirm/cancel callbacks.

beforeEach(() => {
  initI18n();
  document.body.innerHTML = '';
});

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    render(ConfirmDialog, { props: { open: false, message: 'Geheim' } });
    expect(screen.queryByText('Geheim')).toBeNull();
  });

  it('renders title, message and the confirm label when open', () => {
    render(ConfirmDialog, {
      props: { open: true, title: 'Wirklich?', message: 'Löschen nicht rückgängig', confirmLabel: 'Löschen' },
    });
    expect(screen.getByText('Wirklich?')).toBeInTheDocument();
    expect(screen.getByText('Löschen nicht rückgängig')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Löschen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument();
  });

  it('calls onconfirm and closes when the confirm button is clicked', async () => {
    const onconfirm = vi.fn();
    render(ConfirmDialog, {
      props: { open: true, message: 'Sind Sie sicher?', confirmLabel: 'OK', onconfirm },
    });
    const confirmBtn = screen.getByRole('button', { name: 'OK' });
    await fireEvent.click(confirmBtn);
    expect(onconfirm).toHaveBeenCalledTimes(1);
    // The fade/scale outro delays DOM removal until the polyfilled animation's
    // onfinish fires on the next macrotask; flush it, then assert the dialog
    // body is gone. (Reading the bindable `open` prop back via the testing-
    // library handle returns undefined in Svelte 5 runes mode, so assert on DOM.)
    await flushTransition();
    expect(screen.queryByText('Sind Sie sicher?')).toBeNull();
  });

  it('does not confirm when closed via Abbrechen', async () => {
    const onconfirm = vi.fn();
    render(ConfirmDialog, { props: { open: true, message: 'Vielleicht doch', onconfirm } });
    await fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(onconfirm).not.toHaveBeenCalled();
    await flushTransition();
    expect(screen.queryByText('Vielleicht doch')).toBeNull();
  });

  it('disables the confirm button until the type-to-confirm text matches', async () => {
    render(ConfirmDialog, {
      props: { open: true, confirmLabel: 'Weg damit', typeToConfirm: 'DELETE' },
    });
    const confirm = screen.getByRole('button', { name: 'Weg damit' }) as HTMLButtonElement;
    expect(confirm).toBeDisabled();

    const input = screen.getByPlaceholderText('DELETE');
    await fireEvent.input(input, { target: { value: 'DEL' } });
    expect(confirm).toBeDisabled();

    await fireEvent.input(input, { target: { value: 'DELETE' } });
    expect(confirm).not.toBeDisabled();
  });

  it('renders a danger-styled confirm button when confirmDanger is set', () => {
    const { container } = render(ConfirmDialog, {
      props: { open: true, confirmLabel: 'Entfernen', confirmDanger: true },
    });
    // The danger variant uses a red background class on the confirm button.
    const btn = screen.getByRole('button', { name: 'Entfernen' });
    expect(btn.className).toContain('bg-red-600');
  });
});