import assert from 'node:assert';
import { describe, it, before, beforeEach, afterEach } from 'node:test';

process.env.DROIDSWARM_DB_PATH = ':memory:';
process.env.DROIDSWARM_PROJECT_ID = 'testproj';

const dbModulePromise = import('./db');
const routeModulePromise = import('../app/api/channels/[taskId]/messages/route');

describe('channel helpers', () => {
  let db: Awaited<typeof dbModulePromise>;

  before(async () => {
    db = await dbModulePromise;
  });

  beforeEach(() => {
    db.resetDatabaseInstance();
    db.setOperatorDispatcher(async () => 'accepted');
  });

  afterEach(() => {
    db.resetOperatorDispatcher();
  });

  it('records channel chat messages', async () => {
    const result = await db.sendChannelMessage({
      taskId: 'task-1',
      username: 'alice_dev',
      content: 'Hello channel',
    });
    assert.strictEqual(result.dispatchStatus, 'accepted');
    assert.strictEqual(result.message.taskId, 'task-1');
    assert.strictEqual(result.message.content, 'Hello channel');
    assert.deepStrictEqual(result.message.payload, {
      content: 'Hello channel',
      dispatch_status: 'accepted',
    });
  });

  it('handles alternate dispatch statuses', async () => {
    db.setOperatorDispatcher(async () => 'queued');
    const result = await db.sendChannelMessage({
      taskId: 'task-2',
      username: 'bob_agent',
      content: 'Queue me',
    });
    assert.strictEqual(result.dispatchStatus, 'queued');
    assert.strictEqual(result.message.payload.dispatch_status, 'queued');
  });
});

describe('channel API route', () => {
  let db: Awaited<typeof dbModulePromise>;
  let route: Awaited<typeof routeModulePromise>;

  before(async () => {
    db = await dbModulePromise;
    route = await routeModulePromise;
  });

  beforeEach(() => {
    db.resetDatabaseInstance();
    db.setOperatorDispatcher(async () => 'accepted');
  });

  afterEach(() => {
    db.resetOperatorDispatcher();
  });

  it('rejects invalid usernames', async () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Invalid!', content: 'hi' }),
    });
    const response = await route.POST(request, { params: { taskId: 'task-3' } });
    assert.strictEqual(response.status, 400);
  });

  it('accepts valid channel replies', async () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice_dev', content: 'New note' }),
    });
    const response = await route.POST(request, { params: { taskId: 'task-4' } });
    assert.strictEqual(response.status, 200);
    const payload = await response.json();
    assert.strictEqual(payload.dispatchStatus, 'accepted');
    assert.strictEqual(payload.message.taskId, 'task-4');
  });
});
