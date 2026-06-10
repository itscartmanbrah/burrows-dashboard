// Showcase Debt Reduction — connects to Xero (the OpenClaw "Web app") to
// pull accounting data relevant to showcase/consignment debt.
//
// Phase 1: one-time OAuth connection. Once connected, the actual debt
// reduction reporting will be added here.

import { useCallback, useEffect, useState } from 'react';
import { Link2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import apiClient from '../api/client';
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
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="font-medium">Debt reduction reporting coming soon</p>
            <p className="text-sm text-muted-foreground">
              Now that Xero is connected, the next step is to build the showcase/consignment debt views here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
