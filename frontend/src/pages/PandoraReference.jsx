// Pandora Reference — Phase 2.
//
// Manages a standalone reference copy of Pandora's "build to level" /
// discontinued master list, imported from a CSV the supplier periodically
// provides. This data lives in its own database (pandora_reference) with
// NO relationship to burrows_jewellers — it's purely a reference staff can
// compare our actual inventory against (matched up later by Design Number).
// The future Pandora Ordering and Pandora Discontinued tools will both
// build on top of this imported data.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PackageSearch,
  Upload,
  Boxes,
  Ban,
  CheckCircle2,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import apiClient from '../api/client';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

const number = new Intl.NumberFormat('en-AU');
const dateTime = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function StatBox({ icon: Icon, label, value, accent }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          accent || 'bg-primary/10 text-primary'
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold leading-tight">{value}</p>
      </div>
    </div>
  );
}

function ImportCard({ onImported }) {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [lastImport, setLastImport] = useState(null);

  const refreshLastImport = useCallback(() => {
    apiClient
      .get('/pandora/imports?limit=1')
      .then((res) => setLastImport(res.data.imports?.[0] || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshLastImport();
  }, [refreshLastImport]);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    setFileName(file ? file.name : '');
    setResult(null);
    setError(null);
  }

  async function handleImport() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError('Choose a CSV file first.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiClient.post('/pandora/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data.import);
      refreshLastImport();
      onImported?.();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Import Master List</CardTitle>
          <CardDescription>
            Upload the latest Pandora build-to-level / discontinued CSV. Re-importing only
            changes rows that differ — existing data is safely synced, not replaced.
          </CardDescription>
        </div>
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Upload className="size-4" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pandora-csv">CSV file</Label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              id="pandora-csv"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="block text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/80"
            />
            <Button onClick={handleImport} disabled={busy || !fileName} size="sm">
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Importing…
                </>
              ) : (
                <>
                  <Upload className="size-4" /> Import
                </>
              )}
            </Button>
          </div>
        </div>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        {result && (
          <div className="flex items-start gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <p>
              Imported <strong>{result.filename}</strong> — {number.format(result.rowsTotal)} rows total:{' '}
              <strong>{number.format(result.rowsInserted)}</strong> new,{' '}
              <strong>{number.format(result.rowsUpdated)}</strong> updated,{' '}
              <strong>{number.format(result.rowsUnchanged)}</strong> unchanged.
            </p>
          </div>
        )}

        <Separator />

        <p className="text-xs text-muted-foreground">
          {lastImport
            ? (
              <>Last import: <strong>{lastImport.filename}</strong> on {dateTime.format(new Date(lastImport.importedAt))}</>
            )
            : 'No imports yet — upload a CSV to populate the reference list.'}
        </p>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ summary, loading }) {
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading summary…
        </CardContent>
      </Card>
    );
  }

  if (!summary || summary.totalItems === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
          <PackageSearch className="size-6" />
          <p>No reference data yet — import a CSV to get started.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatBox icon={Boxes} label="Total Designs" value={number.format(summary.totalItems)} />
      <StatBox
        icon={CheckCircle2}
        label="Active"
        value={number.format(summary.activeCount)}
        accent="bg-green-100 text-green-700"
      />
      <StatBox
        icon={Ban}
        label="Discontinued"
        value={number.format(summary.discontinuedCount)}
        accent="bg-red-100 text-red-700"
      />
      <StatBox
        icon={PackageSearch}
        label="Total Build-to-Level"
        value={number.format(summary.totalBuildToLevel)}
      />
    </div>
  );
}

function StatusBadge({ status }) {
  return status === 'discontinued' ? (
    <Badge variant="destructive">Discontinued</Badge>
  ) : (
    <Badge variant="success">Active</Badge>
  );
}

function BrowseCard({ summary }) {
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Reset to page 1 whenever filters change.
  useEffect(() => {
    setPage(1);
  }, [search, department, status]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = { page, pageSize: 20 };
    if (search.trim()) params.search = search.trim();
    if (department) params.department = department;
    if (status) params.status = status;

    const handle = setTimeout(() => {
      apiClient
        .get('/pandora/items', { params })
        .then((res) => setData(res.data))
        .catch((err) => setError(err.response?.data?.error || err.message))
        .finally(() => setLoading(false));
    }, 250); // debounce search typing

    return () => clearTimeout(handle);
  }, [search, department, status, page]);

  const departments = summary?.departments || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Master List</CardTitle>
        <CardDescription>Search and filter the imported Pandora reference data.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
            <Label htmlFor="search">Search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Design number or description…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="department">Department</Label>
            <select
              id="department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="flex h-9 w-44 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.department} value={d.department}>
                  {d.department} ({number.format(d.itemCount)})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="flex h-9 w-40 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="discontinued">Discontinued</option>
            </select>
          </div>
        </div>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">Error: {error}</p>
        )}

        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Design #</th>
                <th className="px-3 py-2 text-left font-medium">Department</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">Build-to-Level</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-4 animate-spin" />
                  </td>
                </tr>
              )}
              {!loading && data?.items?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    No matching items.
                  </td>
                </tr>
              )}
              {!loading &&
                data?.items?.map((item) => (
                  <tr key={item.designNum} className="hover:bg-muted/40">
                    <td className="px-3 py-2 font-mono text-xs font-medium">{item.designNum}</td>
                    <td className="px-3 py-2">{item.department || '—'}</td>
                    <td className="max-w-xs truncate px-3 py-2 text-muted-foreground" title={item.description || ''}>
                      {item.description || '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{item.buildToLevel}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={item.status} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {data && data.total > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Showing {(data.page - 1) * data.pageSize + 1}–
              {Math.min(data.page * data.pageSize, data.total)} of {number.format(data.total)}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={data.page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
              >
                <ChevronLeft className="size-4" /> Prev
              </Button>
              <span className="tabular-nums">
                Page {data.page} / {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={data.page >= data.totalPages}
                onClick={() => setPage((p) => Math.min(p + 1, data.totalPages))}
              >
                Next <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PandoraReference() {
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const loadSummary = useCallback(() => {
    setSummaryLoading(true);
    apiClient
      .get('/pandora/summary')
      .then((res) => setSummary(res.data))
      .catch(() => setSummary(null))
      .finally(() => setSummaryLoading(false));
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Pandora Reference</h2>
        <p className="text-sm text-muted-foreground">
          A standalone reference list of Pandora's build-to-levels and discontinued designs —
          imported from CSV and matched against our inventory by Design Number. This data lives
          in its own database, separate from the main store data.
        </p>
      </div>

      <SummaryCard summary={summary} loading={summaryLoading} />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr] lg:items-start">
        <ImportCard onImported={loadSummary} />
        <BrowseCard summary={summary} />
      </div>
    </div>
  );
}
