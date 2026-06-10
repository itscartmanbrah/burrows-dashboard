// Xero API client — handles the OAuth2 "Authorization Code" flow (Web app
// type) used by the OpenClaw Xero app.
//
// Flow:
//   1. Admin visits GET /api/xero/connect (while logged in) and is redirected
//      to Xero's consent screen.
//   2. Xero redirects back to GET /api/xero/callback with a one-time `code`.
//   3. We exchange the code for an access_token + refresh_token and store
//      the refresh_token (+ tenant id) in the xero_tokens table.
//   4. For all subsequent API calls, getValidAccessToken() exchanges the
//      stored refresh_token for a fresh access_token (refresh tokens rotate
//      on every use — Xero returns a new refresh_token each time, which we
//      persist).
//
// Tokens are stored in the burrows_jewellers DB (app-owned table), never in
// git. Only one Xero connection is supported (single tenant: Burrows
// Jewellers).

const pool = require('../db/pool');

const XERO_AUTHORIZE_URL = 'https://login.xero.com/identity/connect/authorize';
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';
const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0';

// NOTE: accounting.transactions.read, accounting.reports.read and
// accounting.journals.read are NOT enabled for the OpenClaw Xero app
// (requesting them returns invalid_scope) — only the scopes below are
// currently usable. If invoice-level / aged-receivables report data is
// needed later, those scopes must be enabled for the app in the Xero
// Developer Portal (Configuration > Scopes) before adding them here.
const DEFAULT_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'accounting.contacts.read',
  'accounting.settings.read',
];

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS xero_tokens (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT,
      tenant_name TEXT,
      access_token TEXT,
      refresh_token TEXT NOT NULL,
      expires_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

function buildAuthorizeUrl(state) {
  const clientId = process.env.XERO_CLIENT_ID;
  const redirectUri = process.env.XERO_REDIRECT_URI;
  const scope = (process.env.XERO_SCOPES || DEFAULT_SCOPES.join(' '));

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state,
  });

  return `${XERO_AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const redirectUri = process.env.XERO_REDIRECT_URI;

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const resp = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Xero token exchange failed: ${resp.status} ${JSON.stringify(data)}`);
  }
  return data; // { access_token, refresh_token, expires_in, ... }
}

async function refreshAccessToken(refreshToken) {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const resp = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Xero token refresh failed: ${resp.status} ${JSON.stringify(data)}`);
  }
  return data; // { access_token, refresh_token, expires_in, ... }
}

async function getConnections(accessToken) {
  const resp = await fetch(XERO_CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Xero /connections failed: ${resp.status} ${JSON.stringify(data)}`);
  }
  return data; // [{ tenantId, tenantName, ... }, ...]
}

// Save tokens after the initial authorization-code exchange.
// Replaces any existing row (single-tenant setup).
async function saveInitialTokens(tokenData) {
  await ensureTable();

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

  // Look up tenant info using the fresh access token.
  let tenantId = null;
  let tenantName = null;
  try {
    const connections = await getConnections(tokenData.access_token);
    if (connections.length > 0) {
      tenantId = connections[0].tenantId;
      tenantName = connections[0].tenantName;
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Could not fetch Xero connections:`, err.message);
  }

  await pool.query('DELETE FROM xero_tokens');
  await pool.query(
    `INSERT INTO xero_tokens (tenant_id, tenant_name, access_token, refresh_token, expires_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())`,
    [tenantId, tenantName, tokenData.access_token, tokenData.refresh_token, expiresAt]
  );

  return { tenantId, tenantName };
}

async function getStoredTokens() {
  await ensureTable();
  const result = await pool.query('SELECT * FROM xero_tokens ORDER BY id DESC LIMIT 1');
  return result.rows[0] || null;
}

// Returns a valid access token + tenantId, refreshing if needed.
// Refresh tokens rotate on every use, so we persist the new one each time.
async function getValidAccessToken() {
  const stored = await getStoredTokens();
  if (!stored) {
    throw new Error('Xero is not connected yet. Visit /api/xero/connect to authorize.');
  }

  const now = Date.now();
  const expiresAt = stored.expires_at ? new Date(stored.expires_at).getTime() : 0;
  const stillValid = stored.access_token && expiresAt - now > 60 * 1000; // 60s buffer

  if (stillValid) {
    return { accessToken: stored.access_token, tenantId: stored.tenant_id };
  }

  const refreshed = await refreshAccessToken(stored.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

  await pool.query(
    `UPDATE xero_tokens
       SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = now()
     WHERE id = $4`,
    [refreshed.access_token, refreshed.refresh_token, newExpiresAt, stored.id]
  );

  return { accessToken: refreshed.access_token, tenantId: stored.tenant_id };
}

// Helper for calling the Accounting API.
async function xeroApiGet(path, params = {}) {
  const { accessToken, tenantId } = await getValidAccessToken();
  const url = new URL(`${XERO_API_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  });

  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Xero-tenant-id': tenantId,
      Accept: 'application/json',
    },
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Xero API ${path} failed: ${resp.status} ${JSON.stringify(data)}`);
  }
  return data;
}

module.exports = {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  saveInitialTokens,
  getStoredTokens,
  getValidAccessToken,
  xeroApiGet,
  ensureTable,
};
