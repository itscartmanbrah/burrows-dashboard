// JIMACO (Showcase) debt-reduction routes — powers the "Showcase Debt
// Reduction" tab, which is focused entirely on Burrows' relationship with
// "1 - JIMACO" (the Showcase buying-group financier).
//
//   GET /api/jimaco/position      -> live balance + aging from Xero
//   GET /api/jimaco/payment-plan  -> Jan-Dec projection / paydown plan
//   PUT /api/jimaco/payment-plan/:year/:month -> set "extra paydown" for a month
//
// The payment plan models how Burrows' balance with JIMACO will move month
// to month based on: estimated new purchases (driven by sales), JIMACO's
// Agency Fee, interest on the outstanding balance, and an editable "extra
// paydown" amount on top of normal trading — the lever Burrows controls to
// pay down the balance ahead of normal trading activity.

const express = require('express');

const pool = require('../db/pool');
const xero = require('../services/xeroClient');
const { requireAuth } = require('../middleware/auth');
const SALES_TARGETS = require('../config/salesTargets');
const ASSUMPTIONS = require('../config/jimacoAssumptions');

const router = express.Router();

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

async function ensurePlanTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jimaco_payment_plan (
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      extra_paydown NUMERIC NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (year, month)
    )
  `);
}

// Fetches every open (AUTHORISED) ACCPAY bill for JIMACO from Xero and
// buckets the AmountDue by how overdue it is, relative to today.
async function getJimacoPosition() {
  let invoices = [];
  for (let page = 1; page <= 20; page++) {
    const data = await xero.xeroApiGet('/Invoices', {
      where: `Contact.ContactID==guid("${ASSUMPTIONS.JIMACO_CONTACT_ID}") AND Type=="ACCPAY" AND Status=="AUTHORISED"`,
      page,
      order: 'DueDate ASC',
    });
    invoices = invoices.concat(data.Invoices || []);
    if (!data.Invoices || data.Invoices.length < 100) break;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const aging = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
  let total = 0;

  for (const inv of invoices) {
    const dueRaw = inv.DueDateString || inv.DueDate;
    const due = dueRaw ? new Date(dueRaw) : null;
    const amt = Number(inv.AmountDue) || 0;
    total += amt;

    if (!due || isNaN(due.getTime())) {
      aging.current += amt;
      continue;
    }

    const days = Math.floor((today - due) / (24 * 60 * 60 * 1000));
    if (days <= 0) aging.current += amt;
    else if (days <= 30) aging.days1to30 += amt;
    else if (days <= 60) aging.days31to60 += amt;
    else if (days <= 90) aging.days61to90 += amt;
    else aging.days90plus += amt;
  }

  const overdue = aging.days1to30 + aging.days31to60 + aging.days61to90 + aging.days90plus;

  return {
    totalOutstanding: round2(total),
    totalOverdue: round2(overdue),
    billCount: invoices.length,
    aging: {
      current: round2(aging.current),
      days1to30: round2(aging.days1to30),
      days31to60: round2(aging.days31to60),
      days61to90: round2(aging.days61to90),
      days90plus: round2(aging.days90plus),
    },
  };
}

// Monthly actual sales (combined across SALES_STORE_IDS) for a given year,
// from EdgePulse-synced point-of-sale data. Matches the "TENDER" line
// methodology used elsewhere in the dashboard (see routes/dashboard.js).
async function getMonthlyActualSales(year) {
  const result = await pool.query(
    `
      SELECT EXTRACT(MONTH FROM s.saledate)::int AS month,
             COALESCE(SUM(CASE WHEN sl.slkey1 = 'TENDER' THEN sl.unitsellprice * sl.quantity ELSE 0 END), 0) AS total
      FROM EP_Sales s
      JOIN EP_SaleLines sl ON sl.storeid = s.storeid AND sl.saleid = s.saleid
      WHERE s.storeid = ANY($1::int[])
        AND s.voided = false
        AND s.saledate >= $2::date
        AND s.saledate <  $3::date
      GROUP BY month
    `,
    [ASSUMPTIONS.SALES_STORE_IDS, `${year}-01-01`, `${year + 1}-01-01`]
  );

  const map = {};
  for (const row of result.rows) {
    map[row.month] = parseFloat(row.total);
  }
  return map;
}

function getCombinedTarget(year, month) {
  const targets = SALES_TARGETS[year] || {};
  let total = 0;
  for (const storeId of ASSUMPTIONS.SALES_STORE_IDS) {
    const monthly = targets[storeId]?.monthly;
    if (monthly && monthly[month - 1] != null) total += monthly[month - 1];
  }
  return total;
}

// Live balance + aging breakdown for JIMACO.
router.get('/position', requireAuth, async (req, res) => {
  try {
    const position = await getJimacoPosition();
    res.json({ ...position, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full year view: Jan -> (current month - 1) is "Year to date" (actual vs
// target), and (current month) -> Dec is the editable "Payment Plan"
// projection, starting from JIMACO's live balance today.
router.get('/payment-plan', requireAuth, async (req, res) => {
  try {
    await ensurePlanTable();

    const now = new Date();
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const isCurrentYear = year === now.getFullYear();
    const currentMonth = isCurrentYear ? now.getMonth() + 1 : 1;

    const [position, actuals, planRows] = await Promise.all([
      getJimacoPosition(),
      getMonthlyActualSales(year),
      pool.query('SELECT month, extra_paydown FROM jimaco_payment_plan WHERE year = $1', [year]),
    ]);

    const extraPaydowns = {};
    for (const row of planRows.rows) {
      extraPaydowns[row.month] = parseFloat(row.extra_paydown);
    }

    // Year-to-date: months strictly before the current month.
    const history = [];
    for (let m = 1; m < currentMonth; m++) {
      const target = getCombinedTarget(year, m);
      const actual = actuals[m] ?? 0;
      history.push({
        month: m,
        monthName: MONTH_NAMES[m - 1],
        salesTarget: round2(target),
        salesActual: round2(actual),
        variance: round2(actual - target),
      });
    }

    // Projection: current month -> December, starting from today's live
    // JIMACO balance.
    let openingBalance = position.totalOutstanding;
    const projection = [];
    for (let m = currentMonth; m <= 12; m++) {
      const salesTarget = getCombinedTarget(year, m);
      // Use actual sales for the current month if it's ahead of pace so
      // far, otherwise fall back to target — but for simplicity and to
      // keep the plan a forward "commitment", projected months always use
      // the Sales Target (the actual for the current month-to-date is
      // shown separately in `history`/`monthToDateActual`).
      const salesUsed = salesTarget;

      const estimatedPurchases = salesUsed * ASSUMPTIONS.purchasesPctOfSales;
      const agencyFee = estimatedPurchases * ASSUMPTIONS.agencyFeePct;
      const interest = openingBalance * (ASSUMPTIONS.interestRateAnnual / 12);
      const extraPaydown = extraPaydowns[m] ?? ASSUMPTIONS.defaultExtraPaydown ?? 0;
      const plannedPayment = estimatedPurchases + agencyFee + interest + extraPaydown;
      const closingBalance = Math.max(0, openingBalance - extraPaydown);

      projection.push({
        month: m,
        monthName: MONTH_NAMES[m - 1],
        salesTarget: round2(salesTarget),
        estimatedPurchases: round2(estimatedPurchases),
        agencyFee: round2(agencyFee),
        interest: round2(interest),
        extraPaydown: round2(extraPaydown),
        plannedPayment: round2(plannedPayment),
        openingBalance: round2(openingBalance),
        closingBalance: round2(closingBalance),
      });

      openingBalance = closingBalance;
    }

    const monthToDateActual = round2(actuals[currentMonth] ?? 0);

    res.json({
      year,
      currentMonth,
      monthToDateActual,
      assumptions: ASSUMPTIONS,
      position: { ...position, generatedAt: undefined },
      history,
      projection,
      startingBalance: round2(position.totalOutstanding),
      endingBalance: round2(projection.length ? projection[projection.length - 1].closingBalance : position.totalOutstanding),
      totalExtraPaydown: round2(projection.reduce((sum, m) => sum + m.extraPaydown, 0)),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update the "extra paydown" commitment for a single month. The full plan
// is recomputed from Xero's live balance on the next GET, so this only
// needs to persist the one value.
router.put('/payment-plan/:year/:month', requireAuth, async (req, res) => {
  try {
    await ensurePlanTable();

    const year = parseInt(req.params.year, 10);
    const month = parseInt(req.params.month, 10);
    const { extraPaydown } = req.body || {};

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }
    if (typeof extraPaydown !== 'number' || !isFinite(extraPaydown) || extraPaydown < 0) {
      return res.status(400).json({ error: 'extraPaydown must be a non-negative number' });
    }

    await pool.query(
      `INSERT INTO jimaco_payment_plan (year, month, extra_paydown, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (year, month) DO UPDATE SET extra_paydown = $3, updated_at = now()`,
      [year, month, extraPaydown]
    );

    res.json({ ok: true, year, month, extraPaydown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
