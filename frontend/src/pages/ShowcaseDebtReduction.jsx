// Showcase Debt Reduction — focused on Burrows' relationship with
// "1 - JIMACO" (the Showcase buying-group financier that pays approved
// suppliers on Burrows' behalf, then bills Burrows monthly).
//
// This tab connects to Xero (for the live JIMACO balance + open-bill
// aging) and EdgePulse sales data (actuals + targets) to build a
// month-by-month payment plan showing how Burrows intends to pay down its
// JIMACO balance through to December. It also includes a "Print / Export"
// view suitable for sharing with JIMACO/Showcase as evidence of a plan.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Link2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  TrendingDown,
  Printer,
  Info,
} from 'lucide-react';
import apiClient from '../api/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const dateTime = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const dateOnly = new Intl.DateTimeFormat('en-AU', { dateStyle: 'long' });

const currency = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const currency0 = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 0,
});
const percent = new Intl.NumberFormat('en-AU', { style: 'percent', minimumFractionDigits: 1 });

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Recomputes the projection client-side so editing one month's "extra
// paydown" instantly cascades through the rest of the plan (mirrors the
// formula in backend/routes/jimaco.js).
function recomputeProjection(months, assumptions) {
  let opening = months[0]?.openingBalance ?? 0;
  return months.map((m) => {
    const estimatedPurchases = m.salesTarget * assumptions.purchasesPctOfSales;
    const agencyFee = estimatedPurchases * assumptions.agencyFeePct;
    const interest = opening * (assumptions.interestRateAnnual / 12);
    const extraPaydown = m.extraPaydown;
    const plannedPayment = estimatedPurchases + agencyFee + interest + extraPaydown;
    const closingBalance = Math.max(0, opening - extraPaydown);

    const result = {
      ...m,
      estimatedPurchases: round2(estimatedPurchases),
      agencyFee: round2(agencyFee),
      interest: round2(interest),
      plannedPayment: round2(plannedPayment),
      openingBalance: round2(opening),
      closingBalance: round2(closingBalance),
    };
    opening = closingBalance;
    return result;
  });
}

