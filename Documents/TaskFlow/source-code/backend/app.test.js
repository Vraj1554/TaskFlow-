import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { openDb } from './db.js';

async function withServer(fn) {
  const server = createApp(openDb(':memory:')).listen(0);
  const base = `http://localhost:${server.address().port}/api`;
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body),
    });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  try {
    await fn(call);
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

test('task CRUD lifecycle', () => withServer(async (call) => {
  const { body: projects } = await call('GET', '/projects');
  assert.equal(projects.length, 2);

  const created = await call('POST', '/tasks', { title: 'Write tests', project_id: projects[0].id, priority: 1 });
  assert.equal(created.status, 201);
  assert.equal(created.body.done, false);

  const updated = await call('PATCH', `/tasks/${created.body.id}`, { done: true });
  assert.equal(updated.body.done, true);
  assert.equal(updated.body.title, 'Write tests');

  const done = await call('GET', '/tasks?status=done');
  assert.deepEqual(done.body.map((t) => t.id), [created.body.id]);

  assert.equal((await call('DELETE', `/tasks/${created.body.id}`)).status, 204);
  assert.equal((await call('DELETE', `/tasks/${created.body.id}`)).status, 404);
}));

test('validation errors', () => withServer(async (call) => {
  assert.equal((await call('POST', '/tasks', { title: '  ' })).status, 400);
  assert.equal((await call('POST', '/tasks', { title: 'x', priority: 7 })).status, 400);
  assert.equal((await call('POST', '/tasks', { title: 'x', due_date: 'tomorrow' })).status, 400);
  assert.equal((await call('POST', '/tasks', { title: 'x', project_id: 999 })).status, 400);
  assert.equal((await call('POST', '/projects', {})).status, 400);
}));

test('deleting a project cascades to its tasks', () => withServer(async (call) => {
  const { body: p } = await call('POST', '/projects', { name: 'Temp' });
  await call('POST', '/tasks', { title: 'a', project_id: p.id });
  await call('DELETE', `/projects/${p.id}`);
  const { body } = await call('GET', `/tasks?project=${p.id}`);
  assert.equal(body.length, 0);
}));

test('search escapes LIKE wildcards', () => withServer(async (call) => {
  await call('POST', '/tasks', { title: '100% done' });
  const { body } = await call('GET', '/tasks?q=%25');
  assert.deepEqual(body.map((t) => t.title), ['100% done']);
}));
