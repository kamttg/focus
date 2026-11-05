import { test, expect, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { mkdtemp, rm, mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extractPageContext } from '../../extension/lib/extractor';
let context: BrowserContext; let worker: Worker; let id: string; let profile: string;
let server: Server; let endpoint: string; const requests: any[] = []; let completedRequests = 0;
test.beforeAll(async () => {
 profile = await mkdtemp(path.join(tmpdir(), 'fio-test-'));
 const original = path.resolve('extension/.output/chrome-mv3');
 const manifest = JSON.parse(await readFile(path.join(original, 'manifest.json'), 'utf8'));
 expect(manifest.host_permissions || []).toEqual([]);
 expect(manifest.optional_host_permissions).toContain('https://*/*');
 // Só a cópia de teste recebe origens pré-concedidas; o build distribuído continua opcional.
 const extensionPath = path.join(profile, 'test-extension'); await cp(original, extensionPath, { recursive: true });
 manifest.host_permissions = ['http://*/*', 'https://*/*'];
 await writeFile(path.join(extensionPath, 'manifest.json'), JSON.stringify(manifest));
 server = createServer(async (req, res) => {
   res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
   res.setHeader('Access-Control-Allow-Headers', 'content-type,authorization');
   if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
   let body = ''; for await (const chunk of req) body += chunk;
   const data = JSON.parse(body); requests.push(data);
   if (data.page.title.includes('lento')) await new Promise(resolve => setTimeout(resolve, 1500));
   completedRequests++;
   res.setHeader('Content-Type', 'application/json');
   if (data.page.title.includes('Offline')) { res.writeHead(503).end('{}'); return; }
   if (data.page.title.includes('Rate limit')) { res.writeHead(502).end(JSON.stringify({ error: 'provider_rate_limit', retryAfterSeconds: 120 })); return; }
   if (data.page.title.includes('Ambiguo')) { res.end(JSON.stringify({ label: 'uncertain', confidence: .5, reason: 'Informação insuficiente.' })); return; }
   const relevant = data.page.title.includes('Pandas');
   res.end(JSON.stringify({ label: relevant ? 'relevant' : 'off_topic', confidence: .95, reason: relevant ? 'Tutorial do tema.' : 'Conteúdo de entretenimento.' }));
 });
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
 endpoint = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
 context = await chromium.launchPersistentContext(profile, {
   channel: 'chromium', headless: false,
   args: ['--disable-extensions-except=' + extensionPath, '--load-extension=' + extensionPath]
 });
 worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
 id = new URL(worker.url()).host;
 // CDP input does not consistently reset the OS idle timer in Xvfb.
 // These E2E scenarios assume an active person; idle rules are covered in Vitest.
 await worker.evaluate(() => { chrome.idle.queryState = async () => 'active'; });
});
test.beforeEach(async ({}, info) => {
 const control = await context.newPage(); await control.goto('chrome-extension://' + id + '/options.html');
 const result = await control.evaluate(async ({ endpoint, consent }) => {
   await chrome.runtime.sendMessage({ type: 'FINISH' });
   // Independent tests use a fresh connection; session changes alone must not clear backoff.
   await chrome.runtime.sendMessage({ type: 'SAVE', preferences: { endpoint: 'http://127.0.0.1:1' } });
   return chrome.runtime.sendMessage({ type: 'SAVE', preferences: { endpoint, consent, delayMinutes: 0, cooldownMinutes: 10, stabilitySeconds: 3, notifications: false, overlay: true } });
 }, { endpoint, consent: !info.title.startsWith('sessão real:') });
 expect(result.ok).toBe(true); await control.close();
});
test.afterAll(async () => { await context?.close(); await new Promise<void>(resolve => server?.close(() => resolve())); if (profile) await rm(profile, { recursive: true, force: true }); });
test('sessão real: consentimento, início, pausa, retomada e limpeza do cache', async () => {
 const page = await context.newPage(); await page.goto('chrome-extension://' + id + '/popup.html');
 await expect(page.getByRole('button', { name: 'Iniciar sessão' })).toBeDisabled();
 await page.getByLabel('Tema e objetivo').fill('Estudar limpeza de dados com Pandas');
 await page.getByLabel('Entendi e aceito a análise').check();
 await page.getByRole('button', { name: 'Iniciar sessão' }).click();
 await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
 await page.getByRole('button', { name: 'Pausar', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Retomar', exact: true })).toBeVisible();
 await page.getByRole('button', { name: 'Retomar', exact: true }).click();
 await page.getByRole('button', { name: 'Encerrar sessão' }).click();
 await expect(page.getByRole('button', { name: 'Iniciar sessão' })).toBeVisible();
 const state = await worker.evaluate(async () => (await chrome.storage.session.get('runtime')).runtime);
 expect(state.session.status).toBe('finished'); expect(state.cache).toEqual({});
 await mkdir('docs/screenshots', { recursive: true });
 await page.screenshot({ path: 'docs/screenshots/popup.png', fullPage: true });
 await page.close();
});
test('sem autorização inicial o pacote real não inicia coleta ou consulta à IA', async () => {
 const isolatedProfile = await mkdtemp(path.join(tmpdir(), 'fio-no-access-'));
 const original = path.resolve('extension/.output/chrome-mv3');
 const isolated = await chromium.launchPersistentContext(isolatedProfile, { channel: 'chromium', headless: false,
   args: ['--disable-extensions-except=' + original, '--load-extension=' + original] });
 try {
   const background = isolated.serviceWorkers()[0] || await isolated.waitForEvent('serviceworker');
   const isolatedId = new URL(background.url()).host;
   const site = await isolated.newPage();
   await site.route('https://unauthorized.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Pandas</title><main><p>CONTEUDO_SEM_AUTORIZACAO</p></main>' }));
   await site.goto('https://unauthorized.example.test/tutorial');
   const popup = await isolated.newPage(); await popup.goto('chrome-extension://' + isolatedId + '/popup.html');
   const count = requests.length;
   const result = await popup.evaluate(async () => {
     await chrome.runtime.sendMessage({ type: 'SAVE', preferences: { consent: true } });
     return chrome.runtime.sendMessage({ type: 'START', goal: 'Estudar Pandas', topics: [], kind: 'study', duration: 0 });
   });
   expect(result.ok).toBe(false); expect(result.error).toContain('leitura automática');
   const data = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'GET' }));
   expect(data.result.automaticAccess).toBe(false);
   expect(data.result.state.session).toBeNull();
   expect(data.result.state.classification).toBeNull();
   expect(requests.length).toBe(count);
 } finally { await isolated.close(); await rm(isolatedProfile, { recursive: true, force: true }); }
});
test('extrator no Chromium real não inclui campos e conteúdos invisíveis', async () => {
 const page = await context.newPage();
 await page.route('https://public.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Tutorial Pandas</title><main><h1>DataFrame</h1><p>dropna <span hidden>SEGREDO_HIDDEN</span><input value="SEGREDO_INPUT"><span contenteditable>SEGREDO_EDIT</span> fillna</p><p style="display:none">SEGREDO_CSS</p></main>' }));
 await page.goto('https://public.example.test/tutorial');
 const result = await page.evaluate(extractPageContext);
 expect(result?.excerpt).toContain('dropna'); expect(JSON.stringify(result)).not.toContain('SEGREDO');
 await page.close();
});
test('configurações exibem privacidade e permitem navegação por teclado', async () => {
 const page = await context.newPage(); await page.goto('chrome-extension://' + id + '/options.html');
 await expect(page.getByRole('heading', { name: 'Privacidade e consentimento' })).toBeVisible();
 await page.getByLabel('Endereço do Worker').focus(); await page.keyboard.press('Tab');
 await expect(page.getByLabel('URL do projeto Supabase')).toBeFocused();
 await page.screenshot({ path: 'docs/screenshots/options.png', fullPage: true });
 await page.close();
});

