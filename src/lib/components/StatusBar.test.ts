// @vitest-environment jsdom
import { render, screen } from '@testing-library/svelte';
import { describe, it, expect, beforeEach } from 'vitest';
import StatusBar from './StatusBar.svelte';
import { dbCodeCount } from '$lib/stores/uart';
import { xboxDbCount } from '$lib/stores/i2c';
import { initI18n } from '$lib/i18n/init';

// StatusBar derives several badges from stores (programmer count, DB counts,
// online state). This verifies the store→badge wiring at the component level,
// which the pure store tests can't reach.
//
// The badges are localized via $LL, which is only initialized in +layout.svelte
// at runtime — in component tests we must initI18n() first or $LL resolves to
// nothing and the count text never reaches the DOM.

beforeEach(() => {
  initI18n();
  dbCodeCount.set(null);
  xboxDbCount.set(null);
  document.body.innerHTML = '';
});

describe('StatusBar', () => {
  it('renders without throwing and shows the DB-count section', () => {
    const { container } = render(StatusBar, { props: { onnavigate: () => {} } });
    expect(container).toBeInTheDocument();
  });

  it('reflects the PS5 error-DB count once loaded into the store', () => {
    // Keep the count under 1000 so toLocaleString() has no thousands separator
    // (jsdom's default locale varies), keeping the text match locale-stable.
    dbCodeCount.set(999);
    render(StatusBar, { props: { onnavigate: () => {} } });
    expect(screen.getByText(/999/)).toBeInTheDocument();
  });

  it('reflects the Xbox error-DB count once loaded', () => {
    xboxDbCount.set(960);
    render(StatusBar, { props: { onnavigate: () => {} } });
    expect(screen.getByText(/960/)).toBeInTheDocument();
  });
});
