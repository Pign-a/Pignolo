// Chrome DevTools Protocol over --remote-debugging-pipe (spec §11.1, A-12): JSON messages
// separated by a NUL byte on fd 3 (to the browser) and fd 4 (from the browser); no WebSocket,
// no port. The read buffer is a Buffer, never a string, so a UTF-8 character split between two
// reads is decoded whole.
//
// createFrameReader(onMessage, onError?) -> (chunk: Buffer) => void
// encodeMessage(obj) -> Buffer
// createCdpClient({ writable, readable, timeoutMs = 20000 }) -> {
//   send(method, params?, { sessionId?, timeoutMs? }) -> Promise<result>   CdpError | CdpTimeout | CdpClosed
//   waitFor(method, { sessionId?, timeoutMs? }) -> Promise<params>         first matching event
//   on(listener(message)) -> off()   every event
//   pendingCount() -> number
// }

export class CdpError extends Error {
  constructor(method, error) {
    super(`${method}: ${error && error.message ? error.message : 'CDP error'}`);
    this.code = error ? error.code : undefined;
  }
}
export class CdpTimeout extends Error {}
export class CdpClosed extends Error {}

export function encodeMessage(obj) {
  return Buffer.concat([Buffer.from(JSON.stringify(obj), 'utf8'), Buffer.from([0])]);
}

export function createFrameReader(onMessage, onError = () => {}) {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : Buffer.from(chunk);
    let i;
    while ((i = buf.indexOf(0)) >= 0) {
      const raw = buf.subarray(0, i);
      buf = buf.subarray(i + 1);
      let msg;
      try { msg = JSON.parse(raw.toString('utf8')); } catch (e) { onError(e); continue; }
      onMessage(msg);
    }
  };
}

export function createCdpClient({ writable, readable, timeoutMs = 20000 }) {
  let nextId = 0;
  let closed = null;
  const pending = new Map();
  const listeners = new Set();

  const closeAll = (reason) => {
    if (closed) return;
    closed = new CdpClosed(`CDP pipe closed (${reason})`);
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(closed); }
    pending.clear();
  };

  readable.on('data', createFrameReader((msg) => {
    if (msg.id !== undefined && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new CdpError(p.method, msg.error));
      else p.resolve(msg.result ?? {});
      return;
    }
    if (typeof msg.method === 'string') for (const l of [...listeners]) l(msg);
  }));
  readable.on('end', () => closeAll('end'));
  readable.on('close', () => closeAll('close'));
  readable.on('error', (e) => closeAll(e.code || e.message));
  writable.on('error', (e) => closeAll(e.code || e.message));

  function send(method, params = {}, { sessionId, timeoutMs: ms = timeoutMs } = {}) {
    if (closed) return Promise.reject(closed);
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new CdpTimeout(`${method}: no answer in ${ms} ms`));
      }, ms);
      pending.set(id, { method, resolve, reject, timer });
      writable.write(encodeMessage({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  function on(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function waitFor(method, { sessionId, timeoutMs: ms = timeoutMs } = {}) {
    return new Promise((resolve, reject) => {
      const off = on((msg) => {
        if (msg.method !== method || (sessionId && msg.sessionId !== sessionId)) return;
        off();
        clearTimeout(timer);
        resolve(msg.params ?? {});
      });
      const timer = setTimeout(() => { off(); reject(new CdpTimeout(`${method}: no event in ${ms} ms`)); }, ms);
    });
  }

  return { send, waitFor, on, pendingCount: () => pending.size };
}
