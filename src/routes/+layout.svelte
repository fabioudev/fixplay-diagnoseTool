<script>
  import '../app.css';
  import { theme, applyTheme } from '$lib/stores/theme';
  import { initI18n } from '$lib/i18n/init';
  let { children } = $props();

  // Load both locales + activate the persisted one. Runs at prerender (Node,
  // localStorage-guarded → base locale) and again on the client (hydrates the
  // user's chosen locale). Synchronous, no reload — preserves live HW state.
  initI18n();

  // Apply the persisted theme to <html data-theme="…"> on mount and on every
  // change. ssr=false (see +layout.ts), so document is always available.
  $effect(() => {
    applyTheme($theme);
  });
</script>

{@render children()}