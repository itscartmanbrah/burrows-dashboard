// Store Performance Dashboard endpoints — homepage widgets.
// All queries are READ-ONLY against the synced mirror tables in
// burrows_jewellers (populated daily by burrows-db-sync).

const express = require('express');
const pool = require('../db/pool');
const pandoraPool = require('../db/pandoraPool');
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

// Stores to leave out of per-store filter dropdowns across dashboard widgets
// (MSJ and the Warehouse aren't relevant for these comparisons — per
// instruction, don't add them back into store-selector widgets going forward).
const STORE_FILTER_EXCLUDE_IDS = [2, 4]; // 2 = Mildura Showcase Jewellers, 4 = Warehouse

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

// GET /api/dashboard/sales-pace?date=YYYY-MM-DD
// Compares each target store's actual cumulative sales on a given day
// against a "pace" line — that month's $ target spread evenly across the
// day's trading hours (9am–5pm). Lets staff see at a glance whether a day
// is tracking ahead of or behind where it needs to be to hit the monthly
// goal. Defaults to today; pass ?date= to look at any other day (e.g. to
// review yesterday's performance, or compare against the same day last week).
//
// Daily target = monthly target ÷ number of days in the month (a simple
// even split — EdgePulse's own dashboard may weight it slightly differently
// e.g. by trading days or day-of-week patterns, so treat this as a guide
// rather than an exact mirror of their figure).
//
// Only stores with a configured target for that year (see
// config/salesTargets.js) appear.
router.get('/sales-pace', requireAuth, async (req, res) => {
  try {
    // "Today" in the stores' own local timezone — used both as the default
    // date and to work out whether the requested date is today, in the
    // past, or in the future (which determines how far the actual line draws).
    const nowResult = await pool.query('SELECT (now() AT TIME ZONE $1) AS local_now', [STORE_TZ]);
    const localNow = new Date(nowResult.rows[0].local_now);
    const todayStr = localNow.toISOString().slice(0, 10);

    const dateStr = typeof req.query.date === 'string' && req.query.date ? req.query.date : todayStr;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: 'Invalid "date" — expected format YYYY-MM-DD' });
    }
    const selectedDate = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(selectedDate.getTime())) {
      return res.status(400).json({ error: 'Invalid "date" — not a real calendar date' });
    }

    const isToday = dateStr === todayStr;
    const isFuture = dateStr > todayStr;
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth(); // 0-11

    // How far the "actual" line should be drawn for the selected date:
    //   • today        → up to the real current time
    //   • a past date  → the whole trading day already happened
    //   • a future date → nothing has happened yet
    let currentHour;
    if (isToday) currentHour = localNow.getHours() + localNow.getMinutes() / 60;
    else if (isFuture) currentHour = TRADING_OPEN_HOUR;
    else currentHour = TRADING_CLOSE_HOUR;

    const targetsForYear = SALES_TARGETS[year] || {};
    const storeIds = Object.keys(targetsForYear).map(Number);

    if (storeIds.length === 0) {
      return res.json({
        date: dateStr,
        isToday,
        tradingHours: { open: TRADING_OPEN_HOUR, close: TRADING_CLOSE_HOUR },
        currentHour,
        stores: [],
        chartData: [],
        note: `No sales targets configured for ${year} — add an entry to backend/config/salesTargets.js.`,
      });
    }

    // Hourly TENDER totals for the target stores on the selected date.
    // saledate is a naive "local wall-clock time" timestamp — same
    // convention as the YYYY-MM-DD date string — so a direct date-literal
    // comparison is correct with no timezone conversion needed here.
    const actualResult = await pool.query(
      `
      SELECT s.storeid                                              AS "storeId",
             EXTRACT(HOUR FROM s.saledate)::int                     AS hour,
             COALESCE(SUM(
               CASE WHEN sl.slkey1 = 'TENDER'
                    THEN sl.unitsellprice * sl.quantity
                    ELSE 0 END
             ), 0)                                                  AS "hourTotal"
      FROM EP_Sales s
      JOIN EP_SaleLines sl
        ON sl.storeid = s.storeid
       AND sl.saleid  = s.saleid
      WHERE s.storeid = ANY($1::int[])
        AND s.voided = false
        AND s.saledate >= $2::date
        AND s.saledate <  $2::date + INTERVAL '1 day'
      GROUP BY s.storeid, hour
      ORDER BY s.storeid, hour;
      `,
      [storeIds, dateStr]
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
    // past the "elapsed" point for this date, so the line stops where that
    // day currently stands) and its straight-line target pace from $0 at
    // opening to dailyTarget at close.
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
      isToday,
      tradingHours: { open: TRADING_OPEN_HOUR, close: TRADING_CLOSE_HOUR },
      currentHour,
      stores: stores.map(({ cumulativeByHour, ...rest }) => rest),
      chartData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/sales-trend?store=<storeId>
// A month-to-date cumulative sales trend for a single store — modelled on
// EdgePulse's own "N days" trend chart, which plots actual cumulative sales
// against several reference lines on the same calendar axis:
//   • Goal             — the monthly $ target spread evenly across the
//                        days in the month (a flat straight-line pace)
//   • Goal (day-adj)   — the same monthly target, but distributed according
//                        to the store's typical day-of-week sales pattern
//                        (derived from its last 6 months of actuals) — e.g.
//                        weekends usually outsell weekdays, so the "expected"
//                        cumulative curve isn't a straight line in reality
//   • Last year        — actual cumulative sales for the same calendar days
//                        of the same month, one year ago (a real comparison)
//   • Projected        — where this month is on track to land, extrapolated
//                        forward from the average daily rate achieved so far
//
// Always shows the current month, from day 1 up to today, in the stores'
// own timezone. Only stores with a configured target (see
// config/salesTargets.js) are selectable.
router.get('/sales-trend', requireAuth, async (req, res) => {
  try {
    const nowResult = await pool.query('SELECT (now() AT TIME ZONE $1) AS local_now', [STORE_TZ]);
    const localNow = new Date(nowResult.rows[0].local_now);
    const year = localNow.getFullYear();
    const month = localNow.getMonth(); // 0-11
    const today = localNow.getDate(); // 1-31

    const targetsForYear = SALES_TARGETS[year] || {};
    const storeIds = Object.keys(targetsForYear).map(Number);

    if (storeIds.length === 0) {
      return res.json({
        availableStores: [],
        note: `No sales targets configured for ${year} — add an entry to backend/config/salesTargets.js.`,
      });
    }

    const storesResult = await pool.query(
      `SELECT storeid AS "storeId", shortname AS "storeName", longname AS "storeLongName"
       FROM Stores WHERE storeid = ANY($1::int[]) ORDER BY storeid`,
      [storeIds]
    );
    const availableStores = storesResult.rows;

    // ?store=<id> shows a single store; ?store=all (or anything else,
    // including a missing param) shows every configured store combined —
    // that's the most useful overview, so it's the default.
    const requestedStoreId = parseInt(req.query.store, 10);
    const singleStoreId = storeIds.includes(requestedStoreId) ? requestedStoreId : null;
    const filterStoreIds = singleStoreId != null ? [singleStoreId] : storeIds;

    const store = singleStoreId != null
      ? availableStores.find((s) => s.storeId === singleStoreId)
      : {
          storeId: 'all',
          storeName: 'All Stores',
          storeLongName: `All stores combined (${availableStores.map((s) => s.storeName).join(' + ')})`,
        };

    const monthlyTarget = singleStoreId != null
      ? targetsForYear[singleStoreId].monthly[month]
      : storeIds.reduce((sum, id) => sum + targetsForYear[id].monthly[month], 0);
    const totalDays = daysInMonth(year, month);

    // Date bounds as plain YYYY-MM-DD strings — saledate is a naive local
    // timestamp using the same "wall clock" convention, so direct
    // date-literal comparisons are correct with no timezone conversion.
    const pad = (n) => String(n).padStart(2, '0');
    const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`; // m is 0-11

    const monthStartStr = ymd(year, month, 1);
    const nextMonth = new Date(year, month + 1, 1);
    const monthEndStr = ymd(nextMonth.getFullYear(), nextMonth.getMonth(), 1);

    const lastYearDays = daysInMonth(year - 1, month);
    const lastYearStartStr = ymd(year - 1, month, 1);
    const lastYearNextMonth = new Date(year - 1, month + 1, 1);
    const lastYearEndStr = ymd(lastYearNextMonth.getFullYear(), lastYearNextMonth.getMonth(), 1);

    // 6-month lookback window immediately preceding this month — used to
    // learn the store's typical day-of-week sales pattern. Deliberately
    // excludes the current (partial) month so it doesn't skew the pattern.
    const lookbackStart = new Date(year, month - 6, 1);
    const lookbackStartStr = ymd(lookbackStart.getFullYear(), lookbackStart.getMonth(), 1);

    const TENDER_SUM = `COALESCE(SUM(CASE WHEN sl.slkey1 = 'TENDER' THEN sl.unitsellprice * sl.quantity ELSE 0 END), 0)`;

    // filterStoreIds is either a single store's id or every configured
    // store's id — `storeid = ANY(...)` covers both the single-store and
    // "all stores combined" cases with the same query shape.
    const [actualResult, lastYearResult, dowResult] = await Promise.all([
      // Daily TENDER totals for this month-to-date.
      pool.query(
        `
        SELECT EXTRACT(DAY FROM s.saledate)::int AS day, ${TENDER_SUM} AS total
        FROM EP_Sales s
        JOIN EP_SaleLines sl ON sl.storeid = s.storeid AND sl.saleid = s.saleid
        WHERE s.storeid = ANY($1::int[]) AND s.voided = false
          AND s.saledate >= $2::date AND s.saledate < $3::date
        GROUP BY day
        `,
        [filterStoreIds, monthStartStr, monthEndStr]
      ),
      // Daily TENDER totals for the same month, one year ago.
      pool.query(
        `
        SELECT EXTRACT(DAY FROM s.saledate)::int AS day, ${TENDER_SUM} AS total
        FROM EP_Sales s
        JOIN EP_SaleLines sl ON sl.storeid = s.storeid AND sl.saleid = s.saleid
        WHERE s.storeid = ANY($1::int[]) AND s.voided = false
          AND s.saledate >= $2::date AND s.saledate < $3::date
        GROUP BY day
        `,
        [filterStoreIds, lastYearStartStr, lastYearEndStr]
      ),
      // Average $/day for each day-of-week (0=Sun..6=Sat) over the 6 months
      // prior to this one — the basis for the "day-adjusted" goal curve.
      pool.query(
        `
        SELECT EXTRACT(DOW FROM s.saledate)::int AS dow,
               ${TENDER_SUM} AS total,
               COUNT(DISTINCT date_trunc('day', s.saledate)) AS "dayCount"
        FROM EP_Sales s
        JOIN EP_SaleLines sl ON sl.storeid = s.storeid AND sl.saleid = s.saleid
        WHERE s.storeid = ANY($1::int[]) AND s.voided = false
          AND s.saledate >= $2::date AND s.saledate < $3::date
        GROUP BY dow
        `,
        [filterStoreIds, lookbackStartStr, monthStartStr]
      ),
    ]);

    const dailyActual = {};
    for (const row of actualResult.rows) dailyActual[row.day] = Number(row.total);
    const dailyLastYear = {};
    for (const row of lastYearResult.rows) dailyLastYear[row.day] = Number(row.total);

    // Average $/day per day-of-week, with a fallback to an even split (weight
    // 1 for every day) if there's not yet enough sales history to learn from.
    const dowAvg = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (const row of dowResult.rows) {
      const count = Number(row.dayCount);
      dowAvg[row.dow] = count > 0 ? Number(row.total) / count : 0;
    }
    const dowAvgSum = Object.values(dowAvg).reduce((a, b) => a + b, 0);

    const dayWeights = [];
    for (let d = 1; d <= totalDays; d++) {
      const dow = new Date(year, month, d).getDay();
      dayWeights.push(dowAvgSum > 0 ? dowAvg[dow] : 1);
    }
    const totalWeight = dayWeights.reduce((a, b) => a + b, 0);

    let runningActual = 0;
    let runningLastYear = 0;
    let runningWeight = 0;
    const chartData = [];
    for (let d = 1; d <= totalDays; d++) {
      runningActual += dailyActual[d] || 0;
      if (d <= lastYearDays) runningLastYear += dailyLastYear[d] || 0;
      runningWeight += dayWeights[d - 1];

      const goal = monthlyTarget * (d / totalDays);
      const goalDayAdj = totalWeight > 0 ? monthlyTarget * (runningWeight / totalWeight) : goal;

      chartData.push({
        day: d,
        actual: d <= today ? Number(runningActual.toFixed(2)) : null,
        goal: Number(goal.toFixed(2)),
        goalDayAdj: Number(goalDayAdj.toFixed(2)),
        lastYear: Number(runningLastYear.toFixed(2)),
        projected: null, // filled in below, from "today" onward
      });
    }

    // Project the rest of the month forward at the average daily rate
    // achieved so far (actualSoFar ÷ today × remaining days). Drawn only
    // from "today" onward — before that, the actual line covers it, and
    // starting it at "today" keeps the two lines visually joined.
    const actualSoFar = chartData[today - 1] ? chartData[today - 1].actual : 0;
    let projectedTotal = null;
    if (today > 0) {
      projectedTotal = Number((actualSoFar * (totalDays / today)).toFixed(2));
      for (let d = today; d <= totalDays; d++) {
        chartData[d - 1].projected = Number((actualSoFar * (d / today)).toFixed(2));
      }
    }

    const monthLabel = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(
      new Date(year, month, 1)
    );

    res.json({
      availableStores,
      store,
      year,
      month: month + 1, // 1-12, for display
      monthLabel,
      daysInMonth: totalDays,
      today,
      monthlyTarget,
      actualSoFar,
      projectedTotal,
      lastYear: {
        sameWindowTotal: chartData[Math.min(today, lastYearDays) - 1]
          ? chartData[Math.min(today, lastYearDays) - 1].lastYear
          : 0,
        monthTotal: Number(runningLastYear.toFixed(2)),
      },
      chartData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/supplier-performance?store=<storeId|all>&limit=N
// Ranks vendors/suppliers by total sales revenue generated from their items
// — "which supplier's products are selling best" — across three calendar
// windows at once: today, this month-to-date, and this year-to-date.
//
// Revenue is summed from item-level sale lines (unitsellprice × quantity),
// joined Items → Vendors via itemkey/sku. Both 'ItemSale' and 'ItemRefund'
// lines are included — refund lines carry negative quantities, so the sum
// nets returns out automatically. Quotes and voided sales are excluded.
//
// Filterable by store (or "all" for every store combined, the default) so
// staff can see which suppliers are driving sales at a particular location.
// Unlike the sales-pace/trend widgets, this isn't tied to SALES_TARGETS —
// every store in the Stores table is selectable.
router.get('/supplier-performance', requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 8, 50);

  try {
    const nowResult = await pool.query('SELECT (now() AT TIME ZONE $1) AS local_now', [STORE_TZ]);
    const localNow = new Date(nowResult.rows[0].local_now);
    const year = localNow.getFullYear();
    const month = localNow.getMonth(); // 0-11
    const day = localNow.getDate();

    // Date bounds as plain YYYY-MM-DD strings — saledate is a naive local
    // "wall clock" timestamp, so direct date-literal comparisons need no
    // timezone conversion (consistent with sales-pace / sales-trend).
    const pad = (n) => String(n).padStart(2, '0');
    const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

    const todayStr = ymd(year, month, day);
    const tomorrow = new Date(year, month, day + 1);
    const tomorrowStr = ymd(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
    const monthStartStr = ymd(year, month, 1);
    const yearStartStr = ymd(year, 0, 1);

    const storesResult = await pool.query(
      `SELECT storeid AS "storeId", shortname AS "storeName", longname AS "storeLongName"
       FROM Stores
       WHERE storeid <> ALL($1::int[])
       ORDER BY storeid`,
      [STORE_FILTER_EXCLUDE_IDS]
    );
    const availableStores = storesResult.rows;
    const allStoreIds = availableStores.map((s) => s.storeId);

    // ?store=<id> filters to that single store; ?store=all (or anything
    // else, including a missing param) combines every store — the most
    // useful overview, so it's the default.
    const requestedStoreId = parseInt(req.query.store, 10);
    const singleStoreId = allStoreIds.includes(requestedStoreId) ? requestedStoreId : null;
    const filterStoreIds = singleStoreId != null ? [singleStoreId] : allStoreIds;

    const store = singleStoreId != null
      ? availableStores.find((s) => s.storeId === singleStoreId)
      : {
          storeId: 'all',
          storeName: 'All Stores',
          storeLongName: `All stores combined (${availableStores.map((s) => s.storeName).join(' + ')})`,
        };

    // Single pass over the broadest window (year-to-date) with conditional
    // aggregation buckets each vendor's revenue into all three periods at
    // once — far cheaper than scanning EP_SaleLines three separate times.
    const result = await pool.query(
      `
      SELECT v.vendorid AS "vendorId",
             v.name     AS "vendorName",
             ROUND(SUM(CASE WHEN s.saledate >= $2::date THEN sl.unitsellprice * sl.quantity ELSE 0 END), 2) AS "dailyRevenue",
             SUM(CASE WHEN s.saledate >= $2::date THEN sl.quantity ELSE 0 END)                              AS "dailyQty",
             COUNT(DISTINCT CASE WHEN s.saledate >= $2::date THEN s.saleid END)                             AS "dailyTxns",
             ROUND(SUM(CASE WHEN s.saledate >= $3::date THEN sl.unitsellprice * sl.quantity ELSE 0 END), 2) AS "monthlyRevenue",
             SUM(CASE WHEN s.saledate >= $3::date THEN sl.quantity ELSE 0 END)                              AS "monthlyQty",
             COUNT(DISTINCT CASE WHEN s.saledate >= $3::date THEN s.saleid END)                             AS "monthlyTxns",
             ROUND(SUM(sl.unitsellprice * sl.quantity), 2)                                                  AS "yearlyRevenue",
             SUM(sl.quantity)                                                                               AS "yearlyQty",
             COUNT(DISTINCT s.saleid)                                                                       AS "yearlyTxns"
      FROM EP_Sales s
      JOIN EP_SaleLines sl ON sl.storeid = s.storeid AND sl.saleid = s.saleid
      JOIN Items i         ON i.sku = sl.itemkey
      JOIN Vendors v       ON v.vendorid = i.vendorid
      WHERE s.storeid = ANY($1::int[])
        AND s.voided = false
        AND sl.isquote = false
        AND sl.entrytype IN ('ItemSale', 'ItemRefund')
        AND s.saledate >= $4::date
        AND s.saledate <  $5::date
      GROUP BY v.vendorid, v.name;
      `,
      [filterStoreIds, todayStr, monthStartStr, yearStartStr, tomorrowStr]
    );

    const rows = result.rows.map((r) => ({
      vendorId: r.vendorId,
      vendorName: r.vendorName,
      dailyRevenue: Number(r.dailyRevenue),
      dailyQty: Number(r.dailyQty),
      dailyTxns: Number(r.dailyTxns),
      monthlyRevenue: Number(r.monthlyRevenue),
      monthlyQty: Number(r.monthlyQty),
      monthlyTxns: Number(r.monthlyTxns),
      yearlyRevenue: Number(r.yearlyRevenue),
      yearlyQty: Number(r.yearlyQty),
      yearlyTxns: Number(r.yearlyTxns),
    }));

    // Build a ranked top-N list per period — sorted by that period's revenue,
    // only including vendors who actually sold something in that window.
    const rank = (revenueKey, qtyKey, txnsKey) =>
      rows
        .filter((r) => r[revenueKey] > 0)
        .sort((a, b) => b[revenueKey] - a[revenueKey])
        .slice(0, limit)
        .map((r) => ({
          vendorId: r.vendorId,
          vendorName: r.vendorName,
          revenue: r[revenueKey],
          qty: r[qtyKey],
          transactions: r[txnsKey],
        }));

    const totalOf = (key) => Number(rows.reduce((sum, r) => sum + r[key], 0).toFixed(2));

    const dayLabel = new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }).format(localNow);
    const monthLabel = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(localNow);

    res.json({
      availableStores,
      store,
      generatedAt: { date: todayStr, year, month: month + 1, day },
      periods: {
        daily: {
          label: dayLabel,
          rangeStart: todayStr,
          suppliers: rank('dailyRevenue', 'dailyQty', 'dailyTxns'),
          totalRevenue: totalOf('dailyRevenue'),
        },
        monthly: {
          label: `${monthLabel} (month-to-date)`,
          rangeStart: monthStartStr,
          suppliers: rank('monthlyRevenue', 'monthlyQty', 'monthlyTxns'),
          totalRevenue: totalOf('monthlyRevenue'),
        },
        yearly: {
          label: `${year} (year-to-date)`,
          rangeStart: yearStartStr,
          suppliers: rank('yearlyRevenue', 'yearlyQty', 'yearlyTxns'),
          totalRevenue: totalOf('yearlyRevenue'),
        },
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/pandora-stock-cost
// Current on-hand cost value of Pandora stock, matched against the active
// designs in the Pandora reference master list (pandora_reference DB) by
// Design Number. Pulls all active reference designs, looks up real on-hand
// quantities and unit costs from burrows_jewellers Items (vendorid = 'PANDO',
// matched via realdesignnum), and returns a headline total plus a breakdown
// by Pandora department (Bracelets, Charms, etc.).
//
// Matching is done entirely in application code — the two databases are
// never joined via SQL. Matching key: pandora_items.design_num ↔
// Items.realdesignnum (NOT Items.designnum — it lacks the dash suffix).
// Stock cost per design = SUM(totalavailqoh) × AVG(cost) across all
// burrows_jewellers records for that design number.
router.get('/pandora-stock-cost', requireAuth, async (req, res) => {
  try {
    // 1. Pull all active designs + departments from the reference DB
    const masterResult = await pandoraPool.query(`
      SELECT design_num  AS "designNum",
             COALESCE(department, 'Uncategorised') AS department
      FROM   pandora_items
      WHERE  status = 'active'
    `);

    if (masterResult.rows.length === 0) {
      return res.json({
        totalStockCost: 0,
        totalUnits:     0,
        designsInStock: 0,
        designsTracked: 0,
        departments:    [],
        generatedAt:    new Date().toISOString(),
      });
    }

    const designNums   = masterResult.rows.map((r) => r.designNum);
    const deptByDesign = new Map(masterResult.rows.map((r) => [r.designNum, r.department]));

    // 2. Look up on-hand stock for those design numbers in burrows_jewellers
    const stockResult = await pool.query(
      `SELECT realdesignnum                        AS "designNum",
              SUM(totalavailqoh)::int              AS "onHand",
              ROUND(AVG(cost)::numeric, 4)         AS "avgCost"
       FROM   Items
       WHERE  vendorid      = 'PANDO'
         AND  realdesignnum IS NOT NULL
         AND  realdesignnum <> ''
         AND  realdesignnum = ANY($1::text[])
       GROUP BY realdesignnum
       HAVING SUM(totalavailqoh) > 0`,
      [designNums]
    );

    // 3. Match in JS, compute department breakdown
    const deptMap        = new Map();
    let   totalStockCost = 0;
    let   totalUnits     = 0;

    for (const row of stockResult.rows) {
      const onHand    = Number(row.onHand);
      const avgCost   = row.avgCost !== null ? Number(row.avgCost) : null;
      const stockCost = avgCost !== null ? onHand * avgCost : 0;
      const dept      = deptByDesign.get(row.designNum) || 'Uncategorised';

      totalStockCost += stockCost;
      totalUnits     += onHand;

      if (!deptMap.has(dept)) {
        deptMap.set(dept, { department: dept, stockCost: 0, units: 0, designs: 0 });
      }
      const d = deptMap.get(dept);
      d.stockCost += stockCost;
      d.units     += onHand;
      d.designs   += 1;
    }

    const departments = [...deptMap.values()]
      .map((d) => ({ ...d, stockCost: Math.round(d.stockCost * 100) / 100 }))
      .sort((a, b) => b.stockCost - a.stockCost);

    res.json({
      totalStockCost: Math.round(totalStockCost * 100) / 100,
      totalUnits,
      designsInStock: stockResult.rows.length,
      designsTracked: masterResult.rows.length,
      departments,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
