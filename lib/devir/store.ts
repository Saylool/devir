import { HttpError } from '../errors';
import { configuredStorage, StorageConflict, type DocumentStore } from './storage';
import type { Task } from './types';

const conflict = () => new HttpError(409, 'Görev başka bir istekte değişti. Güncel kaydı tekrar açın.');

export function createTaskStore(storage: DocumentStore) {
  async function snapshot(owner: string) {
    const document = await storage.read(owner);
    const tasks: Task[] = document ? JSON.parse(document.value).tasks : [];
    return { tasks, etag: document?.etag ?? null };
  }

  async function commit(owner: string, tasks: Task[], etag: string | null) {
    try { await storage.write(owner, JSON.stringify({ version: 1, tasks }), etag); }
    catch (error) {
      if (error instanceof StorageConflict) throw conflict();
      throw error;
    }
  }

  return {
    async listTasks(owner: string) {
      const { tasks } = await snapshot(owner);
      return tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async loadTask(id: string, owner: string) {
      const task = (await snapshot(owner)).tasks.find(task => task.id === id);
      if (!task) throw new HttpError(404, 'Görev bulunamadı.');
      return task;
    },
    async insertTask(owner: string, task: Task) {
      const { tasks, etag } = await snapshot(owner);
      if (tasks.some(item => item.id === task.id)) throw conflict();
      if (tasks.length >= 60) throw new HttpError(409, 'Bu demo çalışma alanı 60 görev sınırına ulaştı.');
      tasks.push(task);
      await commit(owner, tasks, etag);
      return task;
    },
    async saveTask(owner: string, task: Task, expected: number) {
      const { tasks, etag } = await snapshot(owner);
      const index = tasks.findIndex(item => item.id === task.id);
      if (index < 0) throw new HttpError(404, 'Görev bulunamadı.');
      if (tasks[index].revision !== expected) throw conflict();
      const next = { ...task, revision: expected + 1, updatedAt: new Date().toISOString() };
      tasks[index] = next;
      await commit(owner, tasks, etag);
      return next;
    },
  };
}

export const listTasks = (owner: string) => createTaskStore(configuredStorage()).listTasks(owner);
export const loadTask = (id: string, owner: string) => createTaskStore(configuredStorage()).loadTask(id, owner);
export const insertTask = (owner: string, task: Task) => createTaskStore(configuredStorage()).insertTask(owner, task);
export const saveTask = (owner: string, task: Task, expected: number) => createTaskStore(configuredStorage()).saveTask(owner, task, expected);
