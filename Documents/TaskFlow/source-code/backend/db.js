import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function openDb(file = path.join(import.meta.dirname, 'data', 'taskflow.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS projects (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      color      TEXT NOT NULL DEFAULT '#6366f1',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      notes      TEXT NOT NULL DEFAULT '',
      due_date   TEXT,
      priority   INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
      done       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
  `);

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM projects').get();
  if (n === 0) seed(db);
  return db;
}

function seed(db) {
  const addProject = db.prepare('INSERT INTO projects (name, color) VALUES (?, ?)');
  const addTask = db.prepare(
    'INSERT INTO tasks (project_id, title, notes, due_date, priority) VALUES (?, ?, ?, ?, ?)'
  );
  const day = (offset) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
  const work = addProject.run('Work', '#6366f1').lastInsertRowid;
  const home = addProject.run('Personal', '#10b981').lastInsertRowid;
  addTask.run(work, 'Prepare sprint demo', 'Slides + live walkthrough', day(1), 1);
  addTask.run(work, 'Review open pull requests', '', day(0), 2);
  addTask.run(home, 'Buy groceries', 'Milk, eggs, coffee', day(2), 3);
  addTask.run(home, 'Book dentist appointment', '', null, 2);
}