test('ciclo completo com API simulada: mesmo domínio, cache, lembrete e correção humana', async () => {
 requests.length = 0;
 const site = await context.newPage();
 await site.route('https://public.example.test/**', route => {
   const title = route.request().url().includes('humor') ? 'Humor de gatos' : 'Tutorial Pandas';
   return route.fulfill({ contentType: 'text/html', body: '<title>' + title + '</title><main><h1>' + title + '</h1><p>Conteúdo de demonstração público e controlado.</p></main>' });
 });
 await site.goto('https://public.example.test/tutorial');
 const popup = await context.newPage(); await popup.goto('chrome-extension://' + id + '/popup.html');
 await popup.evaluate(async ({ endpoint }) => {
   const r = await chrome.runtime.sendMessage({ type: 'SAVE', preferences: { endpoint, delayMinutes: 0, stabilitySeconds: 3, notifications: false } });
   if (!r.ok) throw new Error(r.error);
 }, { endpoint });
 await popup.getByLabel('Tema e objetivo').fill('Estudar Pandas e limpeza de dados');
 await popup.getByLabel('Avisar após').selectOption('0');
 await popup.getByRole('button', { name: 'Iniciar sessão' }).click();
 await expect(popup.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
 await site.bringToFront();
 const state = () => worker.evaluate(async () => (await chrome.storage.session.get('runtime')).runtime);
 await expect.poll(async () => (await state()).classification?.label, { timeout: 15000 }).toBe('relevant');
 expect(requests).toHaveLength(1);
 await expect(popup.getByRole('heading', { name: 'Parece fazer parte da tarefa' })).toBeVisible();
 await popup.screenshot({ path: 'docs/screenshots/session.png', fullPage: true });
 expect(Object.keys(requests[0])).toEqual(['goal', 'topics', 'page']);
 expect(requests[0].page.domain).toBe('public.example.test');
 await site.goto('https://public.example.test/humor');
 await expect.poll(async () => (await state()).classification?.label, { timeout: 15000 }).toBe('off_topic');
 await expect(site.locator('#__fio_overlay')).toBeAttached();
 await site.screenshot({ path: 'docs/screenshots/reminder.png', fullPage: true });
 expect(requests).toHaveLength(2);
 await site.goto('https://public.example.test/tutorial');
 await expect.poll(async () => (await state()).classification?.label, { timeout: 15000 }).toBe('relevant');
 expect(requests).toHaveLength(2);
 await site.goto('https://public.example.test/humor');
 await expect.poll(async () => (await state()).classification?.label, { timeout: 15000 }).toBe('off_topic');
 expect(requests).toHaveLength(2);
 const response = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'FEEDBACK', choice: 'relevant' }));
 expect(response.ok).toBe(true);
 await expect.poll(async () => (await state()).classification?.label).toBe('relevant');
 expect((await state()).session.feedback['public.example.test']).toBe('relevant');
 await popup.bringToFront(); await popup.getByRole('button', { name: 'Encerrar sessão' }).click();
 expect((await state()).cache).toEqual({});
 await popup.close(); await site.close();
});