function AgingBar({ aging, total }) {
  const buckets = [
    { key: 'current', label: 'Current', color: 'bg-green-500' },
    { key: 'days1to30', label: '1-30 days', color: 'bg-yellow-400' },
    { key: 'days31to60', label: '31-60 days', color: 'bg-orange-400' },
    { key: 'days61to90', label: '61-90 days', color: 'bg-orange-600' },
    { key: 'days90plus', label: '90+ days', color: 'bg-destructive' },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {buckets.map((b) => {
          const value = aging[b.key] || 0;
          const widthPct = total > 0 ? (value / total) * 100 : 0;
          if (widthPct <= 0) return null;
          return <div key={b.key} className={cn('h-full', b.color)} style={{ width: `${widthPct}%` }} />;
        })}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-5">
        {buckets.map((b) => (
          <div key={b.key} className="flex items-center gap-1.5">
            <span className={cn('size-2 shrink-0 rounded-full', b.color)} />
            <span className="text-muted-foreground">{b.label}</span>
            <span className="ml-auto font-medium sm:ml-1">{currency.format(aging[b.key] || 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PositionSummary({ data }) {
  const { position, generatedAt } = data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingDown className="size-5" />
          Current position with 1 - JIMACO
        </CardTitle>
        <CardDescription>
          Live balance and aging of all open Showcase/JIMACO purchases, from Xero Accounts Payable.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-sm text-muted-foreground">Total balance owed to JIMACO</p>
            <p className="text-2xl font-semibold tracking-tight">{currency.format(position.totalOutstanding)}</p>
          </div>
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-sm text-muted-foreground">Of which overdue (30+ days)</p>
            <p className="text-2xl font-semibold tracking-tight text-destructive">
              {currency.format(position.totalOverdue)}
            </p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Aging of open purchases</p>
          <AgingBar aging={position.aging} total={position.totalOutstanding} />
        </div>

        <p className="text-xs text-muted-foreground">
          Based on {position.billCount} open JIMACO purchase{position.billCount === 1 ? '' : 's'} in Xero, as at{' '}
          {dateTime.format(new Date(generatedAt))}.
        </p>
      </CardContent>
    </Card>
  );
}

function YearToDate({ data }) {
  if (!data.history.length) return null;

  const totals = data.history.reduce(
    (acc, m) => ({
      target: acc.target + m.salesTarget,
      actual: acc.actual + m.salesActual,
    }),
    { target: 0, actual: 0 }
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Year to date — sales vs target</CardTitle>
        <CardDescription>
          Combined sales for Burrows Jewellers + Jewellery @ 65 (the same stores and targets used in the payment
          plan below).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Month</th>
                <th className="px-3 py-2 text-right font-medium">Sales target</th>
                <th className="px-3 py-2 text-right font-medium">Actual sales</th>
                <th className="px-3 py-2 text-right font-medium">Variance</th>
              </tr>
            </thead>
            <tbody>
              {data.history.map((m) => (
                <tr key={m.month} className="border-t">
                  <td className="px-3 py-2">{m.monthName}</td>
                  <td className="px-3 py-2 text-right">{currency.format(m.salesTarget)}</td>
                  <td className="px-3 py-2 text-right">{currency.format(m.salesActual)}</td>
                  <td
                    className={cn(
                      'px-3 py-2 text-right font-medium',
                      m.variance < 0 ? 'text-destructive' : 'text-green-600'
                    )}
                  >
                    {m.variance >= 0 ? '+' : ''}
                    {currency.format(m.variance)}
                  </td>
                </tr>
              ))}
              <tr className="border-t bg-muted/30 font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right">{currency.format(totals.target)}</td>
                <td className="px-3 py-2 text-right">{currency.format(totals.actual)}</td>
                <td
                  className={cn(
                    'px-3 py-2 text-right',
                    totals.actual - totals.target < 0 ? 'text-destructive' : 'text-green-600'
                  )}
                >
                  {totals.actual - totals.target >= 0 ? '+' : ''}
                  {currency.format(totals.actual - totals.target)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {data.monthToDateActual > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {data.projection[0]?.monthName} is in progress — month-to-date actual sales so far:{' '}
            {currency.format(data.monthToDateActual)} (target for the full month:{' '}
            {currency.format(data.projection[0]?.salesTarget || 0)}).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PaymentPlan({ data, months, onChangeExtraPaydown, saving }) {
  const lastMonth = months[months.length - 1];
  const totalExtraPaydown = months.reduce((sum, m) => sum + m.extraPaydown, 0);
  const totalPlannedPayment = months.reduce((sum, m) => sum + m.plannedPayment, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment plan — {data.year}</CardTitle>
        <CardDescription>
          Projected month-by-month balance with JIMACO from now through to December {data.year}, including an
          editable "extra paydown" — money paid to JIMACO over and above ongoing trading — to bring the balance
          down.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-sm text-muted-foreground">Balance today</p>
            <p className="text-2xl font-semibold tracking-tight">{currency.format(months[0]?.openingBalance || 0)}</p>
          </div>
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-sm text-muted-foreground">Projected balance, 31 Dec {data.year}</p>
            <p className="text-2xl font-semibold tracking-tight text-green-600">
              {currency.format(lastMonth?.closingBalance || 0)}
            </p>
          </div>
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-sm text-muted-foreground">Total extra paydown committed</p>
            <p className="text-2xl font-semibold tracking-tight">{currency.format(totalExtraPaydown)}</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Month</th>
                <th className="px-3 py-2 text-right font-medium">Sales target</th>
                <th className="px-3 py-2 text-right font-medium">Est. purchases (44%)</th>
                <th className="px-3 py-2 text-right font-medium">Agency fee (3.5%)</th>
                <th className="px-3 py-2 text-right font-medium">Interest (19% p.a.)</th>
                <th className="px-3 py-2 text-right font-medium">Extra paydown</th>
                <th className="px-3 py-2 text-right font-medium">Planned payment</th>
                <th className="px-3 py-2 text-right font-medium">Closing balance</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className="border-t">
                  <td className="px-3 py-2 font-medium">{m.monthName}</td>
                  <td className="px-3 py-2 text-right">{currency0.format(m.salesTarget)}</td>
                  <td className="px-3 py-2 text-right">{currency0.format(m.estimatedPurchases)}</td>
                  <td className="px-3 py-2 text-right">{currency0.format(m.agencyFee)}</td>
                  <td className="px-3 py-2 text-right">{currency0.format(m.interest)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="text-muted-foreground no-print">$</span>
                      <Input
                        type="number"
                        min="0"
                        step="500"
                        value={m.extraPaydown}
                        onChange={(e) => onChangeExtraPaydown(m.month, Number(e.target.value))}
                        className={cn(
                          'h-8 w-28 text-right',
                          'print:h-auto print:w-auto print:border-0 print:bg-transparent print:p-0 print:shadow-none'
                        )}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{currency0.format(m.plannedPayment)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{currency0.format(m.closingBalance)}</td>
                </tr>
              ))}
              <tr className="border-t bg-muted/30 font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right">
                  {currency0.format(months.reduce((s, m) => s + m.salesTarget, 0))}
                </td>
                <td className="px-3 py-2 text-right">
                  {currency0.format(months.reduce((s, m) => s + m.estimatedPurchases, 0))}
                </td>
                <td className="px-3 py-2 text-right">
                  {currency0.format(months.reduce((s, m) => s + m.agencyFee, 0))}
                </td>
                <td className="px-3 py-2 text-right">
                  {currency0.format(months.reduce((s, m) => s + m.interest, 0))}
                </td>
                <td className="px-3 py-2 text-right">{currency0.format(totalExtraPaydown)}</td>
                <td className="px-3 py-2 text-right">{currency0.format(totalPlannedPayment)}</td>
                <td className="px-3 py-2 text-right">{currency0.format(lastMonth?.closingBalance || 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground no-print">
          {saving ? (
            <>
              <Loader2 className="size-3 animate-spin" /> Saving changes…
            </>
          ) : (
            <span>Edit "Extra paydown" to adjust the plan — changes are saved automatically.</span>
          )}
        </div>

        <div className="rounded-md border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm">
          <p className="font-semibold">Summary for JIMACO / Showcase</p>
          <p className="mt-1 text-muted-foreground">
            Starting from {currency.format(months[0]?.openingBalance || 0)} today, by committing an additional{' '}
            {currency.format(totalExtraPaydown)} in paydowns between now and December, Burrows projects its JIMACO
            balance will reduce to <strong>{currency.format(lastMonth?.closingBalance || 0)}</strong> by 31 December{' '}
            {data.year}.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Methodology({ data }) {
  const { assumptions } = data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="size-5" />
          How this plan is calculated
        </CardTitle>
        <CardDescription>Methodology and data sources behind the figures above.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm leading-relaxed">
        <div>
          <p className="font-medium">1. Starting balance</p>
          <p className="text-muted-foreground">
            The "Balance today" figure is pulled live from Xero — it is the total of every open (unpaid) purchase
            JIMACO has made on Burrows' behalf, exactly as it would appear on the next JIMACO member statement.
          </p>
        </div>

        <div>
          <p className="font-medium">2. Estimated purchases each month</p>
          <p className="text-muted-foreground">
            Each month, Burrows replenishes stock sold through Showcase-approved suppliers, and JIMACO pays those
            supplier invoices on Burrows' behalf — adding to the balance. We estimate this amount as{' '}
            <strong>{percent.format(assumptions.purchasesPctOfSales)} of that month's sales target</strong>, based
            on Burrows' assumed cost of goods sold (1 − {percent.format(0.56)} gross profit margin ≈{' '}
            {percent.format(assumptions.purchasesPctOfSales)}).
          </p>
        </div>

        <div>
          <p className="font-medium">3. JIMACO Agency Fee</p>
          <p className="text-muted-foreground">
            Per JIMACO's published Trade Terms, Showcase charges an Agency Fee of{' '}
            <strong>{percent.format(assumptions.agencyFeePct)} of net purchases</strong> from Showcase suppliers.
            This is added to the balance every month alongside the purchases themselves.
          </p>
        </div>

        <div>
          <p className="font-medium">4. Interest</p>
          <p className="text-muted-foreground">
            JIMACO's Trade Terms charge no interest for the first 37 days after a statement, then{' '}
            <strong>18% p.a.</strong> on amounts 38-59 days overdue and <strong>24% p.a.</strong> on amounts 60+ days
            overdue. As a single conservative rate for forward planning, we apply a blended{' '}
            <strong>{percent.format(assumptions.interestRateAnnual)} p.a.</strong> (
            {percent.format(assumptions.interestRateAnnual / 12)} per month) to the opening balance each month —
            this matches JIMACO's actual interest charge on Burrows' May 2026 statement ($4,052.20) to within ~5%.
          </p>
        </div>

        <div>
          <p className="font-medium">5. Extra paydown (the plan)</p>
          <p className="text-muted-foreground">
            This is the amount Burrows commits to pay JIMACO each month, over and above what's needed to cover that
            month's new purchases, agency fee and interest. It is fully editable per month and directly reduces the
            closing balance carried into the following month.
          </p>
        </div>

        <div>
          <p className="font-medium">6. Planned payment</p>
          <p className="text-muted-foreground">
            The total amount Burrows would actually remit to JIMACO that month ={' '}
            <span className="font-mono">estimated purchases + agency fee + interest + extra paydown</span>. This
            keeps the balance from the new month's trading "square" while applying the extra paydown directly
            against the existing balance.
          </p>
        </div>

        <div>
          <p className="font-medium">Data sources</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            <li>Live JIMACO balance &amp; aging — Xero Accounts Payable (contact "1 - JIMACO")</li>
            <li>Sales targets — Burrows' 2026 monthly targets for Burrows Jewellers and Jewellery @ 65</li>
            <li>Actual sales — EdgePulse point-of-sale data for the same two stores</li>
            <li>JIMACO fee &amp; interest structure — Showcase Jewellers Group Member Trade Terms</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function PrintHeader({ data }) {
  return (
    <div className="hidden print:block print:mb-6">
      <h1 className="text-2xl font-bold">Burrows Jewellers — JIMACO / Showcase Payment Plan</h1>
      <p className="text-sm text-muted-foreground">
        Prepared {dateOnly.format(new Date(data.generatedAt))} — covering {data.projection[0]?.monthName} to
        December {data.year}
      </p>
    </div>
  );
}

export default function ShowcaseDebtReduction() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  const [planData, setPlanData] = useState(null);
  const [months, setMonths] = useState([]);
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState(null);
  const [saving, setSaving] = useState(false);
  const saveTimers = useRef({});

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get('/xero/status');
      setStatus(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPlan = useCallback(async () => {
    setPlanLoading(true);
    setPlanError(null);
    try {
      const { data } = await apiClient.get('/jimaco/payment-plan');
      setPlanData(data);
      setMonths(data.projection);
    } catch (err) {
      setPlanError(err.response?.data?.error || err.message);
    } finally {
      setPlanLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (status?.connected) {
      loadPlan();
    }
  }, [status, loadPlan]);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const { data } = await apiClient.get('/xero/connect');
      window.location.href = data.url;
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setConnecting(false);
    }
  };

  const handleChangeExtraPaydown = (month, value) => {
    if (!isFinite(value) || value < 0) return;

    setMonths((prev) => {
      const updated = prev.map((m) => (m.month === month ? { ...m, extraPaydown: value } : m));
      return recomputeProjection(updated, planData.assumptions);
    });

    clearTimeout(saveTimers.current[month]);
    saveTimers.current[month] = setTimeout(async () => {
      setSaving(true);
      try {
        await apiClient.put(`/jimaco/payment-plan/${planData.year}/${month}`, { extraPaydown: value });
      } catch (err) {
        setPlanError(err.response?.data?.error || err.message);
      } finally {
        setSaving(false);
      }
    }, 600);
  };

  const handlePrint = () => window.print();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4 no-print">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Showcase Debt Reduction</h2>
          <p className="text-sm text-muted-foreground">
            Burrows' plan to pay down its balance with 1 - JIMACO (Showcase), based on live Xero data and 2026 sales
            targets.
          </p>
        </div>
        {status?.connected && planData && (
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="size-4" />
            Print / export plan
          </Button>
        )}
      </div>

      <Card className="no-print">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="size-5" />
            Xero connection
          </CardTitle>
          <CardDescription>
            One-time admin authorisation required to let the dashboard read JIMACO's balance from Xero.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Checking connection status…
            </div>
          ) : status?.connected ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-4 text-green-600" />
                <span>
                  Connected to <strong>{status.tenantName || 'Xero organisation'}</strong>
                  {status.lastUpdated && (
                    <span className="text-muted-foreground">
                      {' '}
                      — last refreshed {dateTime.format(new Date(status.lastUpdated))}
                    </span>
                  )}
                </span>
              </div>
              <div>
                <Button variant="outline" size="sm" onClick={handleConnect} disabled={connecting}>
                  {connecting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Redirecting…
                    </>
                  ) : (
                    'Reconnect / update permissions'
                  )}
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use this if Xero permissions have changed (e.g. new data was enabled) and need re-authorising.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Xero is not connected yet. Click below to sign in to Xero and authorise this dashboard (read-only
                access to contacts, reports and transactions).
              </p>
              <div>
                <Button onClick={handleConnect} disabled={connecting}>
                  {connecting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Redirecting…
                    </>
                  ) : (
                    'Connect to Xero'
                  )}
                </Button>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {status?.connected && (
        <div className="print-area flex flex-col gap-6">
          {planLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading JIMACO position and payment plan…
            </div>
          ) : planError ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{planError}</span>
            </div>
          ) : (
            planData && (
              <>
                <PrintHeader data={planData} />
                <PositionSummary data={planData} />
                <YearToDate data={{ ...planData, projection: months }} />
                <PaymentPlan data={planData} months={months} onChangeExtraPaydown={handleChangeExtraPaydown} saving={saving} />
                <Methodology data={planData} />
              </>
            )
          )}
        </div>
      )}

      {status?.connected === false && (
        <Badge variant="outline" className="w-fit text-muted-foreground">
          Connect to Xero above to load the JIMACO payment plan.
        </Badge>
      )}
    </div>
  );
}
