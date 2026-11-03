import type { ReactNode } from 'react';
export function Button({ children, onClick, secondary = false, disabled = false, type = 'button' }: {
  children: ReactNode; onClick?: () => void; secondary?: boolean; disabled?: boolean; type?: 'button' | 'submit'
}) {
  return <button type={type} onClick={onClick} disabled={disabled} className={secondary ? 'button-secondary' : 'button-primary'}>{children}</button>;
}
export const statuses: Record<string, string> = {
  inactive: 'Pronto para começar', active: 'Sessão ativa', paused: 'Sessão pausada', finished: 'Sessão encerrada',
  waiting: 'Aguardando a página estabilizar', analyzing: 'Interpretando o contexto…', relevant: 'Parece fazer parte da tarefa',
  off_topic: 'Possivelmente fora do tema', uncertain: 'Não foi possível avaliar com segurança', not_monitored: 'Página sem monitoramento'
};
export function Brand() { return <header className="flex items-center justify-between mb-7"><div className="flex items-center gap-3"><span className="brand-mark" aria-hidden="true">f</span><div><strong className="text-2xl tracking-tight">fio<span className="text-leaf">.</span></strong><p className="text-xs text-stone-600">um lembrete da sua intenção</p></div></div><span className="text-xs text-stone-500">FOCUS COMPANION</span></header>; }