test('falha da API mantém uncertain e não produz lembrete injustificado', async () => {
 const site = await context.newPage();
 await site.route('https://public.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Offline</title><main><h1>Conteúdo indisponível</h1><p>Uma página pública sintética.</p></main>' }));
 await site.goto('https://public.example.test/offline');
 const popup = await context.newPage(); await popup.goto('chrome-extension://' + id + '/popup.html');
 await popup.getByLabel('Tema e objetivo').fill('Estudar Pandas');
 await popup.getByRole('button', { name: 'Iniciar sessão' }).click();
 await expect(popup.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
 await site.bringToFront();
 await expect.poll(() => worker.evaluate(async () => (await chrome.storage.session.get('runtime')).runtime.status), { timeout: 15000 }).toBe('uncertain');
 const state = await worker.evaluate(async () => (await chrome.storage.session.get('runtime')).runtime);
 expect(state.session.alerts).toBe(0); expect(state.classification.label).toBe('uncertain');
 await expect(site.locator('#__fio_overlay')).toHaveCount(0);
 await popup.bringToFront(); await popup.getByRole('button', { name: 'Encerrar sessão' }).click();
 await popup.close(); await site.close();
});
test('pausar durante inferência descarta resultado atrasado', async () => {
 const before = completedRequests;
 const site = await context.newPage();
 await site.route('https://public.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Tutorial Pandas lento</title><main><h1>Pandas</h1><p>Dados de teste.</p></main>' }));
 await site.goto('https://public.example.test/slow');
 const popup = await context.newPage(); await popup.goto('chrome-extension://' + id + '/popup.html');
 await popup.getByLabel('Tema e objetivo').fill('Estudar Pandas');
 await popup.getByRole('button', { name: 'Iniciar sessão' }).click();
 await expect(popup.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
 await site.bringToFront();
 await expect.poll(() => worker.evaluate(async () => (await chrome.storage.session.get('runtime')).runtime.status), { timeout: 15000 }).toBe('analyzing');
 const result = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'PAUSE' }));
 expect(result.ok).toBe(true);
 await expect.poll(() => completedRequests).toBeGreaterThan(before);
 const state = await worker.evaluate(async () => (await chrome.storage.session.get('runtime')).runtime);
 expect(state.session.status).toBe('paused'); expect(state.classification).toBeNull(); expect(state.session.alerts).toBe(0);
 await popup.bringToFront(); await popup.getByRole('button', { name: 'Encerrar sessão' }).click();
 await popup.close(); await site.close();
});

