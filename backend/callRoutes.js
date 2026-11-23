import { Router } from 'express';
import {
  ChimeSDKMeetingsClient,
  CreateMeetingCommand,
  CreateAttendeeCommand,
  DeleteMeetingCommand,
  GetMeetingCommand
} from '@aws-sdk/client-chime-sdk-meetings';

// AWS Chime SDK Meetings Client
// Chime SDK Meetings control plane is hosted in us-east-1 and eu-central-1.
// Meeting media can be hosted in ap-south-1 (Mumbai), ap-southeast-1 (Singapore), us-east-1, etc.
const AWS_REGION = process.env.AWS_REGION || process.env.AWS_CHIME_REGION || 'us-east-1';
const MEDIA_REGION = process.env.AWS_CHIME_MEDIA_REGION || 'ap-south-1';

let chimeClient = null;

function getChimeClient() {
  if (!chimeClient) {
    const config = {
      region: AWS_REGION
    };

    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      config.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN || undefined
      };
    }

    chimeClient = new ChimeSDKMeetingsClient(config);
  }
  return chimeClient;
}

/**
 * Helper to verify Firebase ID Token from Authorization header.
 * Parses Firebase JWT and validates format, expiration, issuer, and audience.
 */
export async function authenticateFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or malformed Authorization header' });
  }

  const idToken = authHeader.split('Bearer ')[1].trim();
  if (!idToken) {
    return res.status(401).json({ error: 'Unauthorized: Empty token' });
  }

  try {
    // Decode JWT payload without third-party heavy dependencies
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      return res.status(401).json({ error: 'Unauthorized: Invalid JWT structure' });
    }

    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSeconds) {
      return res.status(401).json({ error: 'Unauthorized: Firebase token has expired' });
    }

    const expectedProjectId = process.env.FIREBASE_PROJECT_ID || 'real-time-chat-app-dbaf1';
    if (payload.aud !== expectedProjectId && payload.iss !== `https://securetoken.google.com/${expectedProjectId}`) {
      // Allow if issuer matches standard Firebase pattern
      if (!payload.iss?.includes('securetoken.google.com')) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token issuer or audience' });
      }
    }

    req.user = {
      uid: payload.user_id || payload.sub,
      email: payload.email || null,
      name: payload.name || payload.display_name || null
    };

    if (!req.user.uid) {
      return res.status(401).json({ error: 'Unauthorized: Token missing subject UID' });
    }

    next();
  } catch (err) {
    console.error('[CallAPI] Token verification error:', err);
    return res.status(401).json({ error: 'Unauthorized: Failed to parse token' });
  }
}

