import { writable } from 'svelte/store';

export const sidebarCollapsed = writable<boolean>(false);
export const sidebarOverlay = writable<boolean>(false);