test('identifica a aba de uma janela popup sem presumir foco do sistema', async () => {
 const control = await context.newPage(); await control.goto('chrome-extension://' + id + '/popup.html');
 await control.getByLabel('Tema e objetivo').fill('Estudar Pandas');
 await control.getByRole('button', { name: 'Iniciar sessão' }).click();
 await expect(control.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
 const fixture = 'https://public.example.test/popup-window';
 await context.route(fixture, route => route.fulfill({ contentType: 'text/html', body: '<title>Tutorial Pandas</title><main><h1>Pandas</h1><p>Limpeza de dados públicos de teste.</p></main>' }));
 const pageOpened = context.waitForEvent('page');
 const created = await worker.evaluate(url => chrome.windows.create({ url, type: 'popup', focused: true, width: 900, height: 650 }), fixture);
 const popupPage = await pageOpened;
 await popupPage.waitForLoadState('domcontentloaded');
 await popupPage.bringToFront();
 if (created?.id !== undefined) await worker.evaluate(windowId => chrome.windows.update(windowId, { focused: true }), created.id);
 const state = () => worker.evaluate(async () => (await chrome.storage.session.get('runtime')).runtime);
 await expect.poll(async () => (await state()).domain, { timeout: 15000 }).toBe('public.example.test');
 expect((await state()).tabId).toBe(created?.tabs?.[0]?.id);
 if (created?.id !== undefined) {
   const actual = await worker.evaluate(windowId => chrome.windows.get(windowId), created.id);
   // Xvfb has no window manager; requesting focus is not proof of OS focus.
   await expect.poll(async () => (await state()).focused).toBe(actual.focused && actual.state !== 'minimized');
   if (!actual.focused) expect((await state()).clock.offTopicMs).toBe(0);
 }
 if (created?.id !== undefined) await worker.evaluate(windowId => chrome.windows.remove(windowId), created.id);
 await control.bringToFront(); await control.getByRole('button', { name: 'Encerrar sessão' }).click();
 await context.unroute(fixture); await control.close();
});

test('abrir o popup real da barra preserva a identificação da página', async () => {
 const site = await context.newPage();
 await site.route('https://public.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Tutorial Pandas</title><main><h1>Pandas</h1><p>Uma página pública de teste.</p></main>' }));
 await site.goto('https://public.example.test/toolbar-popup');
 const control = await context.newPage(); await control.goto('chrome-extension://' + id + '/popup.html');
 await control.getByLabel('Tema e objetivo').fill('Estudar Pandas');
 await control.getByRole('button', { name: 'Iniciar sessão' }).click();
 await expect(control.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
 await site.bringToFront();
 const state = () => worker.evaluate(async () => (await chrome.storage.session.get('runtime')).runtime);
 await expect.poll(async () => (await state()).classification?.label, { timeout: 15000 }).toBe('relevant');
 await worker.evaluate(() => chrome.action.openPopup());
 await expect.poll(() => worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['POPUP'] }))).toHaveLength(1);
 await expect.poll(async () => (await state()).domain).toBe('public.example.test');
 await expect.poll(async () => (await state()).classification?.label, { timeout: 15000 }).toBe('relevant');
 await control.bringToFront(); await control.getByRole('button', { name: 'Encerrar sessão' }).click();
 await control.close(); await site.close();
});

