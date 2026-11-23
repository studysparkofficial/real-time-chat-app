import {
  ConsoleLogger,
  DefaultDeviceController,
  DefaultMeetingSession,
  LogLevel,
  MeetingSessionConfiguration,
  MeetingSessionStatus,
  MeetingSessionStatusCode,
  VideoTileState
} from 'amazon-chime-sdk-js';
import { ChimeMeetingCredentials } from '../types/chat.types';

export interface ChimeServiceCallbacks {
  onAudioVideoDidStart?: () => void;
  onAudioVideoDidStop?: (statusCode: MeetingSessionStatusCode) => void;
  onConnectionQualityChange?: (quality: 'good' | 'poor' | 'reconnecting' | 'disconnected') => void;
  onLocalVideoStateChange?: (enabled: boolean) => void;
  onRemoteVideoStateChange?: (enabled: boolean) => void;
  onScreenShareStateChange?: (active: boolean) => void;
  onRemoteAudioActivity?: (speaking: boolean, volume: number) => void;
}

class ChimeService {
  private meetingSession: DefaultMeetingSession | null = null;
  private logger: ConsoleLogger | null = null;
  private deviceController: DefaultDeviceController | null = null;

  private localVideoElement: HTMLVideoElement | null = null;
  private remoteVideoElement: HTMLVideoElement | null = null;
  private screenShareElement: HTMLVideoElement | null = null;
  private audioElement: HTMLAudioElement | null = null;

  private localTileId: number | null = null;
  private remoteTileId: number | null = null;
  private contentTileId: number | null = null;

  private isAudioMuted: boolean = false;
  private isVideoInputActive: boolean = false;
  private isScreenSharingActive: boolean = false;

  private callbacks: ChimeServiceCallbacks = {};

