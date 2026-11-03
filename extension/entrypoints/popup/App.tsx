import { useEffect, useState, type FormEvent } from 'react';
import { rpc, type Snapshot } from '../../lib/rpc';
import { originPattern, allowedPage } from '../../lib/privacy';
import { Brand, Button, statuses } from '../../components/ui';
import { monitoringMessages } from '../../lib/monitoring-status';
export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [debug, setDebug] = useState<unknown>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [goal, setGoal] = useState(''); const [topics, setTopics] = useState('');
  const [kind, setKind] = useState('study'); const [duration, setDuration] = useState('25');
  const [delay, setDelay] = useState('3'); const [consent, setConsent] = useState(false);
  const [reference, setReference] = useState(false);
  const refresh = async () => { const data = await rpc<Snapshot>('GET'); setSnapshot(data); };
  useEffect(() => {
    // Chrome does not consistently emit a window-focus event when its action
    // popup closes. The background uses this port's disconnect as that signal.
    const view = chrome.runtime.connect({ name: 'fio-popup-view' });
    void rpc<Snapshot>('GET').then(data => { setSnapshot(data); setDelay(String(data.prefs.delayMinutes)); }).catch(e => setError(e.message));
    const timer = setInterval(() => { void refresh().catch(() => {}); }, 2000);
    return () => { clearInterval(timer); view.disconnect(); };
  }, []);
  const perform = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir.'); }
    finally { setBusy(false); }
  };
  async function start(event: FormEvent) {
    event.preventDefault();
    await perform(async () => {
      await rpc('SAVE', { preferences: { consent: snapshot?.prefs.consent || consent, delayMinutes: Number(delay) } });
      await rpc('START', { goal, topics: topics.split(',').map(t => t.trim()).filter(Boolean), kind, duration: Number(duration), useCurrentTab: reference });
    });
  }
  async function authorize() {
    // permissions.request deve decorrer diretamente de um gesto da pessoa.
    const tab = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    if (!tab?.url || tab.incognito || !allowedPage(tab.url, snapshot?.prefs.exclusions)) throw new Error('Esta página é interna, sensível ou excluída.');
    if (!snapshot?.prefs.consent) throw new Error('Aceite a explicação de privacidade antes de autorizar.');
    const ok = await chrome.permissions.request({ origins: [originPattern(tab.url)] });
    if (!ok) throw new Error('Permissão não concedida. A página continua sem análise.');
    await rpc('RETRY');
  }
  const s = snapshot?.state.session;
  const running = s && s.status !== 'finished';
  const monitoring = snapshot?.state.status === 'not_monitored' && snapshot.state.monitoringReason
    ? monitoringMessages[snapshot.state.monitoringReason] : null;
  const previousResult = !!(snapshot?.state.classification && snapshot.state.status === 'not_monitored' &&
    ['window_unfocused', 'idle'].includes(snapshot.state.monitoringReason || ''));
  return <main className="w-[390px] p-6"><Brand />
    {error && <p role="alert" className="mb-4 rounded-xl border border-amber-400 p-3 text-sm">{error}</p>}
    {!snapshot ? <p role="status">Abrindo o Fio…</p> : running ? <>
      <p className="text-xs tracking-widest text-leaf mb-2">SUA INTENÇÃO AGORA</p>
      <h1>{s.goal}</h1><p className="hint mb-5">{s.topics.join(' · ') || 'Uma tarefa de cada vez.'}</p>
      <section className="card" aria-live="polite">
        <span className="text-xs uppercase tracking-wide text-leaf">{s.status === 'paused' ? 'Pausado' : s.endsAt ? 'Sessão com duração fixa' : 'Duração indefinida'}</span>
        <h2 className="mt-2">{previousResult ? statuses[snapshot.state.classification!.label] : monitoring?.title || statuses[snapshot.state.status] || snapshot.state.status}</h2>
        <p className="text-sm break-all">{snapshot.state.domain || 'Escolha uma página para continuar.'}</p>
        <p className="hint mt-3">{previousResult ? snapshot.state.classification!.reason : monitoring?.description || snapshot.state.classification?.reason || 'A leitura depende da sua autorização. Uma avaliação incerta não gera alerta.'}</p>
        {previousResult && <p className="hint mt-2">Última avaliação recebida. Leitura pausada agora: {snapshot.state.monitoringReason === 'idle' ? 'sistema inativo' : 'a página está sem foco, por exemplo enquanto este popup está aberto'}.</p>}
        {snapshot.state.lastError && snapshot.state.lastError !== snapshot.state.classification?.reason && <p role="alert" className="mt-3 text-sm border-l-2 border-amber-500 pl-3">{snapshot.state.lastError}</p>}
        <div className="mt-4 border-t pt-3 flex justify-between text-xs">
          <span>Possível desvio contínuo</span><span>{Math.floor(snapshot.state.clock.offTopicMs / 60000)} min</span>
        </div>
        {s.endsAt && <p className="hint mt-2">Restam cerca de {Math.max(0, Math.ceil((s.endsAt - (s.pausedAt || Date.now())) / 60000))} min.</p>}
      </section>
      <div className="flex gap-2 mb-4"><Button disabled={busy} onClick={() => void perform(() => rpc(s.status === 'paused' ? 'RESUME' : 'PAUSE'))}>{s.status === 'paused' ? 'Retomar' : 'Pausar'}</Button>
      <Button secondary disabled={busy} onClick={() => void perform(() => rpc('FINISH'))}>Encerrar sessão</Button></div>
      {snapshot.state.status === 'not_monitored' && snapshot.state.monitoringReason === 'permission_required' && <Button secondary disabled={busy} onClick={() => void perform(authorize)}>Autorizar site atual</Button>}
      {snapshot.state.status === 'not_monitored' && <Button secondary disabled={busy} onClick={() => void perform(() => rpc('RETRY'))}>Verificar página novamente</Button>}
      <div className="mt-3"><Button secondary disabled={busy} onClick={() => void perform(() => rpc('PREVIEW_REMINDER'))}>Testar aviso (sem IA)</Button>
        <p className="hint mt-2">Depois de clicar, feche este popup para ver a prévia na página. Ela não altera a classificação nem o intervalo de silêncio.</p></div>
      {snapshot.state.classification && <div className="flex flex-wrap gap-2 mt-4">
        {([['Faz parte da tarefa', 'relevant'], ['Adiar', 'snooze'], ['Ignorar site', 'ignore'], ['Voltar ao foco', 'return']] as const).filter(([, choice]) => choice !== 'return' || s.focusTabId !== null).map(([label, choice]) =>
          <Button key={choice} secondary disabled={busy} onClick={() => void perform(() => rpc('FEEDBACK', { choice }))}>{label}</Button>)}
      </div>}
      <details className="mt-5 text-sm"><summary className="cursor-pointer underline">Inspeção local do contexto</summary>
        <p className="hint my-3">Extrai uma prévia da aba ativa autorizada, sem envio à IA. A prévia existe somente enquanto este popup permanece aberto.</p>
        <div className="flex gap-2"><Button secondary disabled={busy} onClick={() => void perform(async () => { setDebug(await rpc('DEBUG')); })}>Inspecionar contexto</Button>
        <Button secondary onClick={() => setDebug(null)}>Limpar prévia</Button></div>
        {debug !== null && <pre className="mt-3 text-xs whitespace-pre-wrap break-all">{JSON.stringify(debug, null, 2)}</pre>}
      </details>
      <details className="mt-4 text-sm"><summary className="cursor-pointer underline">Diagnóstico da análise</summary>
        <dl className="hint mt-3 grid grid-cols-2 gap-2">
          <dt>Tentativas nesta sessão</dt><dd>{s.analyses}</dd>
          <dt>Última resposta</dt><dd>{snapshot.state.lastAnalysisAt ? snapshot.state.lastLatencyMs + ' ms' : 'Ainda não recebida'}</dd>
          <dt>Foco informado pelo Chrome</dt><dd>{snapshot.state.focusSignals?.window ? 'Sim' : 'Não'}</dd>
          <dt>Foco da própria página</dt><dd>{snapshot.state.focusSignals?.page == null ? 'Não verificado' : snapshot.state.focusSignals.page ? 'Sim' : 'Não'}</dd>
          <dt>Página visível</dt><dd>{snapshot.state.focusSignals?.visible == null ? 'Não verificado' : snapshot.state.focusSignals.visible ? 'Sim' : 'Não'}</dd>
          <dt>Sistema ativo</dt><dd>{snapshot.state.idle ? 'Não' : 'Sim'}</dd>
        </dl>
      </details>
    </> : <>
      <p className="text-xs tracking-widest text-leaf mb-2">UM PEQUENO PONTO DE PARTIDA</p>
      <h1>O que merece sua atenção?</h1><p className="text-sm text-stone-600 mb-5">Defina sua intenção. O Fio ajuda a lembrar dela, com gentileza.</p>
      <form onSubmit={e => void start(e)}>
        <label>O que você está fazendo?<select value={kind} onChange={e => setKind(e.target.value)}><option value="study">Estudando</option><option value="work">Trabalhando</option><option value="custom">Outra atividade</option></select></label>
        <label>Tema e objetivo<textarea required minLength={3} maxLength={240} placeholder="Ex.: estudar limpeza de dados com Pandas" value={goal} onChange={e => setGoal(e.target.value)} /></label>
        <label>Temas relacionados, separados por vírgula<input maxLength={327} placeholder="Python, Pandas, DataFrame" value={topics} onChange={e => setTopics(e.target.value)} /></label>
        <div className="grid grid-cols-2 gap-3"><label>Duração<select value={duration} onChange={e => setDuration(e.target.value)}><option value="0">Indefinida</option>{[25, 50, 90].map(n => <option key={n} value={n}>{n} minutos</option>)}</select></label>
        <label>Avisar após<select value={delay} onChange={e => setDelay(e.target.value)}>{[0, 1, 3, 5, 10].map(n => <option key={n} value={n}>{n ? n + ' min fora do tema' : 'Sem espera adicional'}</option>)}</select></label></div>
        <label className="check"><input type="checkbox" checked={reference} onChange={e => setReference(e.target.checked)} />Usar a aba atual como referência para “Voltar ao foco”.</label>
        {!snapshot.prefs.consent && <section className="card text-sm">
          <h2>Você escolhe o que o Fio lê.</h2>
          <p>Em sites autorizados, até 1.500 caracteres de título, cabeçalhos e trechos visíveis podem ser enviados, com seu objetivo, ao nosso backend e à OpenAI para analisar relevância.</p>
          <p className="mt-2">A permissão “abas” permite observar URL e título da aba ativa. Conteúdo de campos, e-mails e páginas sensíveis é excluído. Os filtros têm limites: evite autorizar sites com dados privados.</p>
          <p className="hint mt-2 mb-3">Não há monitoramento anônimo. store:false não garante retenção zero pelo provedor. Você pode pausar, revogar permissões e excluir dados nas configurações.</p>
          <label className="check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />Entendi e aceito a análise apenas nos sites que eu autorizar.</label>
        </section>}
        <Button type="submit" disabled={busy || (!snapshot.prefs.consent && !consent)}>Iniciar sessão</Button>
      </form>
      {s?.status === 'finished' && <p className="hint mt-4">Sessão anterior: {s.analyses} análises, {s.alerts} lembretes e {s.corrections} correções. Cache descartado.</p>}
    </>}
    <footer className="mt-6 border-t border-stone-200 pt-4 flex items-center justify-between"><button className="text-sm underline" onClick={() => void chrome.runtime.openOptionsPage()}>Sites e configurações</button><span className="text-xs text-stone-500">v{chrome.runtime.getManifest().version} · No seu ritmo.</span></footer>
  </main>;
}
