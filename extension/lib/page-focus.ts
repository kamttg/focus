// Serialized into the isolated world. This reads two activity booleans only,
// never page text, input values, keystrokes, or pointer coordinates.
export function probePageFocus() {
  const scope = window as unknown as Record<string, unknown>;
  const marker = '__fioFocusObserver';
  if (!scope[marker]) {
    const report = () => { void chrome.runtime.sendMessage({ type: 'PAGE_FOCUS_CHANGED' }).catch(cleanup); };
    const stop = (message: { type?: string }, sender: chrome.runtime.MessageSender) => {
      if (message.type === 'FIO_STOP' && sender.id === chrome.runtime.id) cleanup();
    };
    function cleanup() {
      window.removeEventListener('focus', report);
      window.removeEventListener('blur', report);
      document.removeEventListener('visibilitychange', report);
      chrome.runtime.onMessage.removeListener(stop);
      delete scope[marker];
    }
    scope[marker] = true;
    window.addEventListener('focus', report);
    window.addEventListener('blur', report);
    document.addEventListener('visibilitychange', report);
    chrome.runtime.onMessage.addListener(stop);
  }
  return { focused: document.hasFocus(), visible: document.visibilityState === 'visible' };
}
