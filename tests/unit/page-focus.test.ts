// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { probePageFocus } from '../../extension/lib/page-focus';
let listener: ((message: { type: string }, sender: { id: string }) => void) | undefined;
let send: ReturnType<typeof vi.fn>;
beforeEach(() => {
  send = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('chrome', { runtime: { id: 'fixture', sendMessage: send,
    onMessage: { addListener: (fn: typeof listener) => { listener = fn; }, removeListener: vi.fn() } } });
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { listener?.({ type: 'FIO_STOP' }, { id: 'fixture' }); listener = undefined; vi.unstubAllGlobals(); });
it('retorna apenas dois sinais, sem capturar texto ou valores de campos', () => {
 document.body.innerHTML = '<p>PRIVADO</p><input value="SEGREDO">';
 expect(probePageFocus()).toEqual({ focused: true, visible: true });
 window.dispatchEvent(new Event('focus'));
 expect(send).toHaveBeenCalledWith({ type: 'PAGE_FOCUS_CHANGED' });
 expect(JSON.stringify(send.mock.calls)).not.toContain('SEGREDO');
 expect(JSON.stringify(send.mock.calls)).not.toContain('PRIVADO');
});
it('para de observar quando a sessão pausa, termina ou a origem é revogada', () => {
 probePageFocus();
 listener?.({ type: 'FIO_STOP' }, { id: 'fixture' });
 window.dispatchEvent(new Event('focus'));
 document.dispatchEvent(new Event('visibilitychange'));
 expect(send).not.toHaveBeenCalled();
});
