import { useEffect, useState } from 'react';
import { rpc, type Snapshot } from '../../lib/rpc';
import { defaults, type Preferences } from '../../lib/session';
import { validEndpoint } from '../../lib/privacy';
import { Brand, Button } from '../../components/ui';
export default function App() {
  const [prefs, setPrefs] = useState<Preferences>({ ...defaults });
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [origin, setOrigin] = useState('');
  const [email, setEmail] = useState(''); const [code, setCode] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const refresh = async () => { const data = await rpc<Snapshot>('GET'); setSnapshot(data); setPrefs(data.prefs); };
  useEffect(() => { void refresh().catch(e => setError(e.message)); }, []);
  const change = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setPrefs(p => ({ ...p, [key]: value }));
  const perform = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); await refresh(); setMessage(success); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir.'); }
    finally { setBusy(false); }
  };
  async function save() {
    if (!validEndpoint(prefs.endpoint) || (prefs.authUrl && (!validEndpoint(prefs.authUrl) || !prefs.authUrl.startsWith('https://')))) throw new Error('Use HTTPS, ou HTTP apenas em localhost.');
    const origins = [new URL(prefs.endpoint).origin + '/*', ...(prefs.authUrl ? [new URL(prefs.authUrl).origin + '/*'] : [])];
    if (!(await chrome.permissions.request({ origins }))) throw new Error('Acesso ao backend não autorizado.');
    await rpc('SAVE', { preferences: prefs });
  }
  async function grant() {
    if (!prefs.consent) throw new Error('Aceite primeiro a explicação de privacidade.');
    const u = new URL(origin);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('Origem inválida.');
    if (!(await chrome.permissions.request({ origins: [u.origin + '/*'] }))) throw new Error('Permissão não concedida.');
    setOrigin(''); await rpc('RETRY');
  }
  return <main className="max-w-3xl mx-auto p-6 md:p-10"><Brand /><h1>Seu espaço, suas escolhas.</h1>
    <p className="mb-7 text-stone-600">Controle os sites, os lembretes e os dados usados pelo Fio.</p>
    {error && <p role="alert" className="card border-amber-500">{error}</p>}
    {message && <p role="status" className="card border-leaf">{message}</p>}
    <section className="card"><h2>Privacidade e consentimento</h2>
      <p className="text-sm mb-3">A extensão observa URL e título da aba ativa pela permissão “abas”. Em cada origem que você autoriza, lê até 1.500 caracteres de título, cabeçalhos e trechos visíveis e envia esse contexto e seu objetivo ao Worker e à OpenAI.</p>
      <p className="text-sm mb-3">Não enviamos URL completa, histórico, HTML integral, campos de formulário ou identificadores de usuário da página. Os filtros excluem serviços sensíveis conhecidos e áreas privadas, mas não identificam todo conteúdo privado da internet. Autorize apenas páginas públicas adequadas.</p>
      <p className="text-sm mb-3">Preferências ficam neste navegador. Cache de classificação e credenciais de login ficam na memória de sessão do Chrome. Trechos são descartados após uso. Não há modo anônimo nem sincronização. O provedor pode reter dados conforme suas políticas; store:false não garante retenção zero.</p>
      <a className="text-sm" href="https://platform.openai.com/docs/guides/your-data" target="_blank" rel="noreferrer">Consultar controles de dados da OpenAI</a>
      <label className="check mt-4"><input type="checkbox" checked={prefs.consent} onChange={e => change('consent', e.target.checked)} />Entendi e aceito essa análise em sites que eu autorizar.</label>
    </section>
    <section className="card"><h2>Conexão com a IA</h2>
      <p className="hint mb-3">A chave OpenAI pertence exclusivamente ao Worker. Não cole a chave da OpenAI nesta interface.</p>
      <label>Endereço do Worker<input type="url" value={prefs.endpoint} onChange={e => change('endpoint', e.target.value)} placeholder="https://fio-focus-api.seu-worker.workers.dev" /></label>
      <label>URL do projeto Supabase (versão autenticada)<input type="url" value={prefs.authUrl} onChange={e => change('authUrl', e.target.value)} placeholder="https://seu-projeto.supabase.co" /></label>
      <label>Chave pública publishable/anon do Supabase<input value={prefs.publicAuthKey} onChange={e => change('publicAuthKey', e.target.value)} autoComplete="off" /></label>
      <p className="hint">Esta chave pública identifica o projeto de autenticação; não concede acesso ao endpoint sem JWT válido. Nunca use uma chave de serviço.</p>
    </section>
    <section className="card"><h2>Ritmo dos lembretes</h2><div className="grid md:grid-cols-2 gap-x-5">
      <label>Avisar após<select value={prefs.delayMinutes} onChange={e => change('delayMinutes', Number(e.target.value))}>{[0,1,3,5,10].map(n => <option key={n} value={n}>{n ? n + ' minutos fora do tema' : 'Sem espera adicional'}</option>)}</select></label>
      <label>Silêncio após aviso/adiamento (min)<input type="number" min={1} max={120} value={prefs.cooldownMinutes} onChange={e => change('cooldownMinutes', Number(e.target.value))} /></label>
      <label>Estabilização da página (segundos)<input type="number" min={3} max={30} value={prefs.stabilitySeconds} onChange={e => change('stabilitySeconds', Number(e.target.value))} /></label>
      <label>Limite diário de análises<input type="number" min={1} max={1000} value={prefs.dailyLimit} onChange={e => change('dailyLimit', Number(e.target.value))} /></label>
      <label>Limite de análises por sessão<input type="number" min={1} max={1000} value={prefs.sessionLimit} onChange={e => change('sessionLimit', Number(e.target.value))} /></label>
    </div><label className="check"><input type="checkbox" checked={prefs.overlay} onChange={e => change('overlay', e.target.checked)} />Aviso discreto dentro da página</label>
    <label className="check"><input type="checkbox" checked={prefs.notifications} onChange={e => change('notifications', e.target.checked)} />Notificação silenciosa do sistema</label>
    <p className="hint">O tempo começa após a classificação. A checagem por alarme pode acrescentar até cerca de 30 segundos ao prazo.</p>
    </section>
    <section className="card"><h2>Sites excluídos por você</h2>
      <label>Um domínio por linha<textarea value={prefs.exclusions.join('\n')} onChange={e => change('exclusions', e.target.value.split('\n'))} placeholder={'exemplo.com\noutro-site.com'} /></label>
      <p className="hint">Subdomínios também são excluídos. Exclusões sensíveis do sistema continuam valendo.</p>
    </section>
    <Button disabled={busy} onClick={() => void perform(save, 'Preferências salvas. As mudanças já estão valendo.')}>Salvar preferências</Button>
    <section className="card mt-7"><h2>Origens autorizadas</h2><p className="hint mb-4">Uma permissão de origem dá capacidade técnica ampla. O código limita a extração aos campos descritos acima. Backend e autenticação também aparecem nesta lista, pois a extensão precisa acessá-los.</p>
      <ul>{snapshot?.origins.map(o => <li className="flex items-center justify-between gap-3 py-2 border-b break-all text-sm" key={o}><span>{o}</span><Button secondary disabled={busy} onClick={() => void perform(async () => { await chrome.permissions.remove({ origins: [o] }); await rpc('RETRY'); }, 'Permissão revogada.')}>Revogar</Button></li>)}</ul>
      <label className="mt-4">Autorizar uma origem<input type="url" value={origin} onChange={e => setOrigin(e.target.value)} placeholder="https://www.youtube.com" /></label>
      <Button secondary disabled={busy} onClick={() => void perform(grant, 'Origem autorizada.')}>Autorizar origem</Button>
    </section>
    <section className="card"><h2>Conta de demonstração</h2><p className="hint mb-3">Para o backend público: use uma conta previamente criada no Supabase. Salve a conexão acima antes de entrar.</p>
      {snapshot?.signedIn ? <><p className="mb-3">Conectado nesta sessão do navegador.</p><Button secondary disabled={busy} onClick={() => void perform(() => rpc('LOGOUT'), 'Você saiu. A sessão foi pausada.')}>Sair</Button></> : <>
      <label>E-mail da sua conta<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
      <Button secondary disabled={busy || !email} onClick={() => void perform(() => rpc('AUTH', { email }), 'Verifique seu e-mail. O código expira conforme a configuração do projeto.')}>Enviar código</Button>
      <label className="mt-3">Código recebido<input value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" /></label>
      <Button disabled={busy || !code} onClick={() => void perform(() => rpc('AUTH', { email, code }), 'Conectado.')}>Entrar</Button></>}
    </section>
    <section className="card"><h2>Inspeção local e correções</h2><p className="hint mb-3">Para ver uma prévia local, abra o popup enquanto estiver na página autorizada e expanda “Inspeção local do contexto”. A prévia não é enviada à IA.</p>
      <div className="flex flex-wrap gap-2"><Button secondary disabled={busy} onClick={() => void perform(() => rpc('CLEAR_FEEDBACK'), 'Correções desta sessão limpas.')}>Limpar correções da sessão</Button></div>
      <p className="hint mt-3">Última análise: {snapshot?.state.lastLatencyMs || 0} ms. Análises nesta sessão: {snapshot?.state.session?.analyses || 0}.</p>
    </section>
    <section className="card"><h2>Excluir dados deste navegador</h2><p className="text-sm mb-3">Encerra a sessão, remove preferências, login, cache, cotas locais e permissões opcionais. Os limites de segurança do servidor permanecem.</p>
      <label className="check"><input type="checkbox" checked={confirmDelete} onChange={e => setConfirmDelete(e.target.checked)} />Quero excluir os dados locais e revogar as permissões.</label>
      <Button secondary disabled={busy || !confirmDelete} onClick={() => void perform(async () => { await rpc('DELETE_DATA'); setConfirmDelete(false); }, 'Dados locais excluídos.')}>Excluir dados locais</Button>
    </section>
    <footer className="hint my-8">O Fio oferece apoio contextual. Não mede atenção, não diagnostica e não bloqueia sua navegação.</footer>
  </main>;
}
