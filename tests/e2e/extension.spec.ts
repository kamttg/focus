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
 manifest.host_permissions = ['https://public.example.test/*', 'http://127.0.0.1/*'];
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
});
test.beforeEach(async ({}, info) => {
 const control = await context.newPage(); await control.goto('chrome-extension://' + id + '/options.html');
 const result = await control.evaluate(async ({ endpoint, consent }) => {
   await chrome.runtime.sendMessage({ type: 'FINISH' });
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
test('sem permissão de origem: nenhuma extração ou chamada à API', async () => {
 const site = await context.newPage();
 await site.route('https://unauthorized.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Pandas</title><main><h1>DataFrame</h1><p>Limpeza de dados</p></main>' }));
 await site.goto('https://unauthorized.example.test/tutorial');
 const popup = await context.newPage(); await popup.goto('chrome-extension://' + id + '/popup.html');
 await popup.getByLabel('Tema e objetivo').fill('Estudar Pandas');
 await popup.getByRole('button', { name: 'Iniciar sessão' }).click();
 await expect(popup.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
 await site.bringToFront();
 await expect.poll(() => worker.evaluate(async () => (await chrome.storage.session.get('runtime')).runtime.status)).toBe('not_monitored');
 const state = await worker.evaluate(async () => (await chrome.storage.session.get('runtime')).runtime);
 expect(state.session.analyses).toBe(0); expect(state.classification).toBeNull();
 await popup.bringToFront(); await popup.getByRole('button', { name: 'Encerrar sessão' }).click();
 await popup.close(); await site.close();
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

test('identifica página autorizada em janela Chrome do tipo popup', async () => {
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
 await expect.poll(async () => (await state()).focused, { timeout: 10000 }).toBe(true);
 await expect.poll(async () => (await state()).domain, { timeout: 15000 }).toBe('public.example.test');
 await expect.poll(async () => (await state()).classification?.label, { timeout: 15000 }).toBe('relevant');
 expect((await state()).focused).toBe(true);
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
 // Selecting the page dismisses Chrome's action popup without switching tabs.
 await site.mouse.click(20, 180);
 await expect.poll(() => worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['POPUP'] }))).toHaveLength(0);
 const state = () => worker.evaluate(async () => (await chrome.storage.session.get('runtime')).runtime);
 await expect.poll(async () => (await state()).classification?.label, { timeout: 15000 }).toBe('relevant');
 expect((await state()).domain).toBe('public.example.test');
 await control.bringToFront();
 await control.evaluate(() => chrome.runtime.sendMessage({ type: 'FINISH' }));
 await control.close(); await site.close();
});
