import { addDoc, collection, db, doc, getDocs, onSnapshot, writeBatch } from './firebase';
import { CallSession, CallType, WebRtcSessionDescription } from '../types/chat.types';
import { callSignalingService } from './callSignalingService';

export type PeerConnectionState = RTCPeerConnectionState;

export interface WebRtcCallCallbacks {
  onLocalStream?: (stream: MediaStream) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionState?: (state: PeerConnectionState) => void;
}

interface ActivePeer {
  peerConnection: RTCPeerConnection;
  localStream: MediaStream;
  remoteStream: MediaStream;
  role: 'caller' | 'callee';
  callbacks: WebRtcCallCallbacks;
  localCandidatesReady: boolean;
  pendingLocalCandidates: RTCIceCandidateInit[];
  pendingRemoteCandidates: RTCIceCandidateInit[];
  seenRemoteCandidates: Set<string>;
  remoteDescriptionPromise: Promise<void> | null;
  unsubscribeCandidates: (() => void) | null;
  unsubscribeCall: (() => void) | null;
}

function rtcConfiguration(): RTCConfiguration {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  const configuredStun = env?.VITE_WEBRTC_STUN_URLS
    ?.split(',')
    .map((url) => url.trim())
    .filter(Boolean);

  return {
    iceServers: [{
      urls: configuredStun?.length
        ? configuredStun
        : ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']
    }],
    bundlePolicy: 'max-bundle'
  };
}

function candidateCollection(callId: string, role: 'caller' | 'callee'): string {
  return `calls/${callId}/${role}Candidates`;
}

function cleanCandidate(candidate: RTCIceCandidate): RTCIceCandidateInit {
  const value = candidate.toJSON();
  return {
    candidate: value.candidate || '',
    sdpMid: value.sdpMid ?? null,
    sdpMLineIndex: value.sdpMLineIndex ?? null,
    usernameFragment: value.usernameFragment ?? null
  };
}

class WebRtcCallService {
  private peers = new Map<string, ActivePeer>();
  private cancelledCalls = new Set<string>();

  private assertCallIsActive(callId: string): void {
    if (this.cancelledCalls.has(callId)) {
      throw new Error('Call setup was canceled.');
    }
  }

  public wasCallCancelled(callId: string): boolean {
    return this.cancelledCalls.has(callId);
  }

