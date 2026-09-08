import type { Server } from 'node:http';

/**
 * The old unauthenticated microphone/camera proxy is intentionally retired.
 * Operator Assistant now uses authenticated bounded HTTP dictation and an optional
 * receive-only D-ID avatar. Old clients get an explicit error, not a cloud session.
 */
export function attachLiveAgentWebSocketServer(httpServer: Server): void {
  httpServer.on('upgrade', (request, socket) => {
    let path: string;
    try {
      path = new URL(request.url || '/', 'http://erp.invalid').pathname;
    } catch {
      return;
    }
    if (path !== '/api/live-agent') return;
    socket.write('HTTP/1.1 410 Gone\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    socket.destroy();
  });
}
