/**
 * AWS Lambda Handler for Amazon Chime SDK Meetings
 * Compatible with AWS API Gateway HTTP/REST API (v1 / v2 proxy)
 * 
 * Routes supported:
 * - POST /calls/create
 * - POST /calls/join
 * - POST /calls/end
 */

import {
  ChimeSDKMeetingsClient,
  CreateMeetingCommand,
  CreateAttendeeCommand,
  DeleteMeetingCommand
} from '@aws-sdk/client-chime-sdk-meetings';

const AWS_REGION = process.env.AWS_REGION || process.env.AWS_CHIME_REGION || 'us-east-1';
const MEDIA_REGION = process.env.AWS_CHIME_MEDIA_REGION || 'ap-south-1';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'real-time-chat-app-dbaf1';

const chimeClient = new ChimeSDKMeetingsClient({ region: AWS_REGION });

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
  'Content-Type': 'application/json'
};

function parseFirebaseToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or malformed Authorization header');
  }
  const token = authHeader.split('Bearer ')[1].trim();
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error('Firebase token expired');
  }
  const uid = payload.user_id || payload.sub;
  if (!uid) {
    throw new Error('Missing user UID');
  }
  return { uid, email: payload.email, name: payload.name };
}

export const handler = async (event) => {
  const method = event.httpMethod || event.requestContext?.http?.method || '';
  const path = event.path || event.rawPath || '';

  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: 'OK' })
    };
  }

  try {
    const headers = event.headers || {};
    const authHeader = headers.Authorization || headers.authorization;
    const user = parseFirebaseToken(authHeader);

    const body = event.body ? JSON.parse(event.body) : {};

    // Route: Create Meeting
    if (path.endsWith('/calls/create')) {
      const { recipientId, callType, callId } = body;
      if (!recipientId) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'recipientId is required' })
        };
      }

      const clientMeetingToken = callId || `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const externalMeetingId = clientMeetingToken.slice(0, 64);
      const externalUserId = user.uid.slice(0, 64);

      const meetingResponse = await chimeClient.send(new CreateMeetingCommand({
        ClientRequestToken: clientMeetingToken,
        MediaRegion: MEDIA_REGION,
        ExternalMeetingId: externalMeetingId,
        Tags: [
          { Key: 'App', Value: 'PulseChat' },
          { Key: 'CallType', Value: callType || 'voice' },
          { Key: 'CallerUid', Value: user.uid }
        ]
      }));

      const attendeeResponse = await chimeClient.send(new CreateAttendeeCommand({
        MeetingId: meetingResponse.Meeting.MeetingId,
        ExternalUserId: externalUserId
      }));

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          callId: clientMeetingToken,
          meeting: meetingResponse.Meeting,
          attendee: attendeeResponse.Attendee
        })
      };
    }

    // Route: Join Meeting
    if (path.endsWith('/calls/join')) {
      const { meetingId } = body;
      if (!meetingId) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'meetingId is required' })
        };
      }

      const externalUserId = user.uid.slice(0, 64);
      const attendeeResponse = await chimeClient.send(new CreateAttendeeCommand({
        MeetingId: meetingId,
        ExternalUserId: externalUserId
      }));

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          attendee: attendeeResponse.Attendee
        })
      };
    }

    // Route: End Meeting
    if (path.endsWith('/calls/end')) {
      const { meetingId } = body;
      if (!meetingId) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'meetingId is required' })
        };
      }

      try {
        await chimeClient.send(new DeleteMeetingCommand({
          MeetingId: meetingId
        }));
      } catch (delErr) {
        if (delErr.name !== 'NotFoundException') {
          console.warn('DeleteMeeting warning:', delErr.message);
        }
      }

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          message: 'Meeting terminated'
        })
      };
    }

    return {
      statusCode: 404,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: `Not found: ${path}` })
    };
  } catch (error) {
    console.error('Lambda invocation error:', error);
    return {
      statusCode: error.message.includes('token') || error.message.includes('Authorization') ? 401 : 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: error.message || 'Internal server error'
      })
    };
  }
};
