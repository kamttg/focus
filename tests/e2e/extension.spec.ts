import { test, expect, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractPageContext } from '../../extension/lib/extractor';
let context: BrowserContext; let worker: Worker; let id: string; let profile: string;
test.beforeAll(async () => {
 profile = await mkdtemp(path.join(tmpdir(), 'fio-test-'));
 const extensionPath = path.resolve('extension/.output/chrome-mv3');
 context = await chromium.launchPersistentContext(profile, {
   channel: 'chromium', headless: false,
   args: ['--disable-extensions-except=' + extensionPath, '--load-extension=' + extensionPath]
 });
 worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
 id = new URL(worker.url()).host;
});
test.afterAll(async () => { await context?.close(); if (profile) await rm(profile, { recursive: true, force: true }); });
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
 await site.route('https://public.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Pandas</title><main><h1>DataFrame</h1><p>Limpeza de dados</p></main>' }));
 await site.goto('https://public.example.test/tutorial');
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
