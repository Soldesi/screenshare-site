export type SignalingMessage =
  | { type: 'host-ready'; roomId: string; clientId: string }
  | { type: 'viewer-joined'; roomId: string; clientId: string }
  | { type: 'viewer-ready'; roomId: string; clientId: string }
  | { type: 'offer'; roomId: string; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; roomId: string; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; roomId: string; from: string; to: string; candidate: RTCIceCandidateInit }
  | { type: 'viewer-left'; roomId: string; clientId: string }
  | { type: 'error'; message: string };
