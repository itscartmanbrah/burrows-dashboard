// Store Performance Dashboard — the homepage.
// Phase 1 widgets:
//   - Today's sales per store
//   - Highest supplier cost (inventory cost value tied up per vendor)
// A third widget (current Pandora stock cost) will be added in Phase 3,
// once the Pandora reference data (build-to-levels / discontinued list)
// has been imported.

import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import './StorePerformance.css';

const currency = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const number = new Intl.NumberFormat('en-AU');

function TodaySalesCard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiClient
      .get('/dashboard/today-sales')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || err.message));
  }, []);

  return (
    <div className="card">
      <h3>Today's Sales by Store</h3>
      {error && <p className="error-text">Error: {error}</p>}
      {!error && !data && <p className="muted">Loading…</p>}
      {data && (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Store</th>
                <th className="num">Transactions</th>
                <th className="num">Total Sales</th>
              </tr>
            </thead>
            <tbody>
              {data.stores.map((s) => (
                <tr key={s.storeId}>
                  <td title={s.storeLongName}>{s.storeName}</td>
                  <td className="num">{number.format(s.transactions)}</td>
                  <td className="num">{currency.format(s.totalSales)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Total</strong></td>
                <td className="num">
                  <strong>{number.format(data.stores.reduce((sum, s) => sum + s.transactions, 0))}</strong>
                </td>
                <td className="num"><strong>{currency.format(data.grandTotal)}</strong></td>
              </tr>
            </tfoot>
          </table>
          <p className="muted small">As of {data.date} — based on tendered (collected) amounts, excluding voided sales.</p>
        </>
      )}
    </div>
  );
}

function TopSuppliersCard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiClient
      .get('/dashboard/top-suppliers?limit=8')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || err.message));
  }, []);

  return (
    <div className="card">
      <h3>Highest Supplier Cost (Stock on Hand)</h3>
      {error && <p className="error-text">Error: {error}</p>}
      {!error && !data && <p className="muted">Loading…</p>}
      {data && (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th className="num">Qty on Hand</th>
                <th className="num">Cost Value</th>
              </tr>
            </thead>
            <tbody>
              {data.suppliers.map((s) => (
                <tr key={s.vendorId}>
                  <td>{s.vendorName}</td>
                  <td className="num">{number.format(s.totalQty)}</td>
                  <td className="num">{currency.format(s.totalCostValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Total inventory cost value (cost price × quantity on hand), summed across all stores.</p>
        </>
      )}
    </div>
  );
}

export default function StorePerformance() {
  return (
    <div>
      <h2>Store Performance Dashboard</h2>
      <p className="muted">A live snapshot of how the business is tracking today.</p>

      <div className="widget-grid">
        <TodaySalesCard />
        <TopSuppliersCard />
      </div>

      <p className="muted small" style={{ marginTop: '1.5rem' }}>
        Note: a third widget — current Pandora stock cost — will appear here once the Pandora
        reference data (build-to-levels / discontinued list) has been imported (Phase 2 → 3).
      </p>
    </div>
  );
}
