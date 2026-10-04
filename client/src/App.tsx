import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { SignalingMessage } from './types';
import { createPeerConnection, SignalingClient } from './webrtc';

const FRAME_RATE = 60;

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/host/:roomId" element={<HostPage />} />
      <Route path="/watch/:roomId" element={<ViewerPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function HomePage() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');

  function createRoom() {
    const id = createRoomId();
    navigate(`/host/${id}`);
  }

  function watchRoom(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeRoomId(roomId);
    if (normalized) navigate(`/watch/${normalized}`);
  }

  return (
    <MainLayout>
      <section className="hero-grid">
        <div className="hero-copy">
          <span className="eyebrow">COMPARTILHE SUA TELA EM TEMPO REAL • ATÉ 60 FPS</span>
          <h1>Compartilhe sua tela. Mande o codigo da sala. Pronto.</h1>
          <p>
            Uma sala leve para transmitir sua tela diretamente para quem tiver o link, sem gravação e sem instalar programa.
          </p>
          <div className="hero-actions">
            <button className="button primary" onClick={createRoom}>Criar transmissão</button>
          </div>
        </div>

        <div className="preview-card">
          <div className="preview-topbar">
            <span className="status-dot" /> AO VIVO
            <span className="fps-badge">60 FPS</span>
          </div>
          <div className="preview-screen">
            <div className="preview-window">
              <div className="preview-window-title">Minha área de trabalho</div>
              <div className="preview-lines" />
              <div className="preview-card-mini">ScreenShare</div>
            </div>
          </div>
          <div className="preview-footer">Conexão WebRTC ponto a ponto</div>
        </div>
      </section>

      <section id="como-funciona" className="feature-section">
        <div className="section-heading">
          <span className="eyebrow">SIMPLES</span>
          <h2>Feito para compartilhar sem complicação</h2>
        </div>
        <div className="feature-grid">
          <FeatureCard number="01" title="Crie uma sala">O site gera um link único para sua transmissão.</FeatureCard>
          <FeatureCard number="02" title="Compartilhe a tela">O navegador pede sua permissão e captura a tela em até 60 FPS.</FeatureCard>
          <FeatureCard number="03" title="Envie o link">Quem abrir o link entra como espectador e assiste em tempo real.</FeatureCard>
        </div>
      </section>

      <section className="join-section">
        <div>
          <span className="eyebrow">JÁ TEM UM LINK?</span>
          <h2>Entrar em uma transmissão</h2>
        </div>
        <form className="join-form" onSubmit={watchRoom}>
          <input
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            placeholder="Cole o código da sala"
            aria-label="Código da sala"
          />
          <button className="button primary" type="submit">Assistir</button>
        </form>
      </section>
    </MainLayout>
  );
}

