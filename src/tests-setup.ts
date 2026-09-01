// Global vitest setup: extends expect with DOM matchers (@testing-library/jest-dom)
// for the Svelte component tests. Loaded for every test file; harmless in the
// node-environment logic tests (stores/utils/mock) which don't touch the DOM.
import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement the Web Animations API, but Svelte's `transition:`
// directives (fade/scale used by the modals) call element.animate() on mount
// and assign `animation.onfinish` to detect completion. Polyfill a no-op
// animation that fires onfinish on the next tick so Svelte removes outro'd
// elements instead of leaving them parked forever.
if (typeof Element !== 'undefined' && !Element.prototype.animate) {
  Element.prototype.animate = function () {
    let onfinish: (() => void) | null = null;
    const anim = {
      finished: Promise.resolve(),
      cancel() {},
      finish() {},
      get onfinish() {
        return onfinish;
      },
      set onfinish(v: (() => void) | null) {
        onfinish = v;
        if (v) setTimeout(() => v.call(anim), 0);
      },
      oncancel: null,
      addEventListener() {},
      removeEventListener() {},
    };
    return anim as unknown as Animation;
  };
}
