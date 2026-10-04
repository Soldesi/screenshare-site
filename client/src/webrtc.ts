import type { SignalingMessage } from './types';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ],
};

export type Role = 'host' | 'viewer';

type MessageHandler = (message: SignalingMessage) => void;

export class SignalingClient {
  private socket: WebSocket | null = null;
  private readonly onMessage: MessageHandler;
  private readonly onStatus: (online: boolean) => void;

  constructor(onMessage: MessageHandler, onStatus: (online: boolean) => void) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
  }

  connect(roomId: string, role: Role): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const socketUrl = `${protocol}://${window.location.host}/signal?room=${encodeURIComponent(roomId)}&role=${role}`;
      const socket = new WebSocket(socketUrl);
      this.socket = socket;

      socket.addEventListener('open', () => {
        this.onStatus(true);
        resolve();
      }, { once: true });

      socket.addEventListener('error', () => {
        this.onStatus(false);
        reject(new Error('Não foi possível conectar ao servidor de sinalização.'));
      }, { once: true });

      socket.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data) as SignalingMessage;
          this.onMessage(message);
        } catch {
          // Ignora mensagens inválidas.
        }
      });

      socket.addEventListener('close', () => this.onStatus(false));
    });
  }

  send(message: SignalingMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error('A conexão com o servidor não está pronta.');
    }
    this.socket.send(JSON.stringify(message));
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }
}

export function createPeerConnection(
  onIceCandidate: (candidate: RTCIceCandidate) => void,
  onConnectionState: (state: RTCPeerConnectionState) => void,
  onTrack?: (event: RTCTrackEvent) => void,
): RTCPeerConnection {
  const peer = new RTCPeerConnection(ICE_SERVERS);

  peer.addEventListener('icecandidate', (event) => {
    if (event.candidate) onIceCandidate(event.candidate);
  });
  peer.addEventListener('connectionstatechange', () => {
    onConnectionState(peer.connectionState);
  });
  if (onTrack) {
    peer.addEventListener('track', onTrack);
  }

  return peer;
}
