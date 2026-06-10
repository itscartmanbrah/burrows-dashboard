// Store Performance Dashboard — the homepage.
// Widgets:
//   - Today's sales per store
//   - Sales pace vs target
//   - Sales trend (weekly chart)
//   - Top performing suppliers (by revenue)
//   - Pandora stock value (on-hand cost matched against reference list)

import { Fragment, useEffect, useState } from 'react';
import { TrendingUp, Package, Target, Activity, Trophy, Gem, Loader2 } from 'lucide-react';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

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
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[320px] text-sm">
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
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[320px] text-sm">
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

// Today's date as YYYY-MM-DD in the store's own timezone (Australia/Melbourne)
// — used as the date picker's default value and its `max` (no peeking at
// "future" days that haven't happened yet).
function todayInMelbourne() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const dateLabelFormat = new Intl.DateTimeFormat('en-AU', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function SalesPaceCard() {
  const todayStr = todayInMelbourne();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    setError(null);
    apiClient
      .get(`/dashboard/sales-pace?date=${selectedDate}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || err.message));
  }, [selectedDate]);

  const isToday = selectedDate === todayStr;
  let dateLabel = selectedDate;
  try {
    dateLabel = dateLabelFormat.format(new Date(`${selectedDate}T00:00:00`));
  } catch {
    // fall back to the raw string if parsing fails
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle className="text-base">Sales Pace vs Target</CardTitle>
          <CardDescription>
            {isToday ? "Today's" : `${dateLabel}'s`} cumulative sales against each store's daily target
          </CardDescription>
        </div>
        <div className="flex items-center gap-3 sm:self-start">
          <div className="flex flex-col gap-1">
            <label htmlFor="sales-pace-date" className="text-[11px] font-medium text-muted-foreground">
              View date
            </label>
            <input
              id="sales-pace-date"
              type="date"
              value={selectedDate}
              max={todayStr}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Target className="size-4" />
          </div>
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
            <div className="h-56 w-full sm:h-72">
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
                  {data.isToday &&
                    data.currentHour >= data.tradingHours.open &&
                    data.currentHour <= data.tradingHours.close && (
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
              Daily goal = monthly target ÷ days in the month, paced evenly across trading hours (9am–5pm).{' '}
              {data.isToday
                ? `Showing today (${dateLabel}) so far.`
                : `Showing the full trading day for ${dateLabel}.`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Reference-line colors for the trend chart — chosen to roughly mirror
// EdgePulse's own palette so the chart feels familiar at a glance.
const TREND_COLORS = {
  actual: '#2563eb', // solid blue
  goal: '#dc2626', // dotted red
  goalDayAdj: '#d97706', // dashed amber
  lastYear: '#0891b2', // dash-dot cyan
  projected: '#c026d3', // dotted magenta
};

const percentChange = new Intl.NumberFormat('en-AU', {
  style: 'percent',
  maximumFractionDigits: 1,
  signDisplay: 'always',
});

function SalesTrendCard() {
  // 'all' aggregates every configured store into one combined view — the
  // most useful overview, so it's the default; switching to a specific
  // store id shows that store alone.
  const [storeId, setStoreId] = useState('all');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    setError(null);
    apiClient
      .get(`/dashboard/sales-trend?store=${storeId}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || err.message));
  }, [storeId]);

  const dayTick = (day) => {
    if (!data) return day;
    return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' }).format(
      new Date(data.year, data.month - 1, day)
    );
  };

  const todayRow = data ? data.chartData[data.today - 1] : null;
  const aheadOfDayAdjGoal = data && todayRow ? data.actualSoFar >= todayRow.goalDayAdj : false;
  const projectedAheadOfTarget = data && data.projectedTotal != null ? data.projectedTotal >= data.monthlyTarget : false;
  const vsLastYearPct =
    data && data.lastYear.sameWindowTotal > 0
      ? (data.actualSoFar - data.lastYear.sameWindowTotal) / data.lastYear.sameWindowTotal
      : null;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle className="text-base">Month-to-Date Sales Trend</CardTitle>
          <CardDescription>
            {data ? `Cumulative sales through ${data.monthLabel} so far` : 'Cumulative sales vs goal, last year and projection'}
          </CardDescription>
        </div>
        <div className="flex items-center gap-3 sm:self-start">
          {data && data.availableStores.length > 0 && (
            <div className="flex flex-col gap-1">
              <label htmlFor="sales-trend-store" className="text-[11px] font-medium text-muted-foreground">
                Store
              </label>
              <select
                id="sales-trend-store"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="all">All Stores</option>
                {data.availableStores.map((s) => (
                  <option key={s.storeId} value={s.storeId}>
                    {s.storeName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Activity className="size-4" />
          </div>
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
        {data && data.availableStores.length === 0 && (
          <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
            {data.note || 'No sales targets are configured.'}
          </p>
        )}
        {data && data.availableStores.length > 0 && (
          <>
            <div className="h-56 w-full sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.chartData} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="day"
                    tickFormatter={dayTick}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={28}
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
                    labelFormatter={(day) => dayTick(day)}
                    contentStyle={{
                      borderRadius: 8,
                      fontSize: 12,
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--card))',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine
                    x={data.today}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                    label={{ value: 'Today', position: 'insideTopRight', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="Actual"
                    stroke={TREND_COLORS.actual}
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="goal"
                    name="Goal"
                    stroke={TREND_COLORS.goal}
                    strokeWidth={1.5}
                    strokeDasharray="2 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="goalDayAdj"
                    name="Goal (day-adjusted)"
                    stroke={TREND_COLORS.goalDayAdj}
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="lastYear"
                    name="Last year"
                    stroke={TREND_COLORS.lastYear}
                    strokeWidth={1.5}
                    strokeDasharray="8 3 2 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="projected"
                    name="Projected"
                    stroke={TREND_COLORS.projected}
                    strokeWidth={1.75}
                    strokeDasharray="2 3"
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border px-3 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">Actual so far</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-lg font-semibold tabular-nums">{currency.format(data.actualSoFar)}</span>
                  <Badge variant={aheadOfDayAdjGoal ? 'success' : 'secondary'}>
                    {aheadOfDayAdjGoal ? 'Ahead of pace' : 'Behind pace'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Day-adjusted goal to date: {currency.format(todayRow?.goalDayAdj ?? 0)}
                </p>
              </div>

              <div className="rounded-lg border px-3 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">Projected month-end</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-lg font-semibold tabular-nums">
                    {data.projectedTotal != null ? currency.format(data.projectedTotal) : '—'}
                  </span>
                  {data.projectedTotal != null && (
                    <Badge variant={projectedAheadOfTarget ? 'success' : 'secondary'}>
                      {projectedAheadOfTarget ? 'On track' : 'Tracking short'}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Monthly target {currency.format(data.monthlyTarget)}</p>
              </div>

              <div className="rounded-lg border px-3 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">Same point last year</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-lg font-semibold tabular-nums">{currency.format(data.lastYear.sameWindowTotal)}</span>
                  {vsLastYearPct != null && (
                    <Badge variant={vsLastYearPct >= 0 ? 'success' : 'secondary'}>{percentChange.format(vsLastYearPct)}</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Full {data.monthLabel.split(' ')[0]} last year: {currency.format(data.lastYear.monthTotal)}
                </p>
              </div>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Goal = monthly target spread evenly across the month. Day-adjusted goal follows{' '}
              {data.store.storeId === 'all' ? "the combined business's" : `${data.store.storeName}'s`} typical
              day-of-week pattern from the past 6 months. Projection extrapolates the average daily rate achieved so
              far across the rest of {data.monthLabel}.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const SUPPLIER_PERIODS = [
  { key: 'daily', label: 'Today' },
  { key: 'monthly', label: 'This Month' },
  { key: 'yearly', label: 'This Year' },
];

// "Top Performing Suppliers" — ranks vendors by total sales revenue
// generated from their items (item-line sales net of refunds), across
// three calendar windows (today / month-to-date / year-to-date), switchable
// via tabs and filterable per-store. Complements the existing "Highest
// Supplier Cost" widget (which measures stock-on-hand cost value, not sales
// performance) by answering "whose products are actually selling".
function SupplierPerformanceCard() {
  // 'all' combines every store into one view — the most useful overview
  // and the default; switching to a specific store id filters to it alone.
  const [storeId, setStoreId] = useState('all');
  const [period, setPeriod] = useState('monthly');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    setError(null);
    apiClient
      .get(`/dashboard/supplier-performance?store=${storeId}&limit=8`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || err.message));
  }, [storeId]);

  const active = data ? data.periods[period] : null;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle className="text-base">Top Performing Suppliers</CardTitle>
          <CardDescription>
            {active ? `Ranked by sales revenue — ${active.label}` : "Ranked by sales revenue generated from each supplier’s items"}
          </CardDescription>
        </div>
        <div className="flex items-center gap-3 sm:self-start">
          {data && data.availableStores.length > 0 && (
            <div className="flex flex-col gap-1">
              <label htmlFor="supplier-perf-store" className="text-[11px] font-medium text-muted-foreground">
                Store
              </label>
              <select
                id="supplier-perf-store"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="all">All Stores</option>
                {data.availableStores.map((s) => (
                  <option key={s.storeId} value={s.storeId}>
                    {s.storeName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Trophy className="size-4" />
          </div>
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
          <Tabs value={period} onValueChange={setPeriod}>
            <TabsList>
              {SUPPLIER_PERIODS.map((p) => (
                <TabsTrigger key={p.key} value={p.key}>
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {SUPPLIER_PERIODS.map((p) => {
              const periodData = data.periods[p.key];
              const scopeLabel = data.store.storeId === 'all' ? 'all stores combined' : data.store.storeName;
              return (
                <TabsContent key={p.key} value={p.key}>
                  {periodData.suppliers.length === 0 ? (
                    <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                      No item sales recorded for {scopeLabel} in this period yet.
                    </p>
                  ) : (
                    <>
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full min-w-[420px] text-sm">
                          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">Supplier</th>
                              <th className="px-3 py-2 text-right font-medium">Items Sold</th>
                              <th className="px-3 py-2 text-right font-medium">Transactions</th>
                              <th className="px-3 py-2 text-right font-medium">Revenue</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {periodData.suppliers.map((s, i) => (
                              <tr key={s.vendorId} className="hover:bg-muted/40">
                                <td className="px-3 py-2 font-medium">
                                  <div className="flex items-center gap-2">
                                    {i === 0 && <Badge variant="success">Top</Badge>}
                                    {s.vendorName}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">{number.format(s.qty)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{number.format(s.transactions)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{currency.format(s.revenue)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Total revenue from item sales across these suppliers ({scopeLabel}): {currency.format(periodData.totalRevenue)}.
                        Figures are net of refunds and exclude quotes and voided sales.
                      </p>
                    </>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

// ── Pandora Stock Value ────────────────────────────────────────────────────
// Shows the total on-hand cost of Pandora inventory, matched against the
// active designs in the Pandora reference master list (pandora_reference DB)
// by Design Number, with a breakdown by Pandora department.
function PandoraStockValueCard() {
  const [data, setData]   = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiClient
      .get('/dashboard/pandora-stock-cost')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || err.message));
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle className="text-base">Pandora Stock Value</CardTitle>
          <CardDescription>Total cost value of all Pandora inventory currently on hand, by department</CardDescription>
        </div>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Gem className="size-4" />
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
            {/* Headline total */}
            <div className="mb-6 text-center">
              <p className="text-3xl font-bold tabular-nums">{currency.format(data.totalStockCost)}</p>
              <p className="mt-1 text-xs text-muted-foreground">total Pandora inventory cost on hand</p>
            </div>

            {/* Stats row */}
            <div className="mb-5 grid grid-cols-3 divide-x rounded-lg border text-center text-sm">
              <div className="px-2 py-3">
                <p className="font-semibold tabular-nums">{number.format(data.designsInStock)}</p>
                <p className="text-xs text-muted-foreground">designs in stock</p>
              </div>
              <div className="px-2 py-3">
                <p className="font-semibold tabular-nums">{number.format(data.totalUnits)}</p>
                <p className="text-xs text-muted-foreground">total units</p>
              </div>
              <div className="px-2 py-3">
                <p className="font-semibold tabular-nums">{number.format(data.matchedToReference)}</p>
                <p className="text-xs text-muted-foreground">matched to reference list</p>
              </div>
            </div>

            {/* Department breakdown */}
            {data.departments.length > 0 && (
              <div className="overflow-x-auto rounded-lg border">
                <table className="min-w-[360px] w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                      <th className="px-4 py-2 text-left font-medium">Department</th>
                      <th className="px-4 py-2 text-right font-medium">Designs</th>
                      <th className="px-4 py-2 text-right font-medium">Units</th>
                      <th className="px-4 py-2 text-right font-medium">Stock Cost</th>
                      <th className="px-4 py-2 text-right font-medium">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.departments.map((dept, i) => (
                      <tr key={dept.department} className={i % 2 !== 0 ? 'bg-muted/20' : ''}>
                        <td className="px-4 py-2 font-medium">{dept.department}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{number.format(dept.designs)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{number.format(dept.units)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{currency.format(dept.stockCost)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                          {data.totalStockCost > 0
                            ? `${((dept.stockCost / data.totalStockCost) * 100).toFixed(1)}%`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="mt-3 text-xs text-muted-foreground">
              Total cost value of all Pandora-vendor stock currently on hand (cost x quantity, summed across stores) —
              the same figure as Pandora's row in "Highest Supplier Cost". The reference list is used only to label
              each design's department below; stock for designs not yet on the list appears under
              "Not in reference list".
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
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Store Performance Dashboard</h2>
        <p className="text-sm text-muted-foreground">A live snapshot of how the business is tracking today.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TodaySalesCard />
        <TopSuppliersCard />
      </div>

      <SalesPaceCard />

      <SalesTrendCard />

      <SupplierPerformanceCard />

      <PandoraStockValueCard />
    </div>
  );
}
