// Temporary "overview" route used to validate the full pipeline end-to-end:
// React → Express (authenticated) → PostgreSQL (burrows_jewellers) → back to UI.
// This will be replaced/expanded by the real Store Performance Dashboard
// endpoints in Phase 1.

const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*)::int AS item_count FROM Items');
    res.json({
      message: `Hello ${req.user.username} — connected to burrows_jewellers successfully.`,
      itemCount: result.rows[0].item_count,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
