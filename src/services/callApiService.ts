import { auth } from './firebase';
import { ChimeMeetingCredentials } from '../types/chat.types';

// Use configured call API URL or default to Vite proxy / local server
const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
const CALL_API_URL =
  metaEnv?.VITE_CALL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? '/api/calls'
    : 'https://0sz03xhubg.execute-api.ap-southeast-2.amazonaws.com/prod/calls');

interface CreateMeetingResponse {
  success: boolean;
  callId: string;
  meeting: any;
  attendee: any;
}

interface JoinMeetingResponse {
  success: boolean;
  attendee: any;
}

/**
 * Service to communicate with the AWS Chime SDK Meetings backend API.
 * Authenticates every request with the current user's Firebase ID token.
 */
class CallApiService {
  private async getAuthToken(): Promise<string> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User is not authenticated. Please log in to make calls.');
    }
    return user.getIdToken();
  }

  /**
   * Request backend to create a Chime Meeting and Attendee for the caller.
   */
  public async createMeeting(
    recipientId: string,
    callType: 'voice' | 'video',
    callId?: string
  ): Promise<CreateMeetingResponse> {
    const token = await this.getAuthToken();
    const endpoint = `${CALL_API_URL}/create`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        recipientId,
        callType,
        callId
      })
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `Failed to create meeting (${res.status})`);
    }

    return res.json();
  }

  /**
   * Request backend to create an Attendee for the recipient in an existing Chime meeting.
   */
  public async joinMeeting(callId: string, meetingId: string): Promise<JoinMeetingResponse> {
    const token = await this.getAuthToken();
    const endpoint = `${CALL_API_URL}/join`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        callId,
        meetingId
      })
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `Failed to join meeting (${res.status})`);
    }

    return res.json();
  }

  /**
   * Request backend to delete the Chime Meeting and clean up resources.
   */
  public async endMeeting(meetingId: string, callId?: string): Promise<void> {
    try {
      const token = await this.getAuthToken();
      const endpoint = `${CALL_API_URL}/end`;

      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          meetingId,
          callId
        })
      });
    } catch (err) {
      console.warn('[CallApiService] Failed to notify backend of meeting termination:', err);
    }
  }
}

export const callApiService = new CallApiService();
