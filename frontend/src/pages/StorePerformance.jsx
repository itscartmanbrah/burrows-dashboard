// Store Performance Dashboard — the homepage.
// Phase 1 widgets:
//   - Today's sales per store
//   - Highest supplier cost (inventory cost value tied up per vendor)
// A third widget (current Pandora stock cost) will be added in Phase 3,
// once the Pandora reference data (build-to-levels / discontinued list)
// has been imported.

import { useEffect, useState } from 'react';
import { TrendingUp, Package, Loader2 } from 'lucide-react';
import apiClient from '../api/client';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const currency = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const number = new Intl.NumberFormat('en-AU');

function CardState({ icon: Icon, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Icon className="size-5" />
      {children}
    </div>
  );
}

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
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Today's Sales by Store</CardTitle>
          <CardDescription>Tendered amounts, excluding voided sales</CardDescription>
        </div>
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <TrendingUp className="size-4" />
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Error: {error}
          </p>
        )}
        {!error && !data && (
          <CardState icon={Loader2}>
            <span className="animate-pulse">Loading…</span>
          </CardState>
        )}
        {data && (
          <>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Store</th>
                    <th className="px-3 py-2 text-right font-medium">Transactions</th>
                    <th className="px-3 py-2 text-right font-medium">Total Sales</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.stores.map((s) => (
                    <tr key={s.storeId} className="hover:bg-muted/40">
                      <td className="px-3 py-2 font-medium" title={s.storeLongName}>
                        {s.storeName}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{number.format(s.transactions)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{currency.format(s.totalSales)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/30 font-semibold">
                  <tr>
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {number.format(data.stores.reduce((sum, s) => sum + s.transactions, 0))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{currency.format(data.grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">As of {data.date}</p>
          </>
        )}
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Highest Supplier Cost</CardTitle>
          <CardDescription>Cost value of stock currently on hand</CardDescription>
        </div>
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Package className="size-4" />
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Error: {error}
          </p>
        )}
        {!error && !data && (
          <CardState icon={Loader2}>
            <span className="animate-pulse">Loading…</span>
          </CardState>
        )}
        {data && (
          <>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Supplier</th>
                    <th className="px-3 py-2 text-right font-medium">Qty on Hand</th>
                    <th className="px-3 py-2 text-right font-medium">Cost Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.suppliers.map((s, i) => (
                    <tr key={s.vendorId} className="hover:bg-muted/40">
                      <td className="px-3 py-2 font-medium">
                        <div className="flex items-center gap-2">
                          {i === 0 && <Badge variant="success">Top</Badge>}
                          {s.vendorName}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{number.format(s.totalQty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{currency.format(s.totalCostValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Cost price × quantity on hand, summed across all stores.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function StorePerformance() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Store Performance Dashboard</h2>
        <p className="text-sm text-muted-foreground">A live snapshot of how the business is tracking today.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TodaySalesCard />
        <TopSuppliersCard />
      </div>

      <p className="text-xs text-muted-foreground">
        Note: a third widget — current Pandora stock cost — will appear here once the Pandora
        reference data (build-to-levels / discontinued list) has been imported (Phase 2 → 3).
      </p>
    </div>
  );
}
