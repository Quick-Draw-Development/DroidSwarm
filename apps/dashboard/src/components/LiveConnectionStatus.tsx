'use client';

import { useEffect, useState } from 'react';

const socketUrl = process.env.NEXT_PUBLIC_DROIDSWARM_SOCKET_URL ?? 'ws://127.0.0.1:8765';
const projectId = process.env.NEXT_PUBLIC_DROIDSWARM_PROJECT_ID ?? 'droidswarm';

export function LiveConnectionStatus() {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting');

  useEffect(() => {
    const socket = new WebSocket(socketUrl);

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        type: 'auth',
        project_id: projectId,
        timestamp: new Date().toISOString(),
        payload: {
          room_id: 'dashboard-status',
          agent_name: `dashboard-${crypto.randomUUID().slice(0, 8)}`,
          agent_role: 'ui',
          client_type: 'dashboard',
        },
      }));
    });
    socket.addEventListener('message', (event) => {
      if (String(event.data).includes('Authenticated')) {
        setStatus('connected');
      }
    });
    socket.addEventListener('close', () => setStatus('offline'));
    socket.addEventListener('error', () => setStatus('offline'));

    return () => {
      socket.close();
    };
  }, []);

  return <span className={`status-pill status-${status}`}>{status}</span>;
}
