<script>
  import '../app.css';
  import { theme, applyTheme } from '$lib/stores/theme';
  let { children } = $props();

  // Apply the persisted theme to <html data-theme="…"> on mount and on every
  // change. ssr=false (see +layout.ts), so document is always available.
  $effect(() => {
    applyTheme($theme);
  });
</script>

{@render children()}