import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.js';
import { openDb } from './db.js';

const PORT = process.env.PORT || 3001;
const app = createApp(openDb());

// In production, serve the built React app from frontend/dist.
const dist = path.join(import.meta.dirname, '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