  public setCallbacks(callbacks: ChimeServiceCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Initialize and join an Amazon Chime SDK Meeting Session
   */
  public async joinMeeting(
    credentials: ChimeMeetingCredentials,
    options: { videoEnabled?: boolean } = {}
  ): Promise<void> {
    await this.leaveMeeting();

    this.logger = new ConsoleLogger('PulseChatChime', LogLevel.WARN);
    this.deviceController = new DefaultDeviceController(this.logger);

    const configuration = new MeetingSessionConfiguration(
      credentials.Meeting,
      credentials.Attendee
    );

    this.meetingSession = new DefaultMeetingSession(
      configuration,
      this.logger,
      this.deviceController
    );

    const audioVideo = this.meetingSession.audioVideo;

    // Set up Audio & Video Observers
    audioVideo.addObserver({
      audioVideoDidStart: () => {
        console.log('[ChimeService] audioVideoDidStart - session live');
        this.callbacks.onAudioVideoDidStart?.();
        this.callbacks.onConnectionQualityChange?.('good');
      },
      audioVideoDidStop: (sessionStatus: MeetingSessionStatus) => {
        console.log('[ChimeService] audioVideoDidStop:', sessionStatus.statusCode());
        this.callbacks.onAudioVideoDidStop?.(sessionStatus.statusCode());
        this.callbacks.onConnectionQualityChange?.('disconnected');
      },
      connectionDidBecomePoor: () => {
        console.warn('[ChimeService] Connection quality degraded');
        this.callbacks.onConnectionQualityChange?.('poor');
      },
      connectionDidSuggestStopVideo: () => {
        console.warn('[ChimeService] Suggest stop video due to bandwidth');
        this.callbacks.onConnectionQualityChange?.('poor');
      },
      videoTileDidUpdate: (tileState: VideoTileState) => {
        if (!tileState.boundAttendeeId || !tileState.tileId) return;

        // Content Share (Screen Share) Tile
        if (tileState.isContent) {
          this.contentTileId = tileState.tileId;
          this.callbacks.onScreenShareStateChange?.(true);
          if (this.screenShareElement) {
            audioVideo.bindVideoElement(tileState.tileId, this.screenShareElement);
          }
          return;
        }

        // Local Camera Tile
        if (tileState.localTile) {
          this.localTileId = tileState.tileId;
          this.callbacks.onLocalVideoStateChange?.(true);
          if (this.localVideoElement) {
            audioVideo.bindVideoElement(tileState.tileId, this.localVideoElement);
          }
          return;
        }

        // Remote Participant Video Tile
        this.remoteTileId = tileState.tileId;
        this.callbacks.onRemoteVideoStateChange?.(true);
        if (this.remoteVideoElement) {
          audioVideo.bindVideoElement(tileState.tileId, this.remoteVideoElement);
        }
      },
      videoTileWasRemoved: (tileId: number) => {
        if (tileId === this.localTileId) {
          this.localTileId = null;
          this.callbacks.onLocalVideoStateChange?.(false);
          if (this.localVideoElement) {
            audioVideo.unbindVideoElement(tileId);
          }
        } else if (tileId === this.remoteTileId) {
          this.remoteTileId = null;
          this.callbacks.onRemoteVideoStateChange?.(false);
          if (this.remoteVideoElement) {
            audioVideo.unbindVideoElement(tileId);
          }
        } else if (tileId === this.contentTileId) {
          this.contentTileId = null;
          this.callbacks.onScreenShareStateChange?.(false);
          if (this.screenShareElement) {
            audioVideo.unbindVideoElement(tileId);
          }
        }
      }
    });

    // Real-time audio volume & activity subscription
    const attendeeId = credentials.Attendee.AttendeeId;
    audioVideo.realtimeSubscribeToVolumeIndicator(
      attendeeId,
      (id, volume, muted) => {
        // Local volume indicator
      }
    );

    // Bind audio output element if available
    if (this.audioElement) {
      audioVideo.bindAudioElement(this.audioElement);
    }

    // Select Audio Input Device (default mic)
    try {
      const audioInputDevices = await audioVideo.listAudioInputDevices();
      if (audioInputDevices.length > 0) {
        await audioVideo.startAudioInput(audioInputDevices[0].deviceId);
      }
    } catch (err) {
      console.warn('[ChimeService] Could not select default audio device:', err);
    }

    // Start Audio/Video transport session
    audioVideo.start();

    // Start video input if requested (for video calls)
    if (options.videoEnabled) {
      await this.setVideoEnabled(true);
    }
  }

  /**
   * Bind HTML Audio element for remote speech playback
   */
  public bindAudioElement(element: HTMLAudioElement | null): void {
    this.audioElement = element;
    if (element && this.meetingSession) {
      this.meetingSession.audioVideo.bindAudioElement(element);
    }
  }

  /**
   * Bind HTML Video element for local camera stream preview
   */
  public bindLocalVideoElement(element: HTMLVideoElement | null): void {
    this.localVideoElement = element;
    if (element && this.meetingSession && this.localTileId !== null) {
      this.meetingSession.audioVideo.bindVideoElement(this.localTileId, element);
    }
  }

  /**
   * Bind HTML Video element for remote participant video stream
   */
  public bindRemoteVideoElement(element: HTMLVideoElement | null): void {
    this.remoteVideoElement = element;
    if (element && this.meetingSession && this.remoteTileId !== null) {
      this.meetingSession.audioVideo.bindVideoElement(this.remoteTileId, element);
    }
  }

  /**
   * Bind HTML Video element for screen share stream
   */
  public bindScreenShareElement(element: HTMLVideoElement | null): void {
    this.screenShareElement = element;
    if (element && this.meetingSession && this.contentTileId !== null) {
      this.meetingSession.audioVideo.bindVideoElement(this.contentTileId, element);
    }
  }

  /**
   * Toggle or set microphone mute state
   */
  public setAudioMuted(muted: boolean): boolean {
    if (!this.meetingSession) return false;
    const audioVideo = this.meetingSession.audioVideo;

    if (muted) {
      audioVideo.realtimeMuteLocalAudio();
      this.isAudioMuted = true;
    } else {
      audioVideo.realtimeUnmuteLocalAudio();
      this.isAudioMuted = false;
    }

    return this.isAudioMuted;
  }

  public isMuted(): boolean {
    return this.isAudioMuted;
  }

  /**
   * Enable or disable local camera stream
   */
  public async setVideoEnabled(enabled: boolean): Promise<boolean> {
    if (!this.meetingSession) return false;
    const audioVideo = this.meetingSession.audioVideo;

    try {
      if (enabled) {
        const videoInputDevices = await audioVideo.listVideoInputDevices();
        if (videoInputDevices.length === 0) {
          console.warn('[ChimeService] No video input devices found');
          return false;
        }

        await audioVideo.startVideoInput(videoInputDevices[0].deviceId);
        audioVideo.startLocalVideoTile();
        this.isVideoInputActive = true;
      } else {
        audioVideo.stopLocalVideoTile();
        await audioVideo.stopVideoInput();
        this.isVideoInputActive = false;
        this.callbacks.onLocalVideoStateChange?.(false);
      }
    } catch (err) {
      console.error('[ChimeService] Failed to toggle video:', err);
      this.isVideoInputActive = false;
    }

    return this.isVideoInputActive;
  }

  public isVideoActive(): boolean {
    return this.isVideoInputActive;
  }

  /**
   * Start screen sharing from browser
   */
  public async startScreenShare(): Promise<boolean> {
    if (!this.meetingSession) return false;
    try {
      await this.meetingSession.audioVideo.startContentShareFromScreenCapture();
      this.isScreenSharingActive = true;
      return true;
    } catch (err) {
      console.error('[ChimeService] Failed to start screen capture:', err);
      this.isScreenSharingActive = false;
      return false;
    }
  }

  /**
   * Stop screen sharing
   */
  public async stopScreenShare(): Promise<void> {
    if (!this.meetingSession) return;
    try {
      await this.meetingSession.audioVideo.stopContentShare();
      this.isScreenSharingActive = false;
    } catch (err) {
      console.warn('[ChimeService] Error stopping screen share:', err);
    }
  }

  public isScreenSharing(): boolean {
    return this.isScreenSharingActive;
  }

  /**
   * List available video input devices (cameras)
   */
  public async listVideoDevices(): Promise<MediaDeviceInfo[]> {
    if (!this.meetingSession) return [];
    try {
      return await this.meetingSession.audioVideo.listVideoInputDevices();
    } catch {
      return [];
    }
  }

  /**
   * Switch video camera to specified deviceId
   */
  public async switchCamera(deviceId: string): Promise<void> {
    if (!this.meetingSession) return;
    try {
      await this.meetingSession.audioVideo.startVideoInput(deviceId);
    } catch (err) {
      console.error('[ChimeService] Failed to switch camera:', err);
    }
  }

  /**
   * Clean up and leave the meeting session
   */
  public async leaveMeeting(): Promise<void> {
    if (!this.meetingSession) return;

    try {
      const audioVideo = this.meetingSession.audioVideo;

      if (this.isScreenSharingActive) {
        try {
          audioVideo.stopContentShare();
        } catch {
          // Ignore if already stopped
        }
        this.isScreenSharingActive = false;
      }

      if (this.isVideoInputActive) {
        audioVideo.stopLocalVideoTile();
        try {
          await audioVideo.stopVideoInput();
        } catch {
          // Ignore
        }
        this.isVideoInputActive = false;
      }

      if (this.localTileId !== null && this.localVideoElement) {
        audioVideo.unbindVideoElement(this.localTileId);
      }
      if (this.remoteTileId !== null && this.remoteVideoElement) {
        audioVideo.unbindVideoElement(this.remoteTileId);
      }
      if (this.contentTileId !== null && this.screenShareElement) {
        audioVideo.unbindVideoElement(this.contentTileId);
      }

      audioVideo.stop();
    } catch (err) {
      console.warn('[ChimeService] Error during meeting teardown:', err);
    } finally {
      this.meetingSession = null;
      this.localTileId = null;
      this.remoteTileId = null;
      this.contentTileId = null;
      this.isAudioMuted = false;
      this.isVideoInputActive = false;
      this.isScreenSharingActive = false;
    }
  }
}

export const chimeService = new ChimeService();
