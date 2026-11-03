export interface ActiveTab {
  id?: number;
  url?: string;
  windowId: number;
  incognito?: boolean;
}

export interface BrowserEnvironmentAPI {
  tabs: { query(options: { active: boolean; lastFocusedWindow: boolean }): Promise<ActiveTab[]> };
  windows: { get(windowId: number): Promise<{ focused: boolean; state?: string }> };
  idle: { queryState(seconds: number): Promise<string> };
}

export async function readBrowserEnvironment(api: BrowserEnvironmentAPI) {
  // Select the tab as the popup does. Do not infer its window from getAll()
  // or require a particular window type (e.g. an installed app/popup window).
  const tabs = await api.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
  const tab = tabs[0];
  if (!tab || tab.incognito) return { tab: null, focused: false, idle: false };
  const [window, activity] = await Promise.all([
    api.windows.get(tab.windowId).catch(() => null),
    api.idle.queryState(60).catch(() => 'locked')
  ]);
  // Keep the selected tab for the UI when Chrome loses focus, but do not
  // collect, classify, or count time until its actual window is focused.
  return { tab, focused: window?.focused === true && window.state !== 'minimized', idle: activity !== 'active' };
}
