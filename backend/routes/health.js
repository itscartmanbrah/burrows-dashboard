// Simple health-check route — confirms the API is running and can reach
// the database. Useful for verifying deployment and for uptime checks.

const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS db_time');
    res.json({
      status: 'ok',
      apiTime: new Date().toISOString(),
      dbTime: result.rows[0].db_time,
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
