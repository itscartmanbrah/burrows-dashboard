// Store Performance Dashboard endpoints — homepage widgets.
// All queries are READ-ONLY against the synced mirror tables in
// burrows_jewellers (populated daily by burrows-db-sync).

const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard/today-sales
// Today's sales totals per store, based on TENDER lines (matches what staff
// see reflected in EdgePulse — i.e. amounts actually collected/tendered,
// not raw invoiced line totals). Includes every store, even ones with $0
// today or ones that don't sync through EdgePulse.
router.get('/today-sales', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT st.storeid                                            AS "storeId",
             st.shortname                                          AS "storeName",
             st.longname                                           AS "storeLongName",
             COUNT(DISTINCT s.saleid)                              AS "transactions",
             COALESCE(SUM(
               CASE WHEN sl.slkey1 = 'TENDER'
                    THEN sl.unitsellprice * sl.quantity
                    ELSE 0 END
             ), 0)                                                 AS "totalSales"
      FROM Stores st
      LEFT JOIN EP_Sales s
             ON s.storeid = st.storeid
            AND s.saledate >= CURRENT_DATE
            AND s.saledate <  CURRENT_DATE + INTERVAL '1 day'
            AND s.voided = false
      LEFT JOIN EP_SaleLines sl
             ON sl.storeid = s.storeid
            AND sl.saleid  = s.saleid
      GROUP BY st.storeid, st.shortname, st.longname
      ORDER BY st.storeid;
    `);

    const rows = result.rows.map((r) => ({
      ...r,
      transactions: Number(r.transactions),
      totalSales: Number(r.totalSales),
    }));

    res.json({
      date: new Date().toISOString().slice(0, 10),
      stores: rows,
      grandTotal: rows.reduce((sum, r) => sum + r.totalSales, 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/top-suppliers
// Total inventory cost value (Cost x on-hand quantity, summed across all
// stores) grouped by vendor — "which supplier do we have the most money
// tied up in stock with". Returns the top N (default 8).
router.get('/top-suppliers', requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 8, 50);

  try {
    const result = await pool.query(
      `
      SELECT v.vendorid                                   AS "vendorId",
             v.name                                       AS "vendorName",
             ROUND(SUM(i.cost * COALESCE(q.availqoh, 0)), 2) AS "totalCostValue",
             SUM(COALESCE(q.availqoh, 0))::int            AS "totalQty"
      FROM Items i
      JOIN Vendors v ON i.vendorid = v.vendorid
      LEFT JOIN ItemQOH q ON i.sku = q.sku
      GROUP BY v.vendorid, v.name
      HAVING SUM(i.cost * COALESCE(q.availqoh, 0)) > 0
      ORDER BY "totalCostValue" DESC
      LIMIT $1;
      `,
      [limit]
    );

    const rows = result.rows.map((r) => ({
      ...r,
      totalCostValue: Number(r.totalCostValue),
      totalQty: Number(r.totalQty),
    }));

    res.json({ suppliers: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
