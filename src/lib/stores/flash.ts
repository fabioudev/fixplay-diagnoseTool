import { writable } from 'svelte/store';
import type { DeviceInfo, FlashProgress } from '$lib/api/types';

export const flashDevices = writable<DeviceInfo[]>([]);
export const flashBusy = writable<boolean>(false);
export const flashProgress = writable<FlashProgress | null>(null);
