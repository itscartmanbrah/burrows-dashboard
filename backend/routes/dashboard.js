// Store Performance Dashboard endpoints — homepage widgets.
// All queries are READ-ONLY against the synced mirror tables in
// burrows_jewellers (populated daily by burrows-db-sync).

const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const SALES_TARGETS = require('../config/salesTargets');

const router = express.Router();

// ─── "Sales Pace vs Target" widget config ──────────────────────────────────
// saledate is stored as a naive local timestamp (the store's wall-clock
// time), so "today" / "now" must be anchored to the stores' own timezone —
// not the DB session's timezone — to avoid the day boundary drifting.
const STORE_TZ = 'Australia/Melbourne';
const TRADING_OPEN_HOUR = 9;   // 9:00am
const TRADING_CLOSE_HOUR = 17; // 5:00pm

function daysInMonth(year, monthIndex /* 0-11 */) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

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

// GET /api/dashboard/sales-pace
// Compares each target store's actual cumulative sales today against a
// "pace" line — that month's $ target spread evenly across the day's
// trading hours (9am–5pm). Lets staff see at a glance whether today is
// tracking ahead of or behind where it needs to be to hit the monthly goal.
//
// Daily target = monthly target ÷ number of days in the month (a simple
// even split — EdgePulse's own dashboard may weight it slightly differently
// e.g. by trading days or day-of-week patterns, so treat this as a guide
// rather than an exact mirror of their figure).
//
// Only stores with a configured target (see config/salesTargets.js) appear.
router.get('/sales-pace', requireAuth, async (req, res) => {
  try {
    // Resolve "today"/"now" in the stores' own local timezone.
    const nowResult = await pool.query('SELECT (now() AT TIME ZONE $1) AS local_now', [STORE_TZ]);
    const localNow = new Date(nowResult.rows[0].local_now);
    const year = localNow.getFullYear();
    const month = localNow.getMonth(); // 0-11
    const dateStr = localNow.toISOString().slice(0, 10);
    const currentHour = localNow.getHours() + localNow.getMinutes() / 60;

    const targetsForYear = SALES_TARGETS[year] || {};
    const storeIds = Object.keys(targetsForYear).map(Number);

    if (storeIds.length === 0) {
      return res.json({
        date: dateStr,
        tradingHours: { open: TRADING_OPEN_HOUR, close: TRADING_CLOSE_HOUR },
        currentHour,
        stores: [],
        chartData: [],
        note: `No sales targets configured for ${year} — add an entry to backend/config/salesTargets.js.`,
      });
    }

    // Hourly TENDER totals for the target stores, today only.
    const actualResult = await pool.query(
      `
      WITH bounds AS (
        SELECT date_trunc('day', now() AT TIME ZONE $1) AS day_start
      )
      SELECT s.storeid                                              AS "storeId",
             EXTRACT(HOUR FROM s.saledate)::int                     AS hour,
             COALESCE(SUM(
               CASE WHEN sl.slkey1 = 'TENDER'
                    THEN sl.unitsellprice * sl.quantity
                    ELSE 0 END
             ), 0)                                                  AS "hourTotal"
      FROM EP_Sales s
      JOIN bounds b
        ON s.saledate >= b.day_start
       AND s.saledate <  b.day_start + INTERVAL '1 day'
      JOIN EP_SaleLines sl
        ON sl.storeid = s.storeid
       AND sl.saleid  = s.saleid
      WHERE s.storeid = ANY($2::int[])
        AND s.voided = false
      GROUP BY s.storeid, hour
      ORDER BY s.storeid, hour;
      `,
      [STORE_TZ, storeIds]
    );

    const storesResult = await pool.query(
      `SELECT storeid AS "storeId", shortname AS "storeName", longname AS "storeLongName"
       FROM Stores WHERE storeid = ANY($1::int[]) ORDER BY storeid`,
      [storeIds]
    );

    const hourlyByStore = {};
    for (const id of storeIds) hourlyByStore[id] = {};
    for (const row of actualResult.rows) {
      hourlyByStore[row.storeId][row.hour] = Number(row.hourTotal);
    }

    // Per-store target + cumulative-actual-by-hour
    const stores = storesResult.rows.map((store) => {
      const target = targetsForYear[store.storeId];
      const monthlyTarget = target.monthly[month];
      const dailyTarget = monthlyTarget / daysInMonth(year, month);

      const cumulativeByHour = {};
      let running = 0;
      for (let h = TRADING_OPEN_HOUR; h <= TRADING_CLOSE_HOUR; h++) {
        running += hourlyByStore[store.storeId][h] || 0;
        cumulativeByHour[h] = running;
      }

      const lastElapsedHour = Math.min(Math.floor(currentHour), TRADING_CLOSE_HOUR);
      const actualSoFar = lastElapsedHour >= TRADING_OPEN_HOUR ? cumulativeByHour[lastElapsedHour] : 0;

      return { ...store, monthlyTarget, dailyTarget, actualSoFar, cumulativeByHour };
    });

    // One row per trading hour: each store's cumulative actual (null once
    // past "now", so the line stops where today currently stands) and its
    // straight-line target pace from $0 at opening to dailyTarget at close.
    const chartData = [];
    for (let h = TRADING_OPEN_HOUR; h <= TRADING_CLOSE_HOUR; h++) {
      const row = { hour: h };
      for (const store of stores) {
        const key = `store${store.storeId}`;
        const paceFraction = (h - TRADING_OPEN_HOUR) / (TRADING_CLOSE_HOUR - TRADING_OPEN_HOUR);
        row[`${key}_target`] = Number((store.dailyTarget * paceFraction).toFixed(2));
        row[`${key}_actual`] = h <= currentHour ? Number(store.cumulativeByHour[h].toFixed(2)) : null;
      }
      chartData.push(row);
    }

    res.json({
      date: dateStr,
      tradingHours: { open: TRADING_OPEN_HOUR, close: TRADING_CLOSE_HOUR },
      currentHour,
      stores: stores.map(({ cumulativeByHour, ...rest }) => rest),
      chartData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