test('fechar o popup real reavalia a página sem esperar o alarme periódico', async () => {
 const site = await context.newPage();
 await site.route('https://public.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Tutorial Pandas</title><main><h1>Pandas</h1><p>Página de teste público.</p></main>' }));
 await site.goto('https://public.example.test/close-toolbar-popup');
 const control = await context.newPage(); await control.goto('chrome-extension://' + id + '/popup.html');
 await site.bringToFront();
 await worker.evaluate(() => chrome.action.openPopup());
 await expect.poll(() => worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['POPUP'] }))).toHaveLength(1);
 // Start while the real toolbar popup owns focus, like a person using the form.
 const result = await control.evaluate(() => chrome.runtime.sendMessage({ type: 'START', kind: 'study', goal: 'Estudar Pandas', topics: ['Pandas'], duration: 0, useCurrentTab: false }));
 expect(result.ok).toBe(true);
 // CDP mouse events target page content, not Chrome's native popup. Close the
 // real extension view to exercise its disconnect without switching tabs.
 const closed = await control.evaluate(() => {
   const views = chrome.extension.getViews({ type: 'popup' });
   for (const view of views) view.close();
   return views.length;
 });
 expect(closed).toBe(1);
 await expect.poll(() => worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['POPUP'] }))).toHaveLength(0);
 const state = () => worker.evaluate(async () => (await chrome.storage.session.get('runtime')).runtime);
 await expect.poll(async () => (await state()).classification?.label, { timeout: 15000 }).toBe('relevant');
 expect((await state()).domain).toBe('public.example.test');
 await control.bringToFront();
 await control.evaluate(() => chrome.runtime.sendMessage({ type: 'FINISH' }));
 await control.close(); await site.close();
});

test('sinal da página recupera monitoramento quando a janela do Chrome informa foco falso', async () => {
 const site = await context.newPage();
 await site.route('https://public.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Humor de gatos</title><main><h1>Entretenimento</h1><p>Página pública sintética fora da tarefa de estudar Pandas.</p></main>' }));
 await site.goto('https://public.example.test/stale-window-focus');
 const control = await context.newPage(); await control.goto('chrome-extension://' + id + '/popup.html');
 await control.getByLabel('Tema e objetivo').fill('Estudar Pandas');
 await control.getByRole('button', { name: 'Iniciar sessão' }).click();
 await expect(control.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
 await worker.evaluate(() => {
   const global = globalThis as any;
   global.__fioOriginalWindowGet = chrome.windows.get.bind(chrome.windows);
   chrome.windows.get = (async (windowId: number) => ({ ...await global.__fioOriginalWindowGet(windowId), focused: false })) as typeof chrome.windows.get;
 });
 try {
   await site.bringToFront(); await site.mouse.click(20, 160);
   const state = () => worker.evaluate(async () => (await chrome.storage.session.get('runtime')).runtime);
   await expect.poll(async () => (await state()).classification?.label, { timeout: 15000 }).toBe('off_topic');
   expect((await state()).focusSignals).toMatchObject({ window: false, page: true, visible: true });
   await expect(site.locator('#__fio_overlay')).toBeAttached();
 } finally {
   await worker.evaluate(() => { chrome.windows.get = (globalThis as any).__fioOriginalWindowGet; delete (globalThis as any).__fioOriginalWindowGet; });
   await control.bringToFront(); await control.evaluate(() => chrome.runtime.sendMessage({ type: 'FINISH' }));
   await control.close(); await site.close();
 }
});

