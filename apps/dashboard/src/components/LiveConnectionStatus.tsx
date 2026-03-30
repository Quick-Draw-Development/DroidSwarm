'use client';

import { useEffect, useState } from 'react';

const DEFAULT_SOCKET_URL = process.env.NEXT_PUBLIC_DROIDSWARM_SOCKET_URL ?? 'ws://127.0.0.1:8765';
const DEFAULT_PROJECT_ID = process.env.NEXT_PUBLIC_DROIDSWARM_PROJECT_ID ?? 'droidswarm';

export function LiveConnectionStatus() {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const [socketUrl, setSocketUrl] = useState(DEFAULT_SOCKET_URL);
  const [projectId, setProjectId] = useState(DEFAULT_PROJECT_ID);
  const [isProjectResolved, setIsProjectResolved] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/socket-url')
      .then((response) => response.json())
      .then((payload: { socketUrl?: string; projectId?: string }) => {
        if (!active) {
          return;
        }
        if (typeof payload.socketUrl === 'string' && payload.socketUrl) {
          setSocketUrl(payload.socketUrl);
        }
        if (typeof payload.projectId === 'string' && payload.projectId) {
          setProjectId(payload.projectId);
        }
      })
      .catch(() => {
        // keep using the defaults
      })
      .finally(() => {
        if (active) {
          setIsProjectResolved(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isProjectResolved) {
      return;
    }

    setStatus('connecting');
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
  }, [socketUrl, projectId, isProjectResolved]);

  return <span className={`status-pill status-${status}`}>{status}</span>;
}
