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
  let previous = '';
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const signature = location.href + document.title + Array.from(document.querySelectorAll('main h1,main h2,article h1,article h2'))
        .slice(0, 8).map(el => el.textContent?.slice(0, 100)).join('');
      if (signature !== previous) {
        previous = signature;
        void chrome.runtime.sendMessage({ type: 'DIRTY' }).catch(() => observer.disconnect());
      }
    }, 1500);
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
}