test('prévia visual funciona sem IA e não altera classificação, chamadas ou cooldown', async () => {
 const site = await context.newPage();
 await site.route('https://public.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Pandas</title><main><h1>Página pública</h1><p>Teste de interface.</p></main>' }));
 await site.goto('https://public.example.test/preview');
 const control = await context.newPage(); await control.goto('chrome-extension://' + id + '/popup.html');
 await control.evaluate(async () => {
   await chrome.runtime.sendMessage({ type: 'START', kind: 'study', goal: 'Estudar Pandas', topics: [], duration: 0, useCurrentTab: false });
   await chrome.runtime.sendMessage({ type: 'PAUSE' });
 });
 await site.bringToFront();
 await worker.evaluate(() => chrome.action.openPopup());
 await expect.poll(() => worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['POPUP'] }))).toHaveLength(1);
 const before = await worker.evaluate(async () => (await chrome.storage.session.get('runtime')).runtime);
 const calls = requests.length;
 const response = await control.evaluate(() => chrome.runtime.sendMessage({ type: 'PREVIEW_REMINDER' }));
 expect(response.ok).toBe(true);
 await control.evaluate(() => { for (const view of chrome.extension.getViews({ type: 'popup' })) view.close(); });
 await expect.poll(() => worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['POPUP'] }))).toHaveLength(0);
 await expect(site.locator('#__fio_preview')).toBeAttached();
 const after = await worker.evaluate(async () => (await chrome.storage.session.get('runtime')).runtime);
 expect(after.classification).toEqual(before.classification);
 expect(after.clock.cooldownUntil).toBe(before.clock.cooldownUntil);
 expect(after.session.analyses).toBe(before.session.analyses);
 expect(after.session.alerts).toBe(before.session.alerts);
 expect(requests.length).toBe(calls);
 await site.screenshot({ path: 'docs/screenshots/preview.png', fullPage: true });
 await control.close(); await site.close();
});

test('após a ativação inicial troca de domínio e analisa automaticamente sem novas liberações', async () => {
 const site = await context.newPage();
 await site.route('https://public.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Tutorial Pandas</title><main><h1>Pandas</h1><p>Dados públicos para estudo.</p></main>' }));
 await site.route('https://another.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Humor de gatos</title><main><h1>Entretenimento</h1><p>Outro domínio, fora do tema de estudo.</p></main>' }));
 await site.goto('https://public.example.test/automatic');
 const control = await context.newPage(); await control.goto('chrome-extension://' + id + '/popup.html');
 await control.getByLabel('Tema e objetivo').fill('Estudar Pandas');
 await control.getByRole('button', { name: 'Iniciar sessão' }).click();
 await expect(control.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
 await expect(control.getByRole('button', { name: 'Autorizar site atual', exact: true })).toHaveCount(0);
 await site.bringToFront();
 const state = () => worker.evaluate(async () => (await chrome.storage.session.get('runtime')).runtime);
 await expect.poll(async () => (await state()).classification?.label, { timeout: 15000 }).toBe('relevant');
 await site.goto('https://another.example.test/automatic');
 await expect.poll(async () => (await state()).classification?.label, { timeout: 15000 }).toBe('off_topic');
 expect((await state()).domain).toBe('another.example.test');
 await expect(site.locator('#__fio_overlay')).toBeAttached();
 await control.bringToFront(); await control.evaluate(() => chrome.runtime.sendMessage({ type: 'FINISH' }));
 await control.close(); await site.close();
});

