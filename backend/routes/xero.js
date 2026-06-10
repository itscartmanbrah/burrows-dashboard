// Xero integration routes — one-time OAuth2 "Authorization Code" consent
// flow plus a status check, used to power the "Showcase Debt Reduction" tab.
//
//   GET  /api/xero/connect   (auth required) -> redirects admin to Xero login
//   GET  /api/xero/callback  (public)        -> Xero redirects back here
//   GET  /api/xero/status    (auth required) -> is Xero connected?
//
// /callback has no requireAuth because Xero (the user's browser) hits it
// directly after consent — there's no Authorization header on that request.
// CSRF protection is provided by a short-lived signed `state` JWT generated
// in /connect and verified here.

const express = require('express');
const jwt = require('jsonwebtoken');

const { requireAuth } = require('../middleware/auth');
const xero = require('../services/xeroClient');

const router = express.Router();

// Returns the Xero consent URL as JSON (rather than redirecting directly)
// so the frontend — which authenticates via an Authorization header, not a
// cookie — can fetch this with axios and then navigate the browser itself
// via window.location.href.
router.get('/connect', requireAuth, (req, res) => {
  if (!process.env.XERO_CLIENT_ID || !process.env.XERO_CLIENT_SECRET || !process.env.XERO_REDIRECT_URI) {
    return res.status(500).json({ error: 'Xero is not configured on the server (missing XERO_CLIENT_ID / XERO_CLIENT_SECRET / XERO_REDIRECT_URI)' });
  }

  const state = jwt.sign({ purpose: 'xero-oauth' }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const url = xero.buildAuthorizeUrl(state);
  return res.json({ url });
});

router.get('/callback', async (req, res) => {
  const { code, state, error: xeroError } = req.query;

  if (xeroError) {
    return res.status(400).send(`Xero authorization was not completed: ${xeroError}`);
  }
  if (!code || !state) {
    return res.status(400).send('Missing code or state from Xero.');
  }

  try {
    jwt.verify(state, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(400).send('Invalid or expired state parameter. Please try connecting again.');
  }

  try {
    const tokenData = await xero.exchangeCodeForToken(code);
    const { tenantId, tenantName } = await xero.saveInitialTokens(tokenData);

    return res.send(`
      <html>
        <body style="font-family: sans-serif; padding: 2rem;">
          <h2>Xero connected successfully</h2>
          <p>Connected organisation: <strong>${tenantName || 'Unknown'}</strong> (${tenantId || 'no tenant id'})</p>
          <p>You can close this tab and return to the dashboard.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Xero callback error:`, err.message);
    return res.status(500).send(`Failed to complete Xero connection: ${err.message}`);
  }
});

router.get('/status', requireAuth, async (req, res) => {
  try {
    const stored = await xero.getStoredTokens();
    if (!stored) {
      return res.json({ connected: false });
    }
    return res.json({
      connected: true,
      tenantName: stored.tenant_name,
      tenantId: stored.tenant_id,
      lastUpdated: stored.updated_at,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
