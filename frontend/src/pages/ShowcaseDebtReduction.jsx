// Showcase Debt Reduction — connects to Xero (the OpenClaw "Web app") to
// pull accounting data relevant to showcase/consignment debt.
//
// Phase 1: one-time OAuth connection. Once connected, the actual debt
// reduction reporting will be added here.

import { useCallback, useEffect, useState } from 'react';
import { Link2, Loader2, CheckCircle2, AlertCircle, TrendingDown, CreditCard } from 'lucide-react';
import apiClient from '../api/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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

const currency = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

function SupplierDebtCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get('/xero/supplier-debt');
      setData(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingDown className="size-5" />
          Supplier Debt (Accounts Payable)
        </CardTitle>
        <CardDescription>
          Outstanding balances owed to suppliers, from Xero — sorted by amount owed.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading supplier balances…
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border bg-card px-4 py-3">
                <p className="text-sm text-muted-foreground">Total owed to suppliers</p>
                <p className="text-2xl font-semibold tracking-tight">{currency.format(data.totalOutstanding)}</p>
              </div>
              <div className="rounded-lg border bg-card px-4 py-3">
                <p className="text-sm text-muted-foreground">Of which overdue</p>
                <p className="text-2xl font-semibold tracking-tight text-destructive">
                  {currency.format(data.totalOverdue)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Supplier</th>
                    <th className="px-3 py-2 text-right font-medium">Outstanding</th>
                    <th className="px-3 py-2 text-right font-medium">Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.suppliers.map((s) => (
                    <tr key={s.contactId} className="border-t">
                      <td className="px-3 py-2">{s.name}</td>
                      <td className="px-3 py-2 text-right">{currency.format(s.outstanding)}</td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right',
                          s.overdue > 0 && 'text-destructive font-medium'
                        )}
                      >
                        {s.overdue > 0 ? currency.format(s.overdue) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground">
              Generated {dateTime.format(new Date(data.generatedAt))} from Xero Accounts Payable balances.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CardBalancesCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get('/xero/card-balances');
      setData(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="size-5" />
          Card & Bank Account Balances
        </CardTitle>
        <CardDescription>
          Credit cards and bank accounts that are currently in debit, from Xero's Balance Sheet.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading account balances…
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <>
            <div className="rounded-lg border bg-card px-4 py-3">
              <p className="text-sm text-muted-foreground">Total owed across cards & accounts</p>
              <p className="text-2xl font-semibold tracking-tight">{currency.format(data.totalOwed)}</p>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Account</th>
                    <th className="px-3 py-2 text-right font-medium">Owed</th>
                    <th className="px-3 py-2 text-right font-medium">In credit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cards.map((c) => (
                    <tr key={c.name} className="border-t">
                      <td className="px-3 py-2">{c.name}</td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right',
                          c.owed > 0 && 'text-destructive font-medium'
                        )}
                      >
                        {c.owed > 0 ? currency.format(c.owed) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {c.inCredit > 0 ? currency.format(c.inCredit) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground">
              As at {data.asAt} — generated {dateTime.format(new Date(data.generatedAt))} from Xero's Balance Sheet report.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function ShowcaseDebtReduction() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

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

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Showcase Debt Reduction</h2>
        <p className="text-sm text-muted-foreground">
          Connects to Xero to track showcase/consignment debt and support reduction reporting.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="size-5" />
            Xero connection
          </CardTitle>
          <CardDescription>
            One-time admin authorisation required to let the dashboard read accounting data from Xero.
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
                Xero is not connected yet. Click below to sign in to Xero and authorise this dashboard
                (read-only access to contacts, reports and transactions).
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
        <>
          <SupplierDebtCard />
          <CardBalancesCard />
        </>
      )}
    </div>
  );
}
