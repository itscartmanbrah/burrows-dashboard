// Assumptions used to build the JIMACO (Showcase) payment-plan projection
// shown on the "Showcase Debt Reduction" tab. These mirror the figures used
// in Burrows' internal financial planning model and are validated against
// JIMACO's actual May 2026 member statement (see notes below). Tweak these
// here if JIMACO's terms change or the gross-profit assumption is revised.
//
// JIMACO_CONTACT_ID is the Xero ContactID for "1 - JIMACO" (the Showcase
// buying-group financier) — used to pull the live Accounts Payable balance
// and open-bill aging.
//
// SALES_STORE_IDS are the EdgePulse storeids whose sales count toward the
// "purchases through JIMACO" estimate (1 = Burrows Jewellers, 3 = Jewellery
// @ 65 — matches config/salesTargets.js; excludes MSJ/Warehouse).

module.exports = {
  JIMACO_CONTACT_ID: '6be97e7d-f771-4f12-9cd3-fccac9a6a5c6',
  SALES_STORE_IDS: [1, 3],

  // Blended annual interest rate applied to the opening balance each month.
  //
  // JIMACO's Trade Terms actually charge interest on a tiered basis:
  //   - 0% for the first 37 days after the statement date
  //   - 18% p.a. on the portion 38-59 days overdue
  //   - 24% p.a. on the portion 60+ days overdue
  //
  // Applying a flat 19% p.a. to the *whole* opening balance produced
  // $4,253 for the May 2026 statement, vs the actual charge of $4,052.20 —
  // close enough (~5%) to use as a simple, conservative single-rate proxy
  // for forward projections.
  interestRateAnnual: 0.19,

  // Estimated monthly purchases routed through JIMACO/Showcase suppliers,
  // as a percentage of sales. Derived as (1 - assumed gross profit margin),
  // i.e. 1 - 56% = 44% — matches Burrows' "Assumed Gross Profit ~56%" line
  // in the internal planning spreadsheet for Jan-Apr 2026.
  purchasesPctOfSales: 0.44,

  // JIMACO Agency Fee: 3.5% of net purchases from Showcase suppliers
  // (per JIMACO Trade Terms, clause 9). Excludes the smaller per-shopfront
  // and 0.5%-up-to-$500k components, which are immaterial at Burrows' scale.
  agencyFeePct: 0.035,

  // Default "extra paydown" suggested per month if none has been set yet.
  // This is fully editable per month in the Payment Plan table.
  defaultExtraPaydown: 0,
};
