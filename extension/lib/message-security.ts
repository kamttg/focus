export interface Sender { id?: string; url?: string; frameId?: number }
export function isTrustedUI(sender: Sender, extensionId: string): boolean {
  if (sender.id !== extensionId || (sender.frameId ?? 0) !== 0) return false;
  try {
    const u = new URL(sender.url || '');
    return u.protocol === 'chrome-extension:' && u.hostname === extensionId &&
      ['/popup.html', '/options.html'].includes(u.pathname);
  } catch { return false; }
}
