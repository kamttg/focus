import { describe, it, expect, vi } from 'vitest';
import { readBrowserEnvironment } from '../../extension/lib/browser-environment';
import { monitoringMessages } from '../../extension/lib/monitoring-status';

function api(options: { focused?: boolean; state?: string; activity?: string; incognito?: boolean; tabs?: boolean } = {}) {
  return {
    tabs: { query: vi.fn().mockResolvedValue(options.tabs === false ? [] : [{ id: 12, windowId: 7, url: 'https://pandas.pydata.org/docs/', incognito: options.incognito || false }]) },
    windows: { get: vi.fn().mockResolvedValue({ focused: options.focused ?? true, state: options.state || 'normal', type: 'popup' }) },
    idle: { queryState: vi.fn().mockResolvedValue(options.activity || 'active') }
  };
}

describe('seleção da aba e foco do navegador', () => {
  it('usa a mesma seleção da autorização e não descarta janelas popup', async () => {
    const browser = api();
    const environment = await readBrowserEnvironment(browser);
    expect(browser.tabs.query).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true });
    expect(browser.windows.get).toHaveBeenCalledWith(7);
    expect(environment).toMatchObject({ tab: { id: 12, windowId: 7, url: 'https://pandas.pydata.org/docs/', incognito: false }, focused: true, idle: false });
  });
  it('mantém o domínio identificável sem considerar a janela em segundo plano como ativa', async () => {
    const environment = await readBrowserEnvironment(api({ focused: false }));
    expect(environment.tab?.url).toContain('pandas.pydata.org');
    expect(environment.focused).toBe(false);
  });
  it('janela minimizada não conta como foco', async () => {
    expect((await readBrowserEnvironment(api({ state: 'minimized' }))).focused).toBe(false);
  });
  it.each(['idle', 'locked'])('não considera o sistema %s como atividade', async activity => {
    expect((await readBrowserEnvironment(api({ activity }))).idle).toBe(true);
  });
  it('não seleciona aba anônima', async () => {
    const browser = api({ incognito: true });
    expect((await readBrowserEnvironment(browser)).tab).toBeNull();
    expect(browser.windows.get).not.toHaveBeenCalled();
  });
  it('tolera ausência de aba sem consultar uma janela inválida', async () => {
    const browser = api({ tabs: false });
    expect((await readBrowserEnvironment(browser)).tab).toBeNull();
    expect(browser.windows.get).not.toHaveBeenCalled();
  });
  it('falha ao verificar foco mantém a contagem e a coleta suspensas', async () => {
    const browser = api(); browser.windows.get.mockRejectedValue(new Error('Window closed'));
    expect((await readBrowserEnvironment(browser)).focused).toBe(false);
  });
  it('falha na detecção de atividade não presume que a pessoa está ativa', async () => {
    const browser = api(); browser.idle.queryState.mockRejectedValue(new Error('Unavailable'));
    expect((await readBrowserEnvironment(browser)).idle).toBe(true);
  });
  it('separa falta de permissão, consentimento e foco nos textos apresentados', () => {
    expect(monitoringMessages.permission_required.title).toBe('Autorize este site');
    expect(monitoringMessages.window_unfocused.title).not.toBe(monitoringMessages.permission_required.title);
    expect(monitoringMessages.consent_required.description).toContain('consentimento');
  });
});

describe('foco independente da página autorizada', () => {
  it('recupera foco quando o Chrome informa false mas a página tem foco e está visível', async () => {
    const environment = await readBrowserEnvironment(api({ focused: false }), async () => ({ focused: true, visible: true }));
    expect(environment.focused).toBe(true);
    expect(environment.windowFocused).toBe(false);
    expect(environment.pageFocused).toBe(true);
  });
  it('uma página apenas visível não prova foco', async () => {
    expect((await readBrowserEnvironment(api({ focused: false }), async () => ({ focused: false, visible: true }))).focused).toBe(false);
  });
  it('não conta uma página oculta mesmo que outro sinal indique foco', async () => {
    expect((await readBrowserEnvironment(api(), async () => ({ focused: true, visible: false }))).focused).toBe(false);
  });
  it('teclado na barra do navegador não desativa uma aba visível em uma janela focada', async () => {
    expect((await readBrowserEnvironment(api(), async () => ({ focused: false, visible: true }))).focused).toBe(true);
  });
  it('não faz a sondagem em janela minimizada', async () => {
    const probe = vi.fn().mockResolvedValue({ focused: true, visible: true });
    expect((await readBrowserEnvironment(api({ state: 'minimized' }), probe)).focused).toBe(false);
    expect(probe).not.toHaveBeenCalled();
  });
  it('não faz sondagem em aba anônima', async () => {
    const probe = vi.fn();
    expect((await readBrowserEnvironment(api({ incognito: true }), probe)).tab).toBeNull();
    expect(probe).not.toHaveBeenCalled();
  });
  it('uma falha da sondagem não transforma foco negativo em atividade', async () => {
    expect((await readBrowserEnvironment(api({ focused: false }), async () => { throw new Error('Denied'); })).focused).toBe(false);
  });
  it('confirmação de foco não ignora o estado idle', async () => {
    const environment = await readBrowserEnvironment(api({ activity: 'idle' }), async () => ({ focused: true, visible: true }));
    expect(environment.idle).toBe(true);
  });
});
it('uma página autorizada pode confirmar foco mesmo se a consulta da janela falhar', async () => {
 const browser = api({ focused: false }); browser.windows.get.mockRejectedValue(new Error('Unavailable'));
 const environment = await readBrowserEnvironment(browser, async () => ({ focused: true, visible: true }));
 expect(environment.focused).toBe(true); expect(environment.windowFocused).toBe(false);
});
