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

export interface PageFocus { focused: boolean; visible: boolean }

export async function readBrowserEnvironment(api: BrowserEnvironmentAPI, readPageFocus?: (tab: ActiveTab) => Promise<PageFocus | null>) {
  // Select the tab as the popup does. Do not infer its window from getAll()
  // or require a particular window type (e.g. an installed app/popup window).
  const tabs = await api.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
  const tab = tabs[0];
  if (!tab || tab.incognito) return { tab: null, focused: false, idle: false, windowFocused: false, pageFocused: null, pageVisible: null };
  const [window, activity] = await Promise.all([
    api.windows.get(tab.windowId).catch(() => null),
    api.idle.queryState(60).catch(() => 'locked')
  ]);
  const windowFocused = window?.focused === true && window.state !== 'minimized';
  let page: PageFocus | null = null;
  if (window?.state !== 'minimized' && readPageFocus) page = await readPageFocus(tab).catch(() => null);
  // In an authorized page, the isolated world's document.hasFocus() and
  // visibilityState are independent of Chrome's sometimes stale window flag.
  // A visible tab alone never proves activity. Minimized windows never count.
  const focused = window?.state === 'minimized' ? false : page ? page.focused && page.visible : windowFocused;
  return { tab, focused, idle: activity !== 'active', windowFocused, pageFocused: page?.focused ?? null, pageVisible: page?.visible ?? null };
}