function HostPage() {
  const { roomId = '' } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const signalRef = useRef<SignalingClient | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const selfIdRef = useRef('');
  const [status, setStatus] = useState('Conectando...');
  const [connectionOnline, setConnectionOnline] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;

    async function setup() {
      if (!roomId) {
        navigate('/');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: FRAME_RATE, max: FRAME_RATE },
          },
          audio: false,
        });

        if (!alive) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          endBroadcast(false);
        });
        setStarted(true);
        setStatus('Transmitindo');

        const signaling = new SignalingClient((message) => {
          void handleSignal(message);
        }, setConnectionOnline);
        signalRef.current = signaling;
        await signaling.connect(roomId, 'host');
      } catch (err) {
        if (!alive) return;
        const message = err instanceof Error ? err.message : 'Não foi possível iniciar a transmissão.';
        setError(message.includes('Permission') || message.includes('NotAllowed')
          ? 'O compartilhamento de tela foi cancelado.'
          : message);
        setStatus('Aguardando');
      }
    }

    void setup();
    return () => {
      alive = false;
      peersRef.current.forEach((peer) => peer.close());
      peersRef.current.clear();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      signalRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, navigate]);

  async function handleSignal(message: SignalingMessage): Promise<void> {
    if (message.type === 'host-ready') {
      selfIdRef.current = message.clientId;
      return;
    }

    if (!streamRef.current) return;

    if (message.type === 'viewer-joined') {
      const peer = createPeerConnection(
        (candidate) => signalRef.current?.send({
          type: 'ice-candidate',
          roomId,
          from: selfIdRef.current,
          to: message.clientId,
          candidate: candidate.toJSON(),
        }),
        (state) => {
          if (state === 'connected') {
            setViewerCount(peersRef.current.size);
          }
          if (state === 'failed' || state === 'closed' || state === 'disconnected') {
            closeViewer(message.clientId);
          }
        },
      );
      peersRef.current.set(message.clientId, peer);
      streamRef.current.getTracks().forEach((track) => peer.addTrack(track, streamRef.current!));
      const offer = await peer.createOffer({ offerToReceiveVideo: false, offerToReceiveAudio: false });
      await peer.setLocalDescription(offer);
      signalRef.current?.send({
        type: 'offer',
        roomId,
        from: selfIdRef.current,
        to: message.clientId,
        sdp: offer,
      });
      setViewerCount(peersRef.current.size);
      return;
    }

    if (message.type === 'answer') {
      const peer = peersRef.current.get(message.from);
      if (!peer) return;
      await peer.setRemoteDescription(message.sdp);
      await flushCandidates(peer, pendingCandidatesRef.current.get(message.from));
      pendingCandidatesRef.current.delete(message.from);
      return;
    }

    if (message.type === 'ice-candidate' && message.from !== selfIdRef.current) {
      const peer = peersRef.current.get(message.from);
      if (!peer) return;
      if (peer.remoteDescription) {
        await peer.addIceCandidate(message.candidate);
      } else {
        const list = pendingCandidatesRef.current.get(message.from) ?? [];
        list.push(message.candidate);
        pendingCandidatesRef.current.set(message.from, list);
      }
    }
  }

  function closeViewer(clientId: string) {
    peersRef.current.get(clientId)?.close();
    peersRef.current.delete(clientId);
    pendingCandidatesRef.current.delete(clientId);
    setViewerCount(peersRef.current.size);
  }

  function endBroadcast(goHome: boolean) {
    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    signalRef.current?.close();
    setStarted(false);
    setStatus('Encerrada');
    setViewerCount(0);
    if (goHome) navigate('/');
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('Não foi possível copiar. Selecione o código e copie manualmente.');
    }
  }

  return (
    <MainLayout compact>
      <div className="live-header">
        <div>
          <span className={`live-pill ${started ? '' : 'inactive'}`}><span className="status-dot" /> {status}</span>
          <h1>Sua transmissão</h1>
          <p>Sala <strong>{roomId}</strong> • {viewerCount} espectador(es)</p>
        </div>
        <div className="connection-indicator">{connectionOnline ? 'Servidor conectado' : 'Conectando ao servidor...'}</div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="studio-grid">
        <section className="stream-stage">
          <div className="video-shell">
            <video ref={videoRef} autoPlay muted playsInline className="video-element" />
            {!started && <div className="video-empty">Selecione uma tela para começar.</div>}
          </div>
          <div className="video-meta">
            <span>Captura: até {FRAME_RATE} FPS</span>
            <span>Áudio: desativado</span>
          </div>
        </section>

        <aside className="share-panel">
          <span className="eyebrow">CÓDIGO DA SALA</span>
          <h2>Envie este código para quem vai assistir</h2>
          <div className="link-box">{roomId}</div>
          <button className="button primary full" onClick={copyCode}>{copied ? 'Código copiado ✓' : 'Copiar código'}</button>
          <button className="button danger full" onClick={() => endBroadcast(true)}>Encerrar transmissão</button>
          <Link className="back-link" to="/">← Voltar para o início</Link>
        </aside>
      </div>
    </MainLayout>
  );
}