  private async createPeer(
    callId: string,
    callType: CallType,
    role: 'caller' | 'callee',
    callbacks: WebRtcCallCallbacks
  ): Promise<ActivePeer> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser cannot access a microphone or camera. Open the app over HTTPS and allow device access.');
    }

    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: callType === 'video' ? { facingMode: 'user' } : false
    });

    if (this.cancelledCalls.has(callId)) {
      localStream.getTracks().forEach((track) => track.stop());
      throw new Error('Call setup was canceled.');
    }

    const peerConnection = new RTCPeerConnection(rtcConfiguration());
    const activePeer: ActivePeer = {
      peerConnection,
      localStream,
      remoteStream: new MediaStream(),
      role,
      callbacks,
      localCandidatesReady: false,
      pendingLocalCandidates: [],
      pendingRemoteCandidates: [],
      seenRemoteCandidates: new Set(),
      remoteDescriptionPromise: null,
      unsubscribeCandidates: null,
      unsubscribeCall: null
    };
    this.peers.set(callId, activePeer);

    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
    callbacks.onLocalStream?.(localStream);
    callbacks.onRemoteStream?.(activePeer.remoteStream);

    peerConnection.ontrack = (event) => {
      if (!activePeer.remoteStream.getTracks().some((track) => track.id === event.track.id)) {
        activePeer.remoteStream.addTrack(event.track);
        callbacks.onRemoteStream?.(new MediaStream(activePeer.remoteStream.getTracks()));
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) return;
      const candidate = cleanCandidate(event.candidate);
      if (!activePeer.localCandidatesReady) {
        activePeer.pendingLocalCandidates.push(candidate);
        return;
      }
      void this.publishCandidate(callId, role, candidate);
    };

    peerConnection.onconnectionstatechange = () => {
      callbacks.onConnectionState?.(peerConnection.connectionState);
    };

    return activePeer;
  }

  private async publishCandidate(
    callId: string,
    role: 'caller' | 'callee',
    candidate: RTCIceCandidateInit
  ): Promise<void> {
    try {
      await addDoc(collection(db, candidateCollection(callId, role)), candidate);
    } catch (error) {
      console.warn(`[WebRTC] Could not publish ${role} ICE candidate:`, error);
    }
  }

  private markLocalCandidatesReady(callId: string, peer: ActivePeer): void {
    peer.localCandidatesReady = true;
    const queued = peer.pendingLocalCandidates.splice(0);
    queued.forEach((candidate) => void this.publishCandidate(callId, peer.role, candidate));
  }

  private listenForRemoteCandidates(callId: string, peer: ActivePeer): void {
    const remoteRole = peer.role === 'caller' ? 'callee' : 'caller';
    peer.unsubscribeCandidates = onSnapshot(
      collection(db, candidateCollection(callId, remoteRole)),
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type !== 'added') return;
          const candidate = change.doc.data() as RTCIceCandidateInit;
          const key = JSON.stringify(candidate);
          if (peer.seenRemoteCandidates.has(key)) return;
          peer.seenRemoteCandidates.add(key);

          if (!peer.peerConnection.remoteDescription) {
            peer.pendingRemoteCandidates.push(candidate);
            return;
          }
          void this.addRemoteCandidate(peer, candidate);
        });
      },
      (error) => console.warn('[WebRTC] ICE candidate listener failed:', error)
    );
  }

  private async addRemoteCandidate(peer: ActivePeer, candidate: RTCIceCandidateInit): Promise<void> {
    try {
      await peer.peerConnection.addIceCandidate(candidate);
    } catch (error) {
      console.warn('[WebRTC] Could not apply remote ICE candidate:', error);
    }
  }

  private async flushRemoteCandidates(peer: ActivePeer): Promise<void> {
    const queued = peer.pendingRemoteCandidates.splice(0);
    for (const candidate of queued) {
      await this.addRemoteCandidate(peer, candidate);
    }
  }

  private async setRemoteDescription(
    peer: ActivePeer,
    description: WebRtcSessionDescription
  ): Promise<void> {
    if (peer.peerConnection.remoteDescription || peer.remoteDescriptionPromise) return;
    peer.remoteDescriptionPromise = peer.peerConnection
      .setRemoteDescription(description)
      .then(() => this.flushRemoteCandidates(peer))
      .finally(() => {
        peer.remoteDescriptionPromise = null;
      });
    await peer.remoteDescriptionPromise;
  }

  async startOutgoingCall(
    session: CallSession,
    callbacks: WebRtcCallCallbacks
  ): Promise<{ localStream: MediaStream; remoteStream: MediaStream }> {
    this.cancelledCalls.delete(session.id);
    const peer = await this.createPeer(session.id, session.callType, 'caller', callbacks);
    try {
      const offer = await peer.peerConnection.createOffer();
      this.assertCallIsActive(session.id);
      await peer.peerConnection.setLocalDescription(offer);
      this.assertCallIsActive(session.id);
      const description: WebRtcSessionDescription = {
        type: 'offer',
        sdp: offer.sdp || ''
      };

      await callSignalingService.createCall({
        ...session,
        status: 'ringing',
        offer: description
      });
      if (this.cancelledCalls.has(session.id)) {
        await callSignalingService.updateCallStatus(session.id, 'ended', {
          endedReason: 'canceled',
          endedAt: Date.now()
        });
        throw new Error('Call setup was canceled.');
      }
      this.markLocalCandidatesReady(session.id, peer);
      this.listenForRemoteCandidates(session.id, peer);
      peer.unsubscribeCall = onSnapshot(doc(db, 'calls', session.id), (snapshot) => {
        const answer = snapshot.data()?.answer as WebRtcSessionDescription | undefined;
        if (answer && !peer.peerConnection.remoteDescription) {
          void this.setRemoteDescription(peer, answer).catch((error) => {
            console.warn('[WebRTC] Could not apply call answer:', error);
          });
        }
      }, (error) => console.warn('[WebRTC] Call answer listener failed:', error));
      return { localStream: peer.localStream, remoteStream: peer.remoteStream };
    } catch (error) {
      if (this.cancelledCalls.has(session.id)) {
        await callSignalingService.updateCallStatus(session.id, 'ended', {
          endedReason: 'canceled',
          endedAt: Date.now()
        });
      }
      await this.endCall(session.id, false);
      throw error;
    }
  }

  async acceptIncomingCall(
    session: CallSession,
    callbacks: WebRtcCallCallbacks
  ): Promise<{ localStream: MediaStream; remoteStream: MediaStream }> {
    if (!session.offer) throw new Error('This call has no WebRTC offer. Ask the caller to try again.');
    this.cancelledCalls.delete(session.id);
    const peer = await this.createPeer(session.id, session.callType, 'callee', callbacks);
    try {
      this.listenForRemoteCandidates(session.id, peer);
      await this.setRemoteDescription(peer, session.offer);
      this.assertCallIsActive(session.id);
      const answer = await peer.peerConnection.createAnswer();
      this.assertCallIsActive(session.id);
      await peer.peerConnection.setLocalDescription(answer);
      this.assertCallIsActive(session.id);

      await callSignalingService.acceptCallWithAnswer(session.id, {
        type: 'answer',
        sdp: answer.sdp || ''
      });
      this.assertCallIsActive(session.id);
      this.markLocalCandidatesReady(session.id, peer);
      return { localStream: peer.localStream, remoteStream: peer.remoteStream };
    } catch (error) {
      if (this.cancelledCalls.has(session.id)) {
        await callSignalingService.updateCallStatus(session.id, 'ended', {
          endedReason: 'canceled',
          endedAt: Date.now()
        });
      }
      await this.endCall(session.id, false);
      throw error;
    }
  }

  async replaceVideoTrack(callId: string, track: MediaStreamTrack): Promise<void> {
    const peer = this.peers.get(callId);
    if (!peer) throw new Error('The call is no longer active.');
    const sender = peer.peerConnection.getSenders().find((item) => item.track?.kind === 'video');
    if (!sender) throw new Error('This call has no video track.');
    await sender.replaceTrack(track);
  }

  async endCall(callId: string, cancelSetup = true): Promise<void> {
    if (cancelSetup) this.cancelledCalls.add(callId);
    const peer = this.peers.get(callId);
    if (!peer) return;
    this.peers.delete(callId);
    peer.unsubscribeCandidates?.();
    peer.unsubscribeCall?.();
    peer.peerConnection.ontrack = null;
    peer.peerConnection.onicecandidate = null;
    peer.peerConnection.onconnectionstatechange = null;
    peer.peerConnection.close();
    peer.localStream.getTracks().forEach((track) => track.stop());
    peer.remoteStream.getTracks().forEach((track) => track.stop());
    try {
      const candidates = await getDocs(collection(db, candidateCollection(callId, peer.role)));
      if (!candidates.empty) {
        const batch = writeBatch(db);
        candidates.docs.forEach((candidate) => batch.delete(candidate.ref));
        await batch.commit();
      }
    } catch (error) {
      console.warn('[WebRTC] Could not clean up local ICE candidates:', error);
    }
  }
}

export const webRtcCallService = new WebRtcCallService();
