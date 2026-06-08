// Annual sales targets per store, as supplied to EdgePulse at the start of
// each year (EdgePulse asks retailers to set monthly $ targets, which then
// drive its own "sales vs target" pacing chart). EdgePulse does not sync
// these figures back to us via the Data API, so they're maintained here by
// hand — update this file whenever new targets are set (typically once a
// year, but feel free to tweak mid-year if a store's target changes).
//
// Each store's `monthly` array has exactly 12 entries, one per calendar
// month: [Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec], in
// whole dollars. `storeid` values match the `Stores` table in
// burrows_jewellers (1 = Burrows Jewellers, 3 = Jewellery @ 65).
//
// Only stores with an entry here get a "target pace" line on the
// Store Performance "Sales Pace vs Target" widget — stores without a
// configured target (e.g. Mildura Showcase Jewellers, Warehouse) are
// simply left out of that widget.

module.exports = {
  2026: {
    1: {
      // Burrows Jewellers
      monthly: [46000, 75000, 87000, 93000, 83000, 68000, 96000, 73000, 110000, 95000, 106000, 171000],
    },
    3: {
      // Jewellery @ 65
      monthly: [50000, 50000, 35000, 45000, 55000, 22000, 31000, 41000, 43000, 46000, 41000, 122000],
    },
  },
};