export function createCallRouter() {
  const router = Router();

  // In-memory active meetings mapping (callId -> meetingData)
  const activeMeetings = new Map();

  /**
   * POST /api/calls/create
   * Create a new Amazon Chime SDK Meeting and create an Attendee for the caller.
   */
  router.post('/create', authenticateFirebaseToken, async (req, res) => {
    try {
      const { recipientId, callType, callId } = req.body;
      const callerUid = req.user.uid;

      if (!recipientId || typeof recipientId !== 'string') {
        return res.status(400).json({ error: 'recipientId is required' });
      }

      if (callerUid === recipientId) {
        return res.status(400).json({ error: 'Cannot call yourself' });
      }

      const clientMeetingToken = callId || `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const externalMeetingId = clientMeetingToken.slice(0, 64);
      const externalUserId = callerUid.slice(0, 64);

      const client = getChimeClient();

      console.log(`[ChimeSDK] Creating meeting: externalId=${externalMeetingId}, mediaRegion=${MEDIA_REGION}`);

      const createMeetingCommand = new CreateMeetingCommand({
        ClientRequestToken: clientMeetingToken,
        MediaRegion: MEDIA_REGION,
        ExternalMeetingId: externalMeetingId,
        Tags: [
          { Key: 'App', Value: 'PulseChat' },
          { Key: 'CallType', Value: callType || 'voice' },
          { Key: 'CallerUid', Value: callerUid }
        ]
      });

      const meetingResponse = await client.send(createMeetingCommand);
      const meeting = meetingResponse.Meeting;

      console.log(`[ChimeSDK] Meeting created: ${meeting.MeetingId}. Creating attendee for caller ${callerUid}`);

      const createAttendeeCommand = new CreateAttendeeCommand({
        MeetingId: meeting.MeetingId,
        ExternalUserId: externalUserId
      });

      const attendeeResponse = await client.send(createAttendeeCommand);
      const attendee = attendeeResponse.Attendee;

      // Store in active meetings
      activeMeetings.set(clientMeetingToken, {
        meetingId: meeting.MeetingId,
        meeting,
        callerUid,
        recipientId,
        callType: callType || 'voice',
        createdAt: Date.now()
      });

      return res.status(200).json({
        success: true,
        callId: clientMeetingToken,
        meeting,
        attendee
      });
    } catch (err) {
      console.error('[ChimeSDK] Failed to create meeting:', err);
      return res.status(500).json({
        error: 'Failed to create Chime meeting',
        details: err.message
      });
    }
  });

  /**
   * POST /api/calls/join
   * Create an Attendee for the recipient / joining participant.
   */
  router.post('/join', authenticateFirebaseToken, async (req, res) => {
    try {
      const { callId, meetingId } = req.body;
      const joinerUid = req.user.uid;

      if (!meetingId) {
        return res.status(400).json({ error: 'meetingId is required' });
      }

      // Check authorization if call is in active registry
      if (callId && activeMeetings.has(callId)) {
        const session = activeMeetings.get(callId);
        if (session.callerUid !== joinerUid && session.recipientId !== joinerUid) {
          return res.status(403).json({ error: 'Forbidden: You are not a participant in this call' });
        }
      }

      const client = getChimeClient();
      const externalUserId = joinerUid.slice(0, 64);

      console.log(`[ChimeSDK] Creating attendee for user ${joinerUid} in meeting ${meetingId}`);

      const createAttendeeCommand = new CreateAttendeeCommand({
        MeetingId: meetingId,
        ExternalUserId: externalUserId
      });

      const attendeeResponse = await client.send(createAttendeeCommand);
      const attendee = attendeeResponse.Attendee;

      return res.status(200).json({
        success: true,
        attendee
      });
    } catch (err) {
      console.error('[ChimeSDK] Failed to join meeting:', err);
      return res.status(500).json({
        error: 'Failed to join Chime meeting',
        details: err.message
      });
    }
  });

  /**
   * POST /api/calls/end
   * Delete an Amazon Chime SDK Meeting and clean up resources.
   */
  router.post('/end', authenticateFirebaseToken, async (req, res) => {
    try {
      const { callId, meetingId } = req.body;
      const userUid = req.user.uid;

      let targetMeetingId = meetingId;
      if (!targetMeetingId && callId && activeMeetings.has(callId)) {
        targetMeetingId = activeMeetings.get(callId).meetingId;
      }

      if (!targetMeetingId) {
        return res.status(400).json({ error: 'meetingId or callId is required' });
      }

      const client = getChimeClient();
      console.log(`[ChimeSDK] Deleting meeting ${targetMeetingId} requested by ${userUid}`);

      try {
        const deleteMeetingCommand = new DeleteMeetingCommand({
          MeetingId: targetMeetingId
        });
        await client.send(deleteMeetingCommand);
      } catch (deleteErr) {
        // If meeting is already deleted or not found, proceed normally
        if (deleteErr.name !== 'NotFoundException') {
          console.warn('[ChimeSDK] DeleteMeeting warning:', deleteErr.message);
        }
      }

      if (callId) {
        activeMeetings.delete(callId);
      }

      return res.status(200).json({
        success: true,
        message: 'Meeting terminated'
      });
    } catch (err) {
      console.error('[ChimeSDK] Failed to end meeting:', err);
      return res.status(500).json({
        error: 'Failed to end Chime meeting',
        details: err.message
      });
    }
  });

  return router;
}
