import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
// Exercise the exact workerd/Miniflare runtime installed by Wrangler.
const requireWrangler = createRequire(import.meta.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = requireWrangler('miniflare');
const input = { goal: 'Estudar Pandas', topics: ['Python'], page: { domain: 'youtube.com', title: 'Tutorial Pandas', description: '', headings: [], excerpt: 'DataFrame' } };
const origin = 'chrome-extension://runtime-test';
const classification = { label: 'relevant', confidence: .95, reason: 'Tutorial do tema.' };
test('compiled Worker calls native fetch in workerd, validates AI JSON and enforces real SQLite quota', { timeout: 30000 }, async () => {
  let calls = 0;
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: await readFile(new URL('../../worker/dist/index.js', import.meta.url), 'utf8'),
    compatibilityDate: '2025-10-28',
    bindings: { AUTH_MODE: 'local', ENABLED: 'true', ALLOWED_ORIGINS: origin, OPENAI_API_KEY: 'fake-runtime-test', OPENAI_MODEL: 'gpt-6-luna', REASONING_EFFORT: 'low', DAILY_LIMIT: '2', MINUTE_LIMIT: '2' },
    durableObjects: { QUOTAS: { className: 'Quota', useSQLite: true } },
    // All outbound traffic ends here. No real API, credentials or page data.
    outboundService: async request => {
      calls++;
      assert.equal(request.url, 'https://api.openai.com/v1/responses');
      const body = await request.json();
      assert.equal(body.store, false);
      assert.equal(body.text.format.type, 'json_schema');
      assert.equal(body.model, 'gpt-6-luna');
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(classification) }] }] });
    }
  }));
  const send = () => runtime.dispatchFetch('http://localhost/classify', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  try {
    for (let n = 0; n < 2; n++) {
      const response = await send();
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      assert.deepEqual(result, classification);
    }
    const limited = await send();
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error, 'quota_exceeded');
    assert.equal(calls, 2);
  } finally { await runtime.dispose(); }
});