test('remover acesso amplo interrompe análises mesmo quando uma origem ainda consta como permitida', async () => {
 const site = await context.newPage();
 await site.route('https://public.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Tutorial Pandas</title><main><h1>Pandas</h1><p>Página de estudo controlada.</p></main>' }));
 await site.goto('https://public.example.test/revoke-global');
 const control = await context.newPage(); await control.goto('chrome-extension://' + id + '/popup.html');
 await control.getByLabel('Tema e objetivo').fill('Estudar Pandas');
 await control.getByRole('button', { name: 'Iniciar sessão' }).click();
 await expect(control.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
 await site.bringToFront();
 const state = () => worker.evaluate(async () => (await chrome.storage.session.get('runtime')).runtime);
 await expect.poll(async () => (await state()).classification?.label, { timeout: 15000 }).toBe('relevant');
 const analyses = (await state()).session.analyses;
 await worker.evaluate(() => {
   const scope = globalThis as any;
   scope.__fioContains = chrome.permissions.contains.bind(chrome.permissions);
   chrome.permissions.contains = (async (query: chrome.permissions.Permissions) => query.origins?.includes('https://*/*') ? false : scope.__fioContains(query)) as typeof chrome.permissions.contains;
 });
 try {
   const response = await control.evaluate(() => chrome.runtime.sendMessage({ type: 'RETRY' }));
   expect(response.ok).toBe(true);
   await expect.poll(async () => (await state()).monitoringReason).toBe('automatic_access_required');
   await site.goto('https://public.example.test/other-after-revocation');
   await site.waitForTimeout(3500);
   expect((await state()).session.analyses).toBe(analyses);
   expect((await state()).classification).toBeNull();
 } finally {
   await worker.evaluate(() => { chrome.permissions.contains = (globalThis as any).__fioContains; delete (globalThis as any).__fioContains; });
   await control.bringToFront(); await control.evaluate(() => chrome.runtime.sendMessage({ type: 'FINISH' }));
   await control.close(); await site.close();
 }
});


test('classificação incerta válida não repete IA no heartbeat', async () => {
 test.setTimeout(60000);
 const site = await context.newPage();
 await site.route('https://public.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Ambiguo</title><main><p>Informação curta.</p></main>' }));
 await site.goto('https://public.example.test/uncertain');
 const control = await context.newPage(); await control.goto('chrome-extension://' + id + '/popup.html');
 await control.evaluate(() => chrome.runtime.sendMessage({ type: 'START', kind: 'study', goal: 'Estudar Pandas', topics: [], duration: 0 }));
 await site.bringToFront();
 const state = () => worker.evaluate(async () => (await chrome.storage.session.get('runtime')).runtime);
 await expect.poll(async () => (await state()).classification?.label, { timeout: 15000 }).toBe('uncertain');
 const count = requests.length;
 await site.waitForTimeout(31000);
 expect(requests.length).toBe(count);
 await control.evaluate(() => chrome.runtime.sendMessage({ type: 'FINISH' }));
 await control.close(); await site.close();
});

test('429 não é contornado por nova sessão, mudança de página ou tentativa manual', async () => {
 const site = await context.newPage();
 await site.route('https://public.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Rate limit</title><main><p>Página controlada.</p></main>' }));
 await site.goto('https://public.example.test/rate');
 const control = await context.newPage(); await control.goto('chrome-extension://' + id + '/popup.html');
 const start = () => control.evaluate(() => chrome.runtime.sendMessage({ type: 'START', kind: 'study', goal: 'Estudar Pandas', topics: [], duration: 0 }));
 await start(); await site.bringToFront();
 const state = () => worker.evaluate(async () => (await chrome.storage.session.get('runtime')).runtime);
 await expect.poll(async () => (await state()).lastError, { timeout: 15000 }).toContain('excesso de chamadas');
 const count = requests.length; const until = (await state()).backoffUntil;
 expect(until - Date.now()).toBeGreaterThan(110000);
 await control.evaluate(() => chrome.runtime.sendMessage({ type: 'RETRY' }));
 await control.evaluate(() => chrome.runtime.sendMessage({ type: 'FINISH' }));
 await start(); await site.bringToFront();
 await site.goto('https://public.example.test/another-rate');
 await site.waitForTimeout(4000);
 expect((await state()).backoffUntil).toBe(until);
 expect(requests.length).toBe(count);
 await control.evaluate(() => chrome.runtime.sendMessage({ type: 'FINISH' }));
 await control.close(); await site.close();
});