function ViewerPage() {
  const { roomId = '' } = useParams();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const signalRef = useRef<SignalingClient | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const selfIdRef = useRef('');
  const [status, setStatus] = useState('Conectando...');
  const [online, setOnline] = useState(false);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let alive = true;

    async function setup() {
      if (!roomId) return;

      const signaling = new SignalingClient((message) => {
        void handleSignal(message);
      }, setOnline);
      signalRef.current = signaling;

      try {
        await signaling.connect(roomId, 'viewer');
        setStatus('Aguardando o transmissor...');
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Não foi possível conectar.');
      }
    }

    void setup();
    return () => {
      alive = false;
      peerRef.current?.close();
      signalRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  async function handleSignal(message: SignalingMessage): Promise<void> {
    if (message.type === 'error') {
      setError(message.message);
      setStatus('Indisponível');
      return;
    }

    if (message.type === 'viewer-ready') {
      selfIdRef.current = message.clientId;
      return;
    }

    if (message.type === 'offer') {
      peerRef.current?.close();
      const peer = createPeerConnection(
        (candidate) => signalRef.current?.send({
          type: 'ice-candidate',
          roomId,
          from: selfIdRef.current,
          to: message.from,
          candidate: candidate.toJSON(),
        }),
        (state) => {
          if (state === 'connected') setStatus('Ao vivo');
          if (state === 'failed' || state === 'disconnected') setStatus('Conexão perdida');
        },
        (event) => {
          const [stream] = event.streams;
          if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            void videoRef.current.play().catch(() => undefined);
          }
        },
      );
      peerRef.current = peer;
      await peer.setRemoteDescription(message.sdp);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      signalRef.current?.send({
        type: 'answer',
        roomId,
        from: selfIdRef.current,
        to: message.from,
        sdp: answer,
      });
      for (const candidate of pendingCandidatesRef.current) {
        await peer.addIceCandidate(candidate);
      }
      pendingCandidatesRef.current = [];
      return;
    }

    if (message.type === 'ice-candidate' && message.from !== selfIdRef.current) {
      const peer = peerRef.current;
      if (peer?.remoteDescription) {
        await peer.addIceCandidate(message.candidate);
      } else {
        pendingCandidatesRef.current.push(message.candidate);
      }
    }
  }

  async function toggleFullscreen() {
    const element = videoRef.current;
    if (!element) return;
    if (!document.fullscreenElement) {
      await element.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  }

  return (
    <MainLayout compact>
      <div className="viewer-head">
        <div>
          <span className={`live-pill ${status === 'Ao vivo' ? '' : 'inactive'}`}><span className="status-dot" /> {status}</span>
          <h1>Assistindo transmissão</h1>
          <p>Sala <strong>{roomId}</strong></p>
        </div>
        <div className="connection-indicator">{online ? 'Sinalização conectada' : 'Conectando...'}</div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <section className="viewer-stage">
        <div className="viewer-video-wrap">
          <video ref={videoRef} autoPlay playsInline className="viewer-video" />
          {status !== 'Ao vivo' && (
            <div className="viewer-overlay">
              <div className="spinner" />
              <strong>{error ? 'Transmissão indisponível' : 'Aguardando transmissão...'}</strong>
              <span>{error ? 'Verifique o link e tente novamente.' : 'Assim que o host começar, o vídeo aparecerá aqui.'}</span>
            </div>
          )}
          <button className="fullscreen-button" onClick={() => void toggleFullscreen()} aria-label="Alternar tela cheia">
            {isFullscreen ? '⤢' : '⛶'}
          </button>
        </div>
      </section>

      <div className="viewer-footer">
        <Link className="back-link" to="/">Criar minha própria transmissão →</Link>
        <span>WebRTC • transmissão sem gravação</span>
      </div>
    </MainLayout>
  );
}

function MainLayout({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  const location = useLocation();
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <img className="brand-logo" src="/logo.png" alt="" />
          <span>ScreenShare</span>
        </Link>
        {location.pathname !== '/' && <Link className="header-link" to="/">Início</Link>}
      </header>
      <main className={compact ? 'page compact-page' : 'page'}>{children}</main>
      <footer className="footer">Compartilhamento de tela em tempo real</footer>
    </div>
  );
}

function FeatureCard({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <article className="feature-card">
      <span className="feature-number">{number}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}

function NotFoundPage() {
  return (
    <MainLayout>
      <section className="empty-page">
        <h1>Página não encontrada</h1>
        <Link className="button primary" to="/">Voltar ao início</Link>
      </section>
    </MainLayout>
  );
}

async function flushCandidates(peer: RTCPeerConnection, candidates: RTCIceCandidateInit[] | undefined) {
  if (!candidates) return;
  for (const candidate of candidates) {
    await peer.addIceCandidate(candidate);
  }
}

function createRoomId(): string {
  const values = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function normalizeRoomId(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/(?:\/watch\/|\/host\/)?([A-Za-z0-9_-]{4,64})\/?$/);
  return match?.[1] ?? '';
}

export default App;