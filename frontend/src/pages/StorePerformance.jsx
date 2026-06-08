// Placeholder Home page — will become the full Store Performance Dashboard
// in Phase 1 (today's sales per store, Pandora stock value, top suppliers).
// For now it calls a protected backend endpoint to prove the full pipeline:
// React → Express (JWT-authenticated) → PostgreSQL → back to the browser.

import { useEffect, useState } from 'react';
import apiClient from '../api/client';

export default function StorePerformance() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiClient
      .get('/overview')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || err.message));
  }, []);

  return (
    <div>
      <h2>Store Performance Dashboard</h2>
      <p>This is the homepage placeholder. The real widgets (today's sales per store,
         current Pandora stock cost, highest supplier cost) will be built in Phase 1.</p>

      <div className="pipeline-check">
        <h3>Pipeline check</h3>
        {error && <p style={{ color: '#c0392b' }}>Error: {error}</p>}
        {!error && !data && <p>Loading live data from burrows_jewellers…</p>}
        {data && (
          <ul>
            <li>{data.message}</li>
            <li>Total items in inventory: <strong>{data.itemCount.toLocaleString()}</strong></li>
          </ul>
        )}
      </div>
    </div>
  );
}
