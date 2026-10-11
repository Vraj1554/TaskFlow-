import express from 'express';

const PRIORITIES = [1, 2, 3];
const isDate = (s) => s === null || /^\d{4}-\d{2}-\d{2}$/.test(s);
const isColor = (s) => /^#[0-9a-f]{6}$/i.test(s);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const toTask = (row) => row && { ...row, done: Boolean(row.done) };

export function createApp(db) {
  const app = express();
  app.use(express.json());

  const getTask = (id) => toTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));

  // ---------- Projects ----------
  app.get('/api/projects', (req, res) => {
    res.json(
      db.prepare(`
        SELECT p.*, COUNT(t.id) AS total, COALESCE(SUM(t.done = 0), 0) AS open
        FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
        GROUP BY p.id ORDER BY p.created_at, p.id
      `).all()
    );
  });

  app.post('/api/projects', (req, res) => {
    const name = String(req.body.name ?? '').trim();
    if (!name) throw new HttpError(400, 'Project name is required');
    const color = isColor(req.body.color) ? req.body.color : '#6366f1';
    const { lastInsertRowid } = db
      .prepare('INSERT INTO projects (name, color) VALUES (?, ?)')
      .run(name, color);
    res.status(201).json(db.prepare('SELECT * FROM projects WHERE id = ?').get(lastInsertRowid));
  });

  app.patch('/api/projects/:id', (req, res) => {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) throw new HttpError(404, 'Project not found');
    const name = req.body.name !== undefined ? String(req.body.name).trim() : project.name;
    if (!name) throw new HttpError(400, 'Project name is required');
    const color = isColor(req.body.color) ? req.body.color : project.color;
    db.prepare('UPDATE projects SET name = ?, color = ? WHERE id = ?').run(name, color, project.id);
    res.json({ ...project, name, color });
  });

  app.delete('/api/projects/:id', (req, res) => {
    const { changes } = db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    if (!changes) throw new HttpError(404, 'Project not found');
    res.status(204).end();
  });

  // ---------- Tasks ----------
  app.get('/api/tasks', (req, res) => {
    const where = [];
    const params = [];
    if (req.query.project) {
      where.push('project_id = ?');
      params.push(Number(req.query.project));
    }
    if (req.query.status === 'active') where.push('done = 0');
    if (req.query.status === 'done') where.push('done = 1');
    if (req.query.q) {
      where.push("(title LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\')");
      const like = `%${String(req.query.q).replace(/[\\%_]/g, '\\$&')}%`;
      params.push(like, like);
    }
    const sql = `
      SELECT * FROM tasks
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY done, due_date IS NULL, due_date, priority, id`;
    res.json(db.prepare(sql).all(...params).map(toTask));
  });

  app.post('/api/tasks', (req, res) => {
    const t = validateTask(req.body, {
      project_id: null, title: '', notes: '', due_date: null, priority: 2, done: false,
    });
    const { lastInsertRowid } = db
      .prepare('INSERT INTO tasks (project_id, title, notes, due_date, priority, done) VALUES (?, ?, ?, ?, ?, ?)')
      .run(t.project_id, t.title, t.notes, t.due_date, t.priority, t.done ? 1 : 0);
    res.status(201).json(getTask(lastInsertRowid));
  });

  app.patch('/api/tasks/:id', (req, res) => {
    const existing = getTask(req.params.id);
    if (!existing) throw new HttpError(404, 'Task not found');
    const t = validateTask(req.body, existing);
    db.prepare('UPDATE tasks SET project_id = ?, title = ?, notes = ?, due_date = ?, priority = ?, done = ? WHERE id = ?')
      .run(t.project_id, t.title, t.notes, t.due_date, t.priority, t.done ? 1 : 0, existing.id);
    res.json(getTask(existing.id));
  });

  app.delete('/api/tasks/:id', (req, res) => {
    const { changes } = db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    if (!changes) throw new HttpError(404, 'Task not found');
    res.status(204).end();
  });

  app.get('/api/stats', (req, res) => {
    const today = req.query.today && isDate(req.query.today)
      ? req.query.today
      : new Date().toISOString().slice(0, 10);
    res.json(
      db.prepare(`
        SELECT COUNT(*) AS total,
               COALESCE(SUM(done), 0) AS done,
               COALESCE(SUM(done = 0 AND due_date < ?), 0) AS overdue,
               COALESCE(SUM(done = 0 AND due_date = ?), 0) AS due_today
        FROM tasks
      `).get(today, today)
    );
  });

  function validateTask(body, base) {
    const t = { ...base };
    if (body.title !== undefined) t.title = String(body.title).trim();
    if (!t.title) throw new HttpError(400, 'Task title is required');
    if (body.notes !== undefined) t.notes = String(body.notes);
    if (body.due_date !== undefined) {
      t.due_date = body.due_date || null;
      if (!isDate(t.due_date)) throw new HttpError(400, 'due_date must be YYYY-MM-DD');
    }
    if (body.priority !== undefined) {
      t.priority = Number(body.priority);
      if (!PRIORITIES.includes(t.priority)) throw new HttpError(400, 'priority must be 1, 2 or 3');
    }
    if (body.done !== undefined) t.done = Boolean(body.done);
    if (body.project_id !== undefined) {
      t.project_id = body.project_id === null ? null : Number(body.project_id);
      if (t.project_id !== null && !db.prepare('SELECT 1 FROM projects WHERE id = ?').get(t.project_id)) {
        throw new HttpError(400, 'Project does not exist');
      }
    }
    return t;
  }

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    if (!err.status) console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal server error' });
  });

  return app;
}
