// Executado no mundo isolado apenas em uma origem autorizada.
export function showOverlay(goal: string, reason: string) {
  document.getElementById('__fio_overlay')?.remove();
  const host = document.createElement('div'); host.id = '__fio_overlay';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = ':host{all:initial}section{position:fixed;bottom:20px;right:20px;z-index:2147483647;width:min(350px,calc(100vw - 40px));box-sizing:border-box;padding:22px;border:1px solid #89a998;border-radius:18px;background:#f7f7ef;color:#19352e;font:15px/1.5 system-ui;box-shadow:0 8px 40px #0003}h2{font-size:19px;margin:0 0 8px}p{margin:8px 0;overflow-wrap:anywhere}button{font:inherit;cursor:pointer;border:1px solid #24644e;border-radius:8px;padding:7px 10px;background:white;color:#19352e;margin:4px}button:focus-visible{outline:3px solid #095ed5;outline-offset:2px}';
  shadow.append(style);
  const panel = document.createElement('section');
  panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', 'Lembrete gentil do Fio');
  const heading = document.createElement('h2'); heading.textContent = 'Quer retomar o fio?'; panel.append(heading);
  for (const value of ['Esta página parece diferente do seu objetivo: ' + goal, reason]) {
    const p = document.createElement('p'); p.textContent = value; panel.append(p);
  }
  for (const [label, choice] of [['Voltar ao foco', 'return'], ['Faz parte da tarefa', 'relevant'], ['Adiar', 'snooze'], ['Ignorar site', 'ignore'], ['Pausar sessão', 'pause'], ['Fechar', 'snooze']]) {
    const button = document.createElement('button'); button.textContent = label!;
    button.addEventListener('click', () => {
      void chrome.runtime.sendMessage({ type: 'FEEDBACK', choice }).catch(() => {});
      host.remove();
    }); panel.append(button);
  }
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') { host.remove(); void chrome.runtime.sendMessage({ type: 'FEEDBACK', choice: 'snooze' }); } });
  shadow.append(panel); document.documentElement.append(host);
}
export function removeOverlay() { document.getElementById('__fio_overlay')?.remove(); }
