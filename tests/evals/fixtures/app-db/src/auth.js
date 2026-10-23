'use strict';
// Sesiones en memoria; el secreto sale del entorno (aquí solo un marcador).
const sessions = new Map();
const SECRET = process.env.SESSION_SECRET || 'REEMPLAZAR_ESTE_MARCADOR';

function hash(password) {
  return `${SECRET}:${Buffer.from(password).toString('base64')}`;
}

function login(user, password) {
  if (!user || user.passwordHash !== hash(password)) return null;
  const token = `t_${sessions.size + 1}`;
  sessions.set(token, user.id);
  return token;
}

function userIdFor(token) {
  return sessions.get(token) ?? null;
}

module.exports = { hash, login, userIdFor };
