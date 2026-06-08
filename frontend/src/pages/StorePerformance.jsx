// Store Performance Dashboard — the homepage.
// Phase 1 widgets:
//   - Today's sales per store
//   - Highest supplier cost (inventory cost value tied up per vendor)
// A third widget (current Pandora stock cost) will be added in Phase 3,
// once the Pandora reference data (build-to-levels / discontinued list)
// has been imported.

import { Fragment, useEffect, useState } from 'react';
import { TrendingUp, Package, Target, Loader2 } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
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

// Per-store line color (the "Actual" line uses this in full strength, the
// "Target Pace" line for the same store is a dashed line in the same hue).
const STORE_COLORS = {
  1: '#2563eb', // Burrows Jewellers — blue
  3: '#d97706', // Jewellery @ 65 — amber
};

function formatHourTick(hour) {
  const h = Math.floor(hour);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}${period}`;
}

const compactCurrency = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 0,
});

function SalesPaceCard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiClient
      .get('/dashboard/sales-pace')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || err.message));
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Sales Pace vs Target</CardTitle>
          <CardDescription>Today's cumulative sales against each store's daily target</CardDescription>
        </div>
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Target className="size-4" />
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
        {data && data.stores.length === 0 && (
          <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
            {data.note || 'No sales targets are configured.'}
          </p>
        )}
        {data && data.stores.length > 0 && (
          <>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.chartData} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="hour"
                    tickFormatter={formatHourTick}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => compactCurrency.format(v)}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                  />
                  <Tooltip
                    formatter={(value, name) => [value == null ? '—' : currency.format(value), name]}
                    labelFormatter={(hour) => formatHourTick(hour)}
                    contentStyle={{
                      borderRadius: 8,
                      fontSize: 12,
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--card))',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {data.currentHour >= data.tradingHours.open && data.currentHour <= data.tradingHours.close && (
                    <ReferenceLine
                      x={data.currentHour}
                      stroke="hsl(var(--muted-foreground))"
                      strokeDasharray="4 4"
                      label={{ value: 'Now', position: 'insideTopRight', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    />
                  )}
                  {data.stores.map((store) => {
                    const color = STORE_COLORS[store.storeId] || '#6b7280';
                    return (
                      <Fragment key={store.storeId}>
                        <Line
                          type="monotone"
                          dataKey={`store${store.storeId}_actual`}
                          name={`${store.storeName} — Actual`}
                          stroke={color}
                          strokeWidth={2.25}
                          dot={false}
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                        <Line
                          type="linear"
                          dataKey={`store${store.storeId}_target`}
                          name={`${store.storeName} — Target Pace`}
                          stroke={color}
                          strokeWidth={1.5}
                          strokeDasharray="5 4"
                          dot={false}
                          isAnimationActive={false}
                        />
                      </Fragment>
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {data.stores.map((store) => {
                const { open, close } = data.tradingHours;
                const elapsedFraction = Math.max(0, Math.min(data.currentHour, close) - open) / (close - open);
                const targetSoFar = store.dailyTarget * elapsedFraction;
                const isAhead = store.actualSoFar >= targetSoFar;

                return (
                  <div key={store.storeId} className="rounded-lg border px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium" title={store.storeLongName}>
                        {store.storeName}
                      </p>
                      <Badge variant={isAhead ? 'success' : 'secondary'}>
                        {isAhead ? 'Ahead of pace' : 'Behind pace'}
                      </Badge>
                    </div>
                    <div className="mt-1.5 flex items-baseline gap-2">
                      <span className="text-lg font-semibold tabular-nums">{currency.format(store.actualSoFar)}</span>
                      <span className="text-xs text-muted-foreground">vs {currency.format(targetSoFar)} pace</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Daily goal {currency.format(store.dailyTarget)} · Monthly target {currency.format(store.monthlyTarget)}
                    </p>
                  </div>
                );
              })}
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Daily goal = monthly target ÷ days in the month, paced evenly across trading hours (9am–5pm). As of {data.date}.
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

      <SalesPaceCard />

      <p className="text-xs text-muted-foreground">
        Note: a fourth widget — current Pandora stock cost — will appear here once the Pandora
        reference data (build-to-levels / discontinued list) has been imported (Phase 2 → 3).
      </p>
    </div>
  );
}
