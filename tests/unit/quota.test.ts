import { DatabaseSync } from 'node:sqlite';
import { it, expect, vi } from 'vitest';
import { Quota } from '../../worker/src/limits';
it('cotas usam transação e preservam limites diário e por minuto', async () => {
 const db = new DatabaseSync(':memory:');
 const ctx = { storage: {
   sql: { exec(query: string, ...args: any[]) {
     const statement = db.prepare(query);
     if (/^SELECT/i.test(query)) return { toArray: () => statement.all(...args) };
     statement.run(...args); return { toArray: () => [] };
   } },
   transactionSync(fn: () => boolean) { db.exec('BEGIN'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } }
 } };
 const quota = new Quota(ctx as any, {} as any);
 const call = () => quota.fetch(new Request('https://quota/consume', { method: 'POST', body: JSON.stringify({ day: 3, minute: 2 }) }));
 vi.spyOn(Date, 'now').mockReturnValue(120000);
 expect((await call()).status).toBe(200); expect((await call()).status).toBe(200); expect((await call()).status).toBe(429);
 vi.spyOn(Date, 'now').mockReturnValue(180000);
 expect((await call()).status).toBe(200); expect((await call()).status).toBe(429);
 vi.spyOn(Date, 'now').mockReturnValue(86400000);
 expect((await call()).status).toBe(200);
 db.close();
});
