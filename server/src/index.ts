import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

type Role = 'host' | 'viewer';

type Client = {
  id: string;
  socket: WebSocket;
  role: Role;
};

type Room = {
  host?: Client;
  viewers: Map<string, Client>;
};

type SessionDescription = { type?: string; sdp?: string };
type IceCandidate = { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null };
type ClientMessage = {
  type: 'offer' | 'answer' | 'ice-candidate';
  roomId: string;
  from: string;
  to: string;
  sdp?: SessionDescription;
  candidate?: IceCandidate;
};

const PORT = Number(process.env.PORT ?? 3000);
const rooms = new Map<string, Room>();
const clients = new Map<string, { roomId: string; client: Client }>();

function roomFor(roomId: string): Room {
  const existing = rooms.get(roomId);
  if (existing) return existing;
  const room: Room = { viewers: new Map() };
  rooms.set(roomId, room);
  return room;
}

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function makeClientId(): string {
  return randomBytes(8).toString('hex');
}

function removeClient(clientId: string): void {
  const meta = clients.get(clientId);
  if (!meta) return;

  const { roomId, client } = meta;
  const room = rooms.get(roomId);
  clients.delete(clientId);
  if (!room) return;

  if (room.host?.id === client.id) {
    for (const viewer of room.viewers.values()) {
      send(viewer.socket, { type: 'error', message: 'A transmissão foi encerrada pelo host.' });
      viewer.socket.close();
      clients.delete(viewer.id);
    }
    room.viewers.clear();
    room.host = undefined;
  } else {
    room.viewers.delete(client.id);
    if (room.host) {
      send(room.host.socket, { type: 'viewer-left', roomId, clientId: client.id });
    }
  }

  if (!room.host && room.viewers.size === 0) rooms.delete(roomId);
}

const app = express();
app.disable('x-powered-by');
app.get('/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (socket, request) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const roomId = url.searchParams.get('room');
  const role = url.searchParams.get('role');
  if (!roomId || (role !== 'host' && role !== 'viewer')) {
    send(socket, { type: 'error', message: 'Sala ou função inválida.' });
    socket.close();
    return;
  }

  const room = roomFor(roomId);
  const client: Client = { id: makeClientId(), socket, role };

  if (role === 'host') {
    if (room.host) {
      send(socket, { type: 'error', message: 'Esta sala já possui um transmissor.' });
      socket.close();
      return;
    }
    room.host = client;
  } else {
    if (!room.host) {
      send(socket, { type: 'error', message: 'A transmissão ainda não começou.' });
      socket.close();
      return;
    }
    room.viewers.set(client.id, client);
  }

  clients.set(client.id, { roomId, client });

  if (role === 'host') {
    send(socket, { type: 'host-ready', roomId, clientId: client.id });
  } else if (room.host) {
    send(socket, { type: 'viewer-ready', roomId, clientId: client.id });
    send(room.host.socket, { type: 'viewer-joined', roomId, clientId: client.id });
  }

  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(String(raw)) as ClientMessage;
      if (!message.to || message.roomId !== roomId) return;
      const target = clients.get(message.to)?.client;
      if (!target || target.socket.readyState !== WebSocket.OPEN) return;
      send(target.socket, message);
    } catch {
      send(socket, { type: 'error', message: 'Mensagem inválida.' });
    }
  });

  socket.on('close', () => removeClient(client.id));
  socket.on('error', () => removeClient(client.id));
});

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname !== '/signal') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
});

server.listen(PORT, () => {
  console.log(`ScreenShare server rodando em http://localhost:${PORT}`);
});
