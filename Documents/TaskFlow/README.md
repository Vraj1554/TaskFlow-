# TaskFlow

A full-stack task manager: **React (Vite)** frontend, **Express** REST API, **SQLite** storage
(via Node's built-in `node:sqlite`, so there's no native module to compile).

## Requirements

Node.js 22.13+ (tested on Node 24).

## Getting started

```bash
npm install
npm run dev        # API on :3001 + Vite dev server on :5173 (hot reload)
```

Open http://localhost:5173. The database is created at `data/taskflow.db` and seeded with sample data on first run.

### Production

```bash
npm run build      # outputs dist/
npm start          # Express serves the API and the built app on :3001
```

### Tests

```bash
npm test
```

## Features

- Projects with colors and open-task counts; deleting a project deletes its tasks
- Tasks with notes, due date, and priority (High / Medium / Low)
- Active / Done / All filters, plus full-text search over title and notes
- Dashboard stats: open, due today, overdue, % completed
- Edit dialog, keyboard friendly (Enter to add, Esc to close)
- Responsive layout with a slide-out sidebar on mobile, automatic dark mode

## API

| Method | Path | Body / query |
| --- | --- | --- |
| GET | `/api/projects` | — (includes `total` and `open` counts) |
| POST | `/api/projects` | `{ name, color? }` |
| PATCH | `/api/projects/:id` | `{ name?, color? }` |
| DELETE | `/api/projects/:id` | — |
| GET | `/api/tasks` | `?project=&status=active\|done&q=` |
| POST | `/api/tasks` | `{ title, notes?, due_date?, priority?, project_id?, done? }` |
| PATCH | `/api/tasks/:id` | any task field |
| DELETE | `/api/tasks/:id` | — |
| GET | `/api/stats` | `?today=YYYY-MM-DD` |

Errors come back as `{ "error": "message" }` with a 4xx/5xx status.

## Project layout

```
server/
  index.js      entry point (also serves dist/ in production)
  app.js        Express routes + validation
  db.js         schema + seed data
  app.test.js   API tests (node:test)
src/
  App.jsx       UI components
  api.js        fetch wrapper
  styles.css    styles (light + dark)
```
