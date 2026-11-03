import { isTrustedUI } from '../lib/message-security';
import { defaults, initialState, hashContext, cached, type RuntimeState, type Preferences } from '../lib/session';
import { accrue, resetContinuous, shouldAlert } from '../lib/decision-engine';
import { allowedPage, originPattern, validEndpoint } from '../lib/privacy';
import { extractPageContext, installPageObserver } from '../lib/extractor';
import { showOverlay, removeOverlay } from '../lib/overlay';
import { classify } from '../lib/api-client';
import { requestSchema, uncertain, type Classification } from '../../shared/contracts';

export default defineBackground(() => {
  let state: RuntimeState = initialState();
  let prefs: Preferences = { ...defaults };
  let queue: Promise<unknown> = Promise.resolve();
  const inFlight = new Map<string, { promise: Promise<Classification>; controller: AbortController }>();
  const cancelRequests = () => { for (const item of inFlight.values()) item.controller.abort(); inFlight.clear(); };
  let stabilityTimer: ReturnType<typeof setTimeout> | undefined;
  const run = <T>(fn: () => Promise<T>): Promise<T> => {
    const result = queue.then(fn); queue = result.catch(() => {}); return result;
  };
  const save = async () => { await chrome.storage.session.set({ runtime: state }); };
  const active = () => state.session?.status === 'active';
  const counting = () => !!(active() && state.focused && !state.idle && state.classification?.label === 'off_topic' && state.classification.confidence >= .8);
  const tick = () => { state.clock = accrue(state.clock, Date.now(), counting()); };
  const invalidate = () => { state.revision++; state.classification = null; };
  async function stopObserver(tabId = state.tabId) {
    if (tabId !== null) await chrome.tabs.sendMessage(tabId, { type: 'FIO_STOP' }).catch(() => {});
  }
  async function clearOverlay(tabId = state.tabId) {
    if (tabId !== null) await chrome.scripting.executeScript({ target: { tabId }, func: removeOverlay }).catch(() => {});
  }
  async function finish() {
    tick(); invalidate(); cancelRequests(); clearTimeout(stabilityTimer);
    await chrome.alarms.clear('fio-stable'); await stopObserver();
    if (state.session) { state.session.status = 'finished'; state.session.feedback = {}; }
    state.cache = {}; state.status = 'finished'; state.url = ''; state.domain = '';
    state.clock = resetContinuous(state.clock, Date.now());
    await chrome.notifications.clear('fio-reminder'); await clearOverlay(); await save();
  }
  async function pause() {
    tick(); invalidate(); cancelRequests();
    if (state.session?.status === 'active') { state.session.status = 'paused'; state.session.pausedAt = Date.now(); }
    state.status = 'paused'; clearTimeout(stabilityTimer);
    await chrome.alarms.clear('fio-stable'); await stopObserver(); await clearOverlay(); await save();
  }
  async function remind() {
    const s = state.session;
    if (!s || !shouldAlert(state.classification, state.clock, Date.now(), prefs.delayMinutes * 60_000, counting())) return;
    state.clock.cooldownUntil = Date.now() + prefs.cooldownMinutes * 60_000;
    s.alerts++; await save();
    if (prefs.notifications) {
      await chrome.notifications.create('fio-reminder', {
        type: 'basic', iconUrl: chrome.runtime.getURL('icon.png'),
        title: 'Quer retomar o fio?',
        message: 'Este conteúdo parece diferente do objetivo: ' + s.goal,
        buttons: [{ title: 'Faz parte da tarefa' }, { title: 'Adiar' }], priority: 0, silent: true
      }).catch(() => {});
    }
    if (prefs.overlay && state.tabId !== null && await eligible(state.url)) {
      await chrome.scripting.executeScript({ target: { tabId: state.tabId }, func: showOverlay,
        args: [s.goal, state.classification?.reason || '', s.focusTabId !== null] }).catch(() => {});
    }
  }
  async function eligible(url: string) {
    return prefs.consent && allowedPage(url, prefs.exclusions) &&
      await chrome.permissions.contains({ origins: [originPattern(url)] });
  }
  async function syncEnvironment() {
    const windows = await chrome.windows.getAll();
    const focused = windows.find(w => w.focused && w.type === 'normal');
    const tabs = focused?.id !== undefined ? await chrome.tabs.query({ active: true, windowId: focused.id }) : [];
    const tab = tabs[0];
    state.focused = !!focused;
    state.idle = (await chrome.idle.queryState(60)) !== 'active';
    return tab && !tab.incognito ? tab : null;
  }
  async function schedule() {
    clearTimeout(stabilityTimer); await chrome.alarms.clear('fio-stable');
    if (!active() || !state.focused || state.idle) return;
    const at = Date.now() + prefs.stabilitySeconds * 1000;
    await chrome.alarms.create('fio-stable', { when: at });
    stabilityTimer = setTimeout(() => { void run(analyze); }, prefs.stabilitySeconds * 1000);
  }
  async function observe() {
    tick(); invalidate();
    await stopObserver(); await clearOverlay();
    if (!active() || !prefs.consent) {
      state.tabId = null; state.url = ''; state.domain = ''; state.focused = false; state.idle = false;
      state.status = active() ? 'not_monitored' : (state.session?.status || 'inactive');
      clearTimeout(stabilityTimer); await chrome.alarms.clear('fio-stable'); await save(); return;
    }
    const tab = await syncEnvironment();
    const url = tab?.url || '';
    const changed = state.tabId !== tab?.id || state.url !== url;
    if (changed) { await clearOverlay(); state.clock = resetContinuous(state.clock, Date.now()); }
    state.tabId = tab?.id ?? null; state.url = url;
    try { state.domain = new URL(url).hostname; } catch { state.domain = ''; }
    state.status = active() ? 'waiting' : (state.session?.status || 'inactive');
    if (active() && (!tab || !state.focused || state.idle)) state.status = 'not_monitored';
    else if (active() && !(await eligible(url))) state.status = 'not_monitored';
    await save(); await schedule();
  }
  async function accept(result: Classification, revision: number, key: string, latency: number) {
    if (revision !== state.revision || !active()) return;
    const tab = await syncEnvironment();
    if (tab?.id !== state.tabId || tab?.url !== state.url || state.idle || !state.focused || !(await eligible(state.url))) {
      await observe(); return;
    }
    tick();
    const feedback = state.session?.feedback[state.domain];
    state.classification = feedback === 'relevant' ? { label: 'relevant', confidence: 1, reason: 'Você indicou que este site faz parte da tarefa.' } : result;
    state.status = feedback === 'ignored' ? 'not_monitored' : state.classification.label;
    if (feedback === 'ignored') state.classification = null;
    if (state.classification?.label !== 'off_topic') state.clock = resetContinuous(state.clock, Date.now());
    if (key && feedback === undefined) {
      const entries = Object.entries(state.cache).filter(([, v]) => v.expiresAt > Date.now()).slice(-99);
      state.cache = Object.fromEntries(entries);
      state.cache[key] = { result, expiresAt: Date.now() + 10 * 60_000 };
    }
    state.clock.lastAt = Date.now(); state.lastLatencyMs = latency;
    await save(); await remind();
  }
  async function analyze() {
    clearTimeout(stabilityTimer); await chrome.alarms.clear('fio-stable');
    const s = state.session;
    if (!s || !active() || !state.focused || state.idle || state.tabId === null || state.status === 'analyzing') return;
    if (s.endsAt && Date.now() >= s.endsAt) { await finish(); return; }
    if (!(await eligible(state.url))) { state.status = 'not_monitored'; await save(); return; }
    const feedback = s.feedback[state.domain];
    if (feedback) {
      tick(); state.classification = feedback === 'relevant' ? { label: 'relevant', confidence: 1, reason: 'Você indicou que este site faz parte da tarefa.' } : null;
      state.status = feedback === 'relevant' ? 'relevant' : 'not_monitored';
      state.clock = resetContinuous(state.clock, Date.now()); await save(); return;
    }
    const revision = state.revision;
    let page;
    try {
      const results = await chrome.scripting.executeScript({ target: { tabId: state.tabId }, func: extractPageContext });
      page = results[0]?.result;
      if (page) await chrome.scripting.executeScript({ target: { tabId: state.tabId }, func: installPageObserver });
    } catch { state.status = 'not_monitored'; await save(); return; }
    if (!page) { state.status = 'not_monitored'; await save(); return; }
    const input = requestSchema.safeParse({ goal: s.goal, topics: s.topics, page });
    if (!input.success) { state.status = 'uncertain'; state.classification = uncertain(); await save(); return; }
    const key = await hashContext(s.goal, s.topics, input.data.page);
    const hit = cached(state.cache, key, Date.now());
    if (hit) { await accept(hit, revision, '', 0); return; }
    const flightKey = s.id + ':' + key;
    const pending = inFlight.get(flightKey);
    if (pending) {
      state.status = 'analyzing'; await save();
      void pending.promise.then(result => run(() => accept(result, revision, key, 0))).catch(() => run(async () => {
        if (revision !== state.revision || !active()) return;
        state.failures++; state.backoffUntil = Date.now() + Math.min(300_000, 30_000 * 2 ** Math.min(4, state.failures - 1));
        await accept(uncertain(), revision, '', 0);
      }));
      return;
    }
    const day = new Date().toISOString().slice(0, 10);
    const usage = (await chrome.storage.local.get('usage')).usage as { day: string; count: number } | undefined;
    const count = usage?.day === day ? usage.count : 0;
    if (count >= prefs.dailyLimit || s.analyses >= prefs.sessionLimit || Date.now() < state.backoffUntil) {
      state.classification = uncertain('Limite de análises ou pausa de rede. Tente novamente mais tarde.'); state.status = 'uncertain'; await save(); return;
    }
    tick(); state.classification = null; state.status = 'analyzing'; s.analyses++;
    await chrome.storage.local.set({ usage: { day, count: count + 1 } }); await save();
    const started = Date.now();
    // A chamada externa não bloqueia a fila de pausa/foco/revogação.
    const controller = new AbortController();
    const promise = classify(input.data, prefs, controller.signal);
    const flight = { promise, controller }; inFlight.set(flightKey, flight);
    void promise.then(result => run(async () => {
      if (revision === state.revision) { state.failures = 0; state.backoffUntil = 0; }
      await accept(result, revision, key, Date.now() - started);
    })).catch(() => run(async () => {
      if (revision !== state.revision || !active()) return;
      state.failures++; state.backoffUntil = Date.now() + Math.min(300_000, 30_000 * 2 ** Math.min(4, state.failures - 1));
      await accept(uncertain(), revision, '', Date.now() - started);
    })).finally(() => { if (inFlight.get(flightKey) === flight) inFlight.delete(flightKey); });
  }
  async function feedback(choice: string) {
    const s = state.session; if (!s || s.status === 'finished') return;
    tick();
    if (choice === 'pause') { await pause(); return; }
    if (choice === 'return') {
      if (s.focusTabId !== null) await chrome.tabs.update(s.focusTabId, { active: true }).then(async t => { if (t?.windowId) await chrome.windows.update(t.windowId, { focused: true }); }).catch(() => {});
    } else if (choice === 'relevant' || choice === 'ignore') {
      if (state.domain) s.feedback[state.domain] = choice === 'relevant' ? 'relevant' : 'ignored';
      if (choice === 'relevant') s.corrections++;
      invalidate(); state.classification = choice === 'relevant' ? { label: 'relevant', confidence: 1, reason: 'Correção aplicada por você nesta sessão.' } : null;
      state.status = choice === 'relevant' ? 'relevant' : 'not_monitored'; state.clock = resetContinuous(state.clock, Date.now());
    } else if (choice === 'snooze') state.clock.snoozeUntil = Date.now() + prefs.cooldownMinutes * 60_000;
    await chrome.notifications.clear('fio-reminder'); await clearOverlay(); await save();
  }

  const ready = run(async () => {
    const local = await chrome.storage.local.get('preferences'); prefs = { ...defaults, ...local.preferences };
    const data = await chrome.storage.session.get('runtime'); state = data.runtime || initialState();
    // Não creditar o intervalo desde o último worker: pode ter ocorrido suspensão.
    state.clock.lastAt = Date.now();
    chrome.idle.setDetectionInterval(60);
    await chrome.alarms.create('fio-heartbeat', { periodInMinutes: .5 });
    await observe();
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    void ready.then(() => run(async () => {
      const trustedUI = isTrustedUI(sender, chrome.runtime.id);
      const content = sender.tab?.id === state.tabId && sender.id === chrome.runtime.id &&
        sender.url === state.url && (sender.frameId ?? 0) === 0;
      if (message.type === 'DIRTY' && content) { await observe(); return { ok: true }; }
      if (message.type === 'FEEDBACK' && (trustedUI || content)) { await feedback(message.choice); return { ok: true }; }
      if (!trustedUI) throw new Error('Ação não autorizada.');
      switch (message.type) {
        case 'GET': {
          tick(); await save();
          const auth = (await chrome.storage.session.get('auth')).auth;
          const origins = (await chrome.permissions.getAll()).origins || [];
          return { state, prefs, origins, signedIn: !!auth };
        }
        case 'SAVE': {
          const next = { ...prefs, ...message.preferences };
          if (!validEndpoint(next.endpoint) || (next.authUrl && (!validEndpoint(next.authUrl) || !next.authUrl.startsWith('https://')))) throw new Error('Endpoint inválido.');
          for (const [key, min, max] of [['delayMinutes', 0, 10], ['cooldownMinutes', 1, 120], ['stabilitySeconds', 3, 30], ['dailyLimit', 1, 1000], ['sessionLimit', 1, 1000]] as const) {
            if (!Number.isFinite(next[key]) || next[key] < min || next[key] > max) throw new Error('Valor inválido: ' + key);
          }
          next.endpoint = next.endpoint.replace(/\/$/, ''); next.authUrl = next.authUrl.replace(/\/$/, '');
          next.exclusions = next.exclusions.map((h: string) => h.trim().toLowerCase()).filter((h: string) => /^[a-z0-9.-]+$/.test(h)).slice(0, 100);
          prefs = next; await chrome.storage.local.set({ preferences: prefs }); await observe(); return { ok: true };
        }
        case 'START': {
          if (!prefs.consent) throw new Error('Leia e aceite a explicação de privacidade.');
          const parsed = requestSchema.pick({ goal: true, topics: true }).parse({ goal: message.goal, topics: message.topics });
          if (!['study', 'work', 'custom'].includes(message.kind)) throw new Error('Atividade inválida.');
          const duration = Number(message.duration);
          if (![0, 25, 50, 90].includes(duration)) throw new Error('Duração inválida.');
          await finish(); state = initialState();
          const tab = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
          state.session = { id: crypto.randomUUID(), status: 'active', kind: message.kind, ...parsed, startedAt: Date.now(),
            endsAt: duration ? Date.now() + duration * 60_000 : null, pausedAt: null,
            focusTabId: message.useCurrentTab && !tab?.incognito ? tab?.id ?? null : null,
            feedback: {}, analyses: 0, alerts: 0, corrections: 0 };
          await observe(); return { ok: true };
        }
        case 'PAUSE': await pause(); return { ok: true };
        case 'RESUME':
          if (state.session?.status === 'paused') {
            if (state.session.endsAt && state.session.pausedAt) state.session.endsAt += Date.now() - state.session.pausedAt;
            state.session.status = 'active'; state.session.pausedAt = null; await observe();
          } return { ok: true };
        case 'FINISH': await finish(); return { ok: true };
        case 'RETRY': await observe(); return { ok: true };
        case 'CLEAR_FEEDBACK':
          if (state.session) state.session.feedback = {};
          await observe(); return { ok: true };
        case 'DEBUG': {
          if (!prefs.consent) throw new Error('Consentimento necessário.');
          const tab = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
          if (!tab?.id || tab.incognito || !(await eligible(tab.url || ''))) throw new Error('Origem não autorizada ou excluída.');
          return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPageContext }))[0]?.result || null;
        }
        case 'AUTH': {
          if (!prefs.authUrl || !prefs.publicAuthKey) throw new Error('Configure o Supabase antes de entrar.');
          const verify = !!message.code;
          const response = await fetch(prefs.authUrl + '/auth/v1/' + (verify ? 'verify' : 'otp'), {
            method: 'POST', headers: { apikey: prefs.publicAuthKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(verify ? { email: message.email, token: message.code, type: 'email' } : { email: message.email, create_user: false }),
            signal: AbortSignal.timeout(10_000)
          });
          if (!response.ok) throw new Error('Não foi possível entrar. Verifique a conta e o código.');
          if (verify) {
            const data = await response.json();
            if (!data.access_token || !data.refresh_token) throw new Error('Resposta de login inválida.');
            await chrome.storage.session.set({ auth: { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 } });
          } return { ok: true };
        }
        case 'LOGOUT': await chrome.storage.session.remove('auth'); await pause(); return { ok: true };
        case 'DELETE_DATA':
          await finish(); await chrome.storage.local.clear(); await chrome.storage.session.clear();
          state = initialState(); prefs = { ...defaults };
          for (const origin of (await chrome.permissions.getAll()).origins || []) await chrome.permissions.remove({ origins: [origin] });
          return { ok: true };
        default: throw new Error('Ação desconhecida.');
      }
    })).then(result => respond({ ok: true, result })).catch(error => respond({ ok: false, error: error instanceof Error ? error.message : 'Não foi possível concluir.' }));
    return true;
  });
  chrome.tabs.onActivated.addListener(() => { void run(observe); });
  chrome.tabs.onUpdated.addListener((id, change) => {
    if (id === state.tabId && (change.url || change.status === 'complete' || change.title)) void run(observe);
  });
  chrome.tabs.onRemoved.addListener(id => { if (id === state.tabId) void run(observe); });
  chrome.windows.onFocusChanged.addListener(() => { void run(observe); });
  chrome.idle.onStateChanged.addListener(() => { void run(observe); });
  chrome.permissions.onRemoved.addListener(() => { void run(async () => { state.cache = {}; await observe(); }); });
  chrome.alarms.onAlarm.addListener(alarm => {
    void run(async () => {
      if (alarm.name === 'fio-stable') { await analyze(); return; }
      if (alarm.name !== 'fio-heartbeat') return;
      if (!active() || !prefs.consent) { state.clock.lastAt = Date.now(); await save(); return; }
      if (active() && state.session?.endsAt && Date.now() >= state.session.endsAt) { await finish(); return; }
      const before = { tabId: state.tabId, focused: state.focused, idle: state.idle };
      const tab = await syncEnvironment();
      if (before.tabId !== (tab?.id ?? null) || before.focused !== state.focused || before.idle !== state.idle || (tab?.url || '') !== state.url) {
        // Sem horário exato do evento, não creditar a lacuna de atividade.
        state.clock.lastAt = Date.now(); await observe(); return;
      }
      tick(); await save(); await remind();
      if (active() && state.status === 'uncertain' && Date.now() >= state.backoffUntil) await observe();
    });
  });
  chrome.notifications.onButtonClicked.addListener((id, index) => { if (id === 'fio-reminder') void run(() => feedback(index === 0 ? 'relevant' : 'snooze')); });
  chrome.notifications.onClicked.addListener(id => { if (id === 'fio-reminder') void chrome.action.openPopup().catch(() => chrome.runtime.openOptionsPage()); });
});
