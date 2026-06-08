// Pandora Reference endpoints — manages a standalone reference copy of
// Pandora's "build to level" / discontinued master list.
//
// IMPORTANT: this data lives in its own database (`pandora_reference`,
// see db/pandoraPool.js) and has NO relationship to burrows_jewellers.
// It exists purely so staff can compare Pandora's own stocking targets
// (and discontinued status) against our actual inventory — matched up
// later by Design Number. The app fully owns this database (read/write).
//
// The source of truth is a CSV that Pandora periodically supplies
// (columns: Design#, Department, Description, Minimum Quantity, Status —
// where "Minimum Quantity" is the build-to-level and a "Discontinued"
// Status flags a design as discontinued). Re-importing a refreshed CSV
// upserts rows: new design numbers are inserted, changed ones are
// updated, and unchanged ones are left untouched.

const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const pool = require('../db/pandoraPool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB — generous for a ~4k row CSV
});

// Pull a value out of a CSV row regardless of minor header differences
// (e.g. "Design#" vs "Design #", trailing spaces, BOM on the first column).
function pickColumn(row, ...names) {
  for (const key of Object.keys(row)) {
    const normalized = key.replace(/^﻿/, '').trim().toLowerCase();
    if (names.some((n) => n.toLowerCase() === normalized)) {
      return row[key];
    }
  }
  return undefined;
}

function normalizeRow(row) {
  const designNum = (pickColumn(row, 'Design#', 'Design #', 'DesignNum') || '').trim();
  const department = (pickColumn(row, 'Department') || '').trim() || null;
  const description = (pickColumn(row, 'Description') || '').replace(/\s+/g, ' ').trim() || null;

  const rawQty = (pickColumn(row, 'Minimum Quantity', 'Build To Level', 'BuildToLevel') || '').trim();
  const buildToLevel = Number.isFinite(parseInt(rawQty, 10)) ? parseInt(rawQty, 10) : 0;

  const rawStatus = (pickColumn(row, 'Status') || '').trim().toLowerCase();
  const status = rawStatus === 'discontinued' ? 'discontinued' : 'active';

  return { designNum, department, description, buildToLevel, status };
}

const UPSERT_SQL = `
  INSERT INTO pandora_items (design_num, department, description, build_to_level, status, imported_at, updated_at)
  VALUES ($1, $2, $3, $4, $5, now(), now())
  ON CONFLICT (design_num) DO UPDATE
  SET department      = EXCLUDED.department,
      description     = EXCLUDED.description,
      build_to_level  = EXCLUDED.build_to_level,
      status          = EXCLUDED.status,
      updated_at      = now()
  WHERE pandora_items.department     IS DISTINCT FROM EXCLUDED.department
     OR pandora_items.description    IS DISTINCT FROM EXCLUDED.description
     OR pandora_items.build_to_level IS DISTINCT FROM EXCLUDED.build_to_level
     OR pandora_items.status         IS DISTINCT FROM EXCLUDED.status
  RETURNING (xmax = 0) AS inserted;
`;

// POST /api/pandora/import
// Accepts a CSV file (multipart/form-data, field name "file"), parses it,
// and upserts every row into pandora_items. Returns a summary of what
// changed plus a record of the import in pandora_imports.
router.post('/import', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded — expected a CSV under field "file".' });
  }

  let records;
  try {
    records = parse(req.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (err) {
    return res.status(400).json({ error: `Could not parse CSV: ${err.message}` });
  }

  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  try {
    await client.query('BEGIN');

    for (const raw of records) {
      const row = normalizeRow(raw);
      if (!row.designNum) {
        skipped += 1;
        continue;
      }

      const result = await client.query(UPSERT_SQL, [
        row.designNum,
        row.department,
        row.description,
        row.buildToLevel,
        row.status,
      ]);

      if (result.rowCount === 0) {
        unchanged += 1;
      } else if (result.rows[0].inserted) {
        inserted += 1;
      } else {
        updated += 1;
      }
    }

    const importRecord = await client.query(
      `INSERT INTO pandora_imports (filename, rows_total, rows_inserted, rows_updated, rows_unchanged)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, filename, rows_total AS "rowsTotal", rows_inserted AS "rowsInserted",
                 rows_updated AS "rowsUpdated", rows_unchanged AS "rowsUnchanged",
                 imported_at AS "importedAt"`,
      [req.file.originalname, records.length, inserted, updated, unchanged]
    );

    await client.query('COMMIT');

    res.json({
      import: importRecord.rows[0],
      skipped,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/pandora/imports?limit=10
// Recent import history (so staff can see when the list was last refreshed).
router.get('/imports', requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

  try {
    const result = await pool.query(
      `SELECT id, filename, rows_total AS "rowsTotal", rows_inserted AS "rowsInserted",
              rows_updated AS "rowsUpdated", rows_unchanged AS "rowsUnchanged",
              imported_at AS "importedAt"
       FROM pandora_imports
       ORDER BY imported_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ imports: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pandora/summary
// Quick counts for an overview card: total items, discontinued count,
// and a breakdown by department.
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const [totals, departments, lastImport] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int                                            AS "totalItems",
               COUNT(*) FILTER (WHERE status = 'discontinued')::int     AS "discontinuedCount",
               COUNT(*) FILTER (WHERE status = 'active')::int           AS "activeCount",
               COALESCE(SUM(build_to_level), 0)::int                    AS "totalBuildToLevel"
        FROM pandora_items
      `),
      pool.query(`
        SELECT COALESCE(department, 'Uncategorised') AS department,
               COUNT(*)::int                          AS "itemCount"
        FROM pandora_items
        GROUP BY department
        ORDER BY "itemCount" DESC
      `),
      pool.query(`
        SELECT imported_at AS "importedAt", filename
        FROM pandora_imports
        ORDER BY imported_at DESC
        LIMIT 1
      `),
    ]);

    res.json({
      ...totals.rows[0],
      departments: departments.rows,
      lastImport: lastImport.rows[0] || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pandora/items?search=&department=&status=&page=1&pageSize=25
// Paginated, filterable browse of the master list.
router.get('/items', requireAuth, async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 25, 1), 200);
  const offset = (page - 1) * pageSize;

  const conditions = [];
  const params = [];

  if (req.query.search) {
    params.push(`%${req.query.search.trim()}%`);
    conditions.push(`(design_num ILIKE $${params.length} OR description ILIKE $${params.length})`);
  }
  if (req.query.department) {
    params.push(req.query.department);
    conditions.push(`department = $${params.length}`);
  }
  if (req.query.status) {
    params.push(req.query.status);
    conditions.push(`status = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS "total" FROM pandora_items ${whereClause}`,
      params
    );

    params.push(pageSize, offset);
    const itemsResult = await pool.query(
      `SELECT design_num AS "designNum", department, description,
              build_to_level AS "buildToLevel", status,
              imported_at AS "importedAt", updated_at AS "updatedAt"
       FROM pandora_items
       ${whereClause}
       ORDER BY design_num
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      items: itemsResult.rows,
      page,
      pageSize,
      total: countResult.rows[0].total,
      totalPages: Math.max(Math.ceil(countResult.rows[0].total / pageSize), 1),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
