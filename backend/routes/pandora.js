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
// Status flags a design as discontinued). The master list is a living
// document — staff "update" it (via the small Update-list control on the
// page) whenever Pandora releases new designs or changes levels/status,
// they don't re-import it from scratch. Upserting by Design Number means
// new rows are inserted, changed ones updated, and unchanged ones left
// untouched, so refreshing the list is always safe to run.
//
// The other half of this file is the Reorder comparison (see
// getReorderComparison below): it matches the master list's build-to-levels
// against our actual on-hand stock from burrows_jewellers — entirely in
// application code, never via a SQL join — to answer "what should we order
// today," with a one-click CSV export in supplier order-sheet format.

const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const pool = require('../db/pandoraPool');
// Separate pool for burrows_jewellers — used ONLY to read actual on-hand
// quantities/costs for comparison against the Pandora reference list.
// This is a read-only lookup in application code, never a SQL join across
// the two databases (see the standalone-DB note at the top of this file).
const burrowsPool = require('../db/pool');
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

// Escape a value for inclusion in a CSV cell (quotes when it contains a
// comma, quote, or newline; doubles any embedded quotes).
function csvField(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Compares the active master list (where a build-to-level is set) against
// our actual on-hand stock — matched by Design Number — and returns every
// design that's currently short of its build-to-level, with the quantity
// that should be ordered to bring it back up to level.
//
// IMPORTANT: this match happens here, in application code, by looking up
// Design Numbers across two independent query results. It is NOT a SQL
// join — pandora_reference and burrows_jewellers remain fully separate
// databases with no cross-database relationships (per the standalone-DB
// design — see the file header and HOWTO.md §9).
//
// Matching key: pandora_items.design_num <-> Items.realdesignnum
// (confirmed against live data — Items.designnum lacks the dash Pandora
// uses, e.g. "549588C002" vs "549588C00-2", but realdesignnum matches
// the master list's Design# format exactly).
async function getReorderComparison({ department } = {}) {
  const params = ['active'];
  let where = 'WHERE status = $1 AND build_to_level > 0';
  if (department) {
    params.push(department);
    where += ` AND department = $${params.length}`;
  }

  const masterList = await pool.query(
    `SELECT design_num AS "designNum", department, description, build_to_level AS "buildToLevel"
     FROM pandora_items
     ${where}
     ORDER BY department, design_num`,
    params
  );

  if (masterList.rows.length === 0) return [];

  const designNums = masterList.rows.map((r) => r.designNum);
  const inventory = await burrowsPool.query(
    `SELECT realdesignnum                    AS "designNum",
            SUM(totalavailqoh)::numeric      AS "onHand",
            ROUND(AVG(cost), 2)              AS "cost"
     FROM Items
     WHERE vendorid = 'PANDO' AND realdesignnum = ANY($1::text[])
     GROUP BY realdesignnum`,
    [designNums]
  );
  const stockByDesign = new Map(inventory.rows.map((r) => [r.designNum, r]));

  return masterList.rows
    .map((item) => {
      const stock = stockByDesign.get(item.designNum);
      const onHand = stock ? Number(stock.onHand) : 0;
      const cost = stock && stock.cost !== null ? Number(stock.cost) : null;
      const reorderQty = Math.max(item.buildToLevel - onHand, 0);
      return { ...item, onHand, cost, reorderQty };
    })
    .filter((item) => item.reorderQty > 0);
}

// GET /api/pandora/reorder?department=&page=1&pageSize=25
// Paginated "what to order today" comparison — active designs currently
// below their Pandora build-to-level, with the quantity needed to top up.
router.get('/reorder', requireAuth, async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 25, 1), 200);

  try {
    const items = await getReorderComparison({ department: req.query.department || null });
    const total = items.length;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const offset = (page - 1) * pageSize;

    res.json({
      items: items.slice(offset, offset + pageSize),
      page,
      pageSize,
      total,
      totalPages,
      totalReorderQty: items.reduce((sum, item) => sum + item.reorderQty, 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pandora/reorder/export?department=
// Generates a supplier-ready order CSV (Item, Description, Quantity, Cost)
// for every design currently due for reorder — honouring the same
// department filter as the on-screen list, but covering ALL matching rows
// (not just the current page).
router.get('/reorder/export', requireAuth, async (req, res) => {
  try {
    const items = await getReorderComparison({ department: req.query.department || null });

    const lines = [
      ['Item', 'Description', 'Quantity', 'Cost'].join(','),
      ...items.map((item) =>
        [
          csvField(item.designNum),
          csvField(item.description),
          item.reorderQty,
          item.cost !== null ? item.cost.toFixed(2) : '',
        ].join(',')
      ),
    ];

    const filename = `pandora-reorder-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(lines.join('\r\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
