import { writable } from 'svelte/store';

export const uartLog = writable<string[]>([]);
export const uartConnected = writable<boolean>(false);
