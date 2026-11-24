import { Router } from 'express';

const API_GATEWAY_URL = 'https://0sz03xhubg.execute-api.ap-southeast-2.amazonaws.com/prod/upload-url';

export function createMediaRouter() {
  const router = Router();

  // Handle CORS preflight for all media endpoints
  router.options('*', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    return res.sendStatus(204);
  });

  // Upload URL generator / proxy
  router.post('/upload-url', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      const authHeader = req.headers.authorization;
      const response = await fetch(API_GATEWAY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {})
        },
        body: JSON.stringify(req.body)
      });

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { message: responseText };
      }

      if (!response.ok) {
        return res.status(response.status).json(data);
      }
      return res.status(200).json(data);
    } catch (err) {
      console.error('[MediaRoute] upload-url error:', err);
      return res.status(502).json({ error: 'Could not communicate with S3 upload service' });
    }
  });

  // Download URL generator / proxy
  router.post('/download-url', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      const authHeader = req.headers.authorization;
      const payload = {
        ...req.body,
        action: 'download'
      };

      const response = await fetch(API_GATEWAY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {})
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { message: responseText };
      }

      if (!response.ok) {
        return res.status(response.status).json(data);
      }
      return res.status(200).json(data);
    } catch (err) {
      console.error('[MediaRoute] download-url error:', err);
      return res.status(502).json({ error: 'Could not communicate with S3 download service' });
    }
  });

  return router;
}
