import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getToken } from './api.js';

let socket = null;
const listeners = new Set();

function ensureSocket() {
  if (socket) return socket;
  socket = io({ path: '/api/socket.io', auth: (cb) => cb({ token: getToken() }), transports: ['websocket', 'polling'] });
  const notify = () => listeners.forEach((l) => l(socket.connected));
  socket.on('connect', notify);
  socket.on('disconnect', notify);
  return socket;
}

export function closeSocket() {
  socket?.close();
  socket = null;
}

/** Subscribe to a live event, e.g. useLive('job:changed', (e) => reload()) */
export function useLive(event, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const s = ensureSocket();
    const fn = (data) => ref.current(data);
    s.on(event, fn);
    return () => s.off(event, fn);
  }, [event]);
}

export function useConnected() {
  const [connected, setConnected] = useState(() => ensureSocket().connected);
  useEffect(() => {
    listeners.add(setConnected);
    return () => listeners.delete(setConnected);
  }, []);
  return connected;
}
