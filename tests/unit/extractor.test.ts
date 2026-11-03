// @vitest-environment jsdom
import { beforeEach, it, expect, vi } from 'vitest';
import { extractPageContext } from '../../extension/lib/extractor';
beforeEach(() => {
 document.body.innerHTML = ''; document.title = 'Tutorial de Pandas';
 vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(() => ({ length: 1 }) as DOMRectList);
});
it('extrai apenas textos visíveis permitidos, inclusive em ancestrais mistos', () => {
 document.body.innerHTML = '<main><h1>Limpeza de dados</h1><p>dropna <span hidden>SEGREDO_OCULTO</span><input value="SEGREDO_CAMPO"><span contenteditable>SEGREDO_EDITAVEL</span> fillna</p><form><p>SEGREDO_FORM</p></form><div class="messages"><p>SEGREDO_MSG</p></div><p style="display:none">SEGREDO_CSS</p></main>';
 const p = extractPageContext();
 expect(p).not.toBeNull(); expect(p!.excerpt).toContain('dropna');
 expect(JSON.stringify(p)).not.toContain('SEGREDO');
});
it('remove e-mail, números e URLs dos fragmentos', () => {
 document.body.innerHTML = '<main><p>Contato abc@example.com 11987654321 https://private.test/?token=secret</p></main>';
 const s = JSON.stringify(extractPageContext());
 expect(s).not.toContain('abc@'); expect(s).not.toContain('11987654321'); expect(s).not.toContain('token=');
});
it('limita o total de campos, mesmo com conteúdo grande', () => {
 document.body.innerHTML = '<main>' + '<h2>Assunto longo</h2>'.repeat(20) + '<p>' + 'a'.repeat(10000) + '</p></main>';
 const p = extractPageContext()!;
 expect(p.title.length + p.description.length + p.headings.join('').length + p.excerpt.length).toBeLessThanOrEqual(1500);
 expect(p.headings.length).toBeLessThanOrEqual(8);
});
it('recusa páginas com campos de credenciais ou cartão', () => {
 document.body.innerHTML = '<main><p>Página pública</p><input type="password"></main>';
 expect(extractPageContext()).toBeNull();
});
