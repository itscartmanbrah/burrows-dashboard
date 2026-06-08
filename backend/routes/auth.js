// Authentication routes — single-admin login for Phase 0.
// Credentials are configured via environment variables:
//   ADMIN_USERNAME       — plain username
//   ADMIN_PASSWORD_HASH  — bcrypt hash of the admin password
//
// On success, issues a signed JWT the frontend stores and sends back as
// "Authorization: Bearer <token>" on subsequent requests.

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;

  if (!expectedUsername || !expectedHash) {
    return res.status(500).json({ error: 'Admin credentials are not configured on the server' });
  }

  if (username !== expectedUsername) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const passwordMatches = await bcrypt.compare(password, expectedHash);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign(
    { username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
  );

  return res.json({ token, username });
});

module.exports = router;
