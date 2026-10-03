// Socket.IO: staff clients receive live job board updates.
import { Server } from 'socket.io';
import { verifyToken } from './auth.js';
import { config } from './config.js';

let io = null;

export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    path: '/api/socket.io',
    cors: { origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') },
  });
  io.use((socket, next) => {
    try {
      socket.data.user = verifyToken(socket.handshake.auth?.token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });
  io.on('connection', (socket) => socket.join('staff'));
  return io;
}

/**
 * Listen for Postgres NOTIFY 'job_changed' (sent by the worker after a message is sent)
 * and forward it to staff screens. Reconnects automatically.
 */
let listenClient = null;
let stopped = false;
export async function listenForDbEvents(pool) {
  let client;
  const retry = () => { if (!stopped) setTimeout(() => listenForDbEvents(pool), 5000).unref(); };
  try {
    client = listenClient = await pool.connect();
    client.on('notification', (msg) => {
      if (msg.channel === 'job_changed') emitJobChanged(Number(msg.payload), { source: 'worker' });
    });
    client.on('error', () => { client.release(true); retry(); });
    await client.query('LISTEN job_changed');
  } catch {
    client?.release(true);
    retry();
  }
}

export function stopRealtime() {
  stopped = true;
  listenClient?.release(true);
  listenClient = null;
  io?.close();
}

/** Broadcast that a job card changed. Clients refetch what they need. */
export function emitJobChanged(jobId, extra = {}) {
  io?.to('staff').emit('job:changed', { id: jobId, ...extra });
}

export function emitPartsChanged() {
  io?.to('staff').emit('parts:changed', {});
}
