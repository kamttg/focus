import type { Preferences, RuntimeState } from './session';
export interface Snapshot { state: RuntimeState; prefs: Preferences; origins: string[]; signedIn: boolean }
export async function rpc<T = unknown>(type: string, data: Record<string, unknown> = {}): Promise<T> {
  const response = await chrome.runtime.sendMessage({ type, ...data });
  if (!response?.ok) throw new Error(response?.error || 'O Fio não está disponível.');
  return response.result as T;
}
