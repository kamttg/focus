// Esta função é serializada por chrome.scripting: não pode depender de imports.
export function extractPageContext() {
  const root = document.documentElement;
  const sensitive = 'input,textarea,select,button,form,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"],[role="textbox"],[role="log"],[role="dialog"],[data-private],.private,.message,.messages,.chat,.comment,.comments,#comments,nav,footer,aside,script,style,noscript';
  if (document.querySelector('input[type="password"],input[autocomplete="cc-number"],input[autocomplete="current-password"]'))
    return null;
  const visible = (el: Element) => {
    if (el.closest(sensitive)) return false;
    for (let p: Element | null = el; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    }
    return el.getClientRects().length > 0;
  };
  const sanitize = (text: string) => text.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/https?:\/\/\S+/gi, '[link]').replace(/\b\d[\d .()+-]{6,}\d\b/g, '[número]')
    .replace(/\s+/g, ' ').trim();
  // Apenas text nodes visíveis; textContent no ancestral incluiria campos privados.
  const text = (el: Element, cap: number) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null; let out = '';
    while ((node = walker.nextNode()) && out.length < cap) {
      if (node.parentElement && visible(node.parentElement)) out += ' ' + (node.textContent || '');
    }
    return sanitize(out).slice(0, cap);
  };
  let remaining = 1500;
  const take = (s: string, cap: number) => {
    const value = sanitize(s).slice(0, Math.min(cap, remaining));
    remaining -= value.length; return value;
  };
  // Não usar metadados invisíveis: description deriva do primeiro parágrafo visível.
  const title = take(document.title, 220);
  const main = document.querySelector('main,article,[role="main"]') || root;
  const first = Array.from(main.querySelectorAll('p')).find(visible);
  const description = take(first ? text(first, 240) : '', 240);
  const headings = Array.from(main.querySelectorAll('h1,h2,h3')).filter(visible).slice(0, 8)
    .map(el => take(text(el, 100), 100)).filter(Boolean);
  const excerpt = take(Array.from(main.querySelectorAll('p,pre,figcaption')).filter(visible).slice(0, 30)
    .map(el => text(el, 220)).join(' '), 900);
  return { domain: location.hostname, title, description, headings, excerpt };
}

export function installPageObserver() {
  const marker = '__fioObserverInstalled';
  const w = window as unknown as Record<string, unknown>;
  if (w[marker]) return;
  w[marker] = true;
  let timer: ReturnType<typeof setTimeout>;
  const signatureNow = () => location.href + document.title + Array.from(document.querySelectorAll('main h1,main h2,article h1,article h2'))
    .slice(0, 8).filter(el => !el.closest('[hidden],[aria-hidden="true"],[data-private],form,[contenteditable]') && getComputedStyle(el).display !== 'none')
    .map(el => el.textContent?.slice(0, 100)).join('');
  let previous = signatureNow(); let changedCharacters = 0;
  const observer = new MutationObserver(records => {
    for (const record of records) {
      const element = record.target.nodeType === Node.ELEMENT_NODE ? record.target as Element : record.target.parentElement;
      if (element?.closest('main,article,[role="main"]') && !element.closest('#__fio_overlay,input,textarea,form,[contenteditable],.messages,.chat,[data-private]')) {
        changedCharacters += record.type === 'characterData' ? Math.abs((record.target.textContent?.length || 0) - (record.oldValue?.length || 0)) : record.addedNodes.length * 80 + record.removedNodes.length * 80;
      }
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      const signature = signatureNow();
      if (signature !== previous || changedCharacters >= 80) {
        previous = signature; changedCharacters = 0;
        void chrome.runtime.sendMessage({ type: 'DIRTY' }).catch(() => observer.disconnect());
      }
    }, 1500);
  });
  const stop = (message: { type?: string }, sender: chrome.runtime.MessageSender) => {
    if (message.type === 'FIO_STOP' && sender.id === chrome.runtime.id) {
      observer.disconnect(); clearTimeout(timer); delete w[marker];
      chrome.runtime.onMessage.removeListener(stop);
      document.getElementById('__fio_overlay')?.remove();
    }
  };
  chrome.runtime.onMessage.addListener(stop);
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, characterDataOldValue: true });
}
