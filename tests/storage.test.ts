import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTaskStore } from '../lib/devir/store';
import { FileDocumentStore } from '../lib/devir/storage';
import { createTask } from '../lib/devir/engine';
import { DEFAULT_INPUT, type Market } from '../lib/devir/types';

const market = (): Market => ({instrument:'AVAX-USDT',price:10,bid:9.99,ask:10,asks:[[10,1000]],bids:[[9.99,1000]],sourceTime:Date.now(),receivedAt:Date.now(),source:'atk-core',stale:false,tools:[]});
const owner = 'a'.repeat(64), stranger = 'b'.repeat(64);

test('persistent tasks stay private and concurrent stale mutations cannot both win', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'devir-store-'));
  try {
    const store = createTaskStore(new FileDocumentStore(directory));
    const task = await store.insertTask(owner, createTask(DEFAULT_INPUT, market()));
    const restarted = createTaskStore(new FileDocumentStore(directory));
    assert.equal((await restarted.loadTask(task.id, owner)).revision, 1);
    assert.deepEqual(await restarted.listTasks(stranger), []);
    await assert.rejects(restarted.loadTask(task.id, stranger), { status: 404 });
    await assert.rejects(restarted.saveTask(stranger, task, 1), { status: 404 });
    const results = await Promise.allSettled([
      store.saveTask(owner, {...task, decision:'first'}, 1),
      restarted.saveTask(owner, {...task, decision:'second'}, 1),
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const rejected = results.find(r => r.status === 'rejected');
    assert.equal(rejected?.status === 'rejected' && rejected.reason.status, 409);
    assert.equal((await restarted.loadTask(task.id, owner)).revision, 2);
    await assert.rejects(store.saveTask(owner, task, 1), { status: 409 });
    await assert.rejects(store.insertTask(owner, task), { status: 409 });
  } finally { await rm(directory, {recursive:true, force:true}); }
});

test('fresh-workspace simultaneous inserts preserve one winner, never silent data loss', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'devir-create-'));
  try {
    const store = createTaskStore(new FileDocumentStore(directory));
    const results = await Promise.allSettled([
      store.insertTask(owner, createTask(DEFAULT_INPUT, market())),
      store.insertTask(owner, createTask(DEFAULT_INPUT, market())),
    ]);
    const winners = results.filter(r => r.status === 'fulfilled');
    assert.ok(winners.length >= 1);
    const saved = await store.listTasks(owner);
    assert.equal(saved.length, winners.length);
    await assert.rejects(store.listTasks('../escape'), /Invalid workspace key/);
  } finally { await rm(directory, {recursive:true, force:true}); }
});
