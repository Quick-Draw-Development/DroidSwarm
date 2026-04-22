import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { LocalLlamaAdapter } from './local-llama.adapter';
import type { WorkerRequest } from '@shared-workers';

const createRequest = (): WorkerRequest => ({
  runId: 'run-1',
  taskId: 'task-1',
  attemptId: 'attempt-1',
  role: 'planner',
  instructions: 'Return a planning result.',
  scope: {
    projectId: 'proj-1',
    repoId: 'repo-1',
    rootPath: '/tmp/workspace',
    branch: 'main',
  },
  engine: 'local-llama',
  model: 'default',
});

describe('LocalLlamaAdapter', () => {
  it('falls back to /v1/completions when /completion returns 404', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async (input) => {
      const url = String(input);
      if (url.endsWith('/completion')) {
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      }
      if (url.endsWith('/v1/completions')) {
        return new Response(JSON.stringify({
          choices: [{ text: JSON.stringify({ summary: 'planned', success: true }) }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const adapter = new LocalLlamaAdapter({ baseUrl: 'http://127.0.0.1:11434', timeoutMs: 1_000 });
    const result = await adapter.run(createRequest());

    assert.equal(result.success, true);
    assert.equal(result.summary, 'planned');
    assert.equal(fetchMock.mock.calls.length, 2);
    fetchMock.mock.restore();
  });

  it('falls back to /v1/chat/completions when both completion routes return 404', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async (input) => {
      const url = String(input);
      if (url.endsWith('/completion') || url.endsWith('/v1/completions')) {
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      }
      if (url.endsWith('/v1/chat/completions')) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ summary: 'chat planned', success: true }) } }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const adapter = new LocalLlamaAdapter({ baseUrl: 'http://127.0.0.1:11434', timeoutMs: 1_000 });
    const result = await adapter.run(createRequest());

    assert.equal(result.success, true);
    assert.equal(result.summary, 'chat planned');
    assert.equal(fetchMock.mock.calls.length, 3);
    fetchMock.mock.restore();
  });

  it('stops on non-404 endpoint errors', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () =>
      new Response(JSON.stringify({ error: 'bad request' }), { status: 500 }));

    const adapter = new LocalLlamaAdapter({ baseUrl: 'http://127.0.0.1:11434', timeoutMs: 1_000 });
    const result = await adapter.run(createRequest());

    assert.equal(result.success, false);
    assert.match(result.summary, /llama\.cpp request failed \(500\) on \/completion/);
    assert.equal(fetchMock.mock.calls.length, 1);
    fetchMock.mock.restore();
  });
});
