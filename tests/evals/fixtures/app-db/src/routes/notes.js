'use strict';
const express = require('express');
const { userIdFor } = require('../auth');

function notesRouter(db) {
  const router = express.Router();

  router.use((req, res, next) => {
    const id = userIdFor(req.headers['x-token']);
    if (id === null) return res.status(401).json({ error: 'no autenticado' });
    req.userId = id;
    next();
  });

  router.get('/notes', async (req, res) => {
    res.json(await db.note.findMany({ where: { userId: req.userId } }));
  });

  router.post('/notes', express.json(), async (req, res) => {
    const note = await db.note.create({ data: { body: req.body.body, userId: req.userId } });
    console.log('nota creada por', req.userId, 'texto:', req.body.body);
    res.status(201).json(note);
  });

  router.delete('/notes/:id', async (req, res) => {
    await db.note.delete({ where: { id: Number(req.params.id) } });
    res.status(204).end();
  });

  return router;
}

module.exports = { notesRouter };
