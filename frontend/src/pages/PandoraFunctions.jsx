// Pandora Functions (formerly "Pandora Ordering", and before that "Pandora
// Reference") — the single home for every Pandora-related tool staff need.
//
// Manages a standalone reference copy of Pandora's "build to level" /
// discontinued master list, imported from a CSV the supplier periodically
// provides. This data lives in its own database (pandora_reference) with
// NO relationship to burrows_jewellers — it's purely a reference staff can
// compare our actual inventory against (matched up later by Design Number).
//
// The page's headline feature is the Reorder List: a live comparison of the
// master list's build-to-levels against our actual on-hand stock, showing
// exactly what to order today, with a one-click CSV export. The summary
// cards double as quick filters into a simple master-list view. Tucked into
// a single "Update list" control (with Update / Mark Discontinued tabs) are
// the two ways staff keep the master list current: refreshing it from
// Pandora's full CSV, or uploading a simple list of Design Numbers to flag
// designs as discontinued (any design not already on file gets added too,
// purely so we retain a record of it).
// (The placeholder "Pandora Ordering" and "Pandora Discontinued" nav entries
// that used to sit alongside this page have both been removed — every Pandora
// tool now lives here in one centralised tab.)

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PackageSearch,
  Upload,
  Boxes,
  Ban,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  X,
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
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const number = new Intl.NumberFormat('en-AU');
const currency = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const dateTime = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function StatusBadge({ status }) {
  return status === 'discontinued' ? (
    <Badge variant="destructive">Discontinued</Badge>
  ) : (
    <Badge variant="success">Active</Badge>
  );
}

// A summary stat — clickable when `onClick` is given, which opens the
// Master List panel pre-filtered to that status.
function StatBox({ icon: Icon, label, value, accent, active, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors',
        onClick && 'cursor-pointer hover:border-primary/40 hover:bg-accent/40',
        active && 'border-primary ring-1 ring-primary/30'
      )}
    >
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
    </Tag>
  );
}

function SummaryCards({ summary, loading, masterListFilter, onSelectFilter }) {
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
          <p>No reference data yet — use "Update list" to bring in the master CSV.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatBox
        icon={Boxes}
        label="Total Designs"
        value={number.format(summary.totalItems)}
        active={masterListFilter === ''}
        onClick={() => onSelectFilter('')}
      />
      <StatBox
        icon={CheckCircle2}
        label="Active"
        value={number.format(summary.activeCount)}
        accent="bg-green-100 text-green-700"
        active={masterListFilter === 'active'}
        onClick={() => onSelectFilter('active')}
      />
      <StatBox
        icon={Ban}
        label="Discontinued"
        value={number.format(summary.discontinuedCount)}
        accent="bg-red-100 text-red-700"
        active={masterListFilter === 'discontinued'}
        onClick={() => onSelectFilter('discontinued')}
      />
      <StatBox
        icon={PackageSearch}
        label="Total Build-to-Level"
        value={number.format(summary.totalBuildToLevel)}
      />
    </div>
  );
}

// Simple paginated view of the master list, locked to whichever status the
// user picked via the summary cards above (no extra search/filter controls
// needed — the card click *is* the filter).
function MasterListPanel({ filter, onClose }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = { page, pageSize: 20 };
    if (filter) params.status = filter;

    apiClient
      .get('/pandora/items', { params })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, [filter, page]);

  const titles = {
    '': 'All designs',
    active: 'Active designs',
    discontinued: 'Discontinued designs',
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Master List — {titles[filter] ?? 'All designs'}</CardTitle>
          <CardDescription>Click the same card again, or close, to dismiss this view.</CardDescription>
        </div>
        <Button variant="ghost" size="icon" className="size-8" onClick={onClose} title="Close">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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

// Small, low-key control for refreshing the master list when Pandora
// releases new designs or changes build-to-levels / discontinued status.
// This is an occasional admin task, not a day-to-day workflow, so it's
// tucked into a popover off a small button rather than a prominent card.
// Shared file-picker + submit button + result/last-run footer used by both
// modes of the Update List control below — only the copy, endpoint, and
// result wording differ between Update and Mark Discontinued.
function ImportPane({
  inputId,
  helpText,
  endpoint,
  importKind,
  submitLabel,
  busyLabel,
  submitIcon: SubmitIcon,
  submitVariant,
  lastRunLabel,
  noRunsLabel,
  renderResult,
  onUpdated,
}) {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [lastImport, setLastImport] = useState(null);

  const refreshLastImport = useCallback(() => {
    apiClient
      .get(`/pandora/imports?limit=1&kind=${importKind}`)
      .then((res) => setLastImport(res.data.imports?.[0] || null))
      .catch(() => {});
  }, [importKind]);

  useEffect(() => {
    refreshLastImport();
  }, [refreshLastImport]);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    setFileName(file ? file.name : '');
    setResult(null);
    setError(null);
  }

  async function handleSubmit() {
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
      const res = await apiClient.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data.import);
      refreshLastImport();
      onUpdated?.();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pt-3">
      <p className="text-xs text-muted-foreground">{helpText}</p>

      <div className="mt-3 flex flex-col gap-1.5">
        <Label htmlFor={inputId}>CSV file</Label>
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          className="block text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/80"
        />
      </div>

      <Button
        onClick={handleSubmit}
        disabled={busy || !fileName}
        size="sm"
        variant={submitVariant}
        className="mt-3 w-full"
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" /> {busyLabel}
          </>
        ) : (
          <>
            <SubmitIcon className="size-4" /> {submitLabel}
          </>
        )}
      </Button>

      {error && (
        <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
      )}

      {result && (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
          <p>{renderResult(result)}</p>
        </div>
      )}

      <Separator className="my-3" />

      <p className="text-xs text-muted-foreground">
        {lastImport ? (
          <>
            {lastRunLabel} <strong>{lastImport.filename}</strong> on{' '}
            {dateTime.format(new Date(lastImport.importedAt))}
          </>
        ) : (
          noRunsLabel
        )}
      </p>
    </div>
  );
}

// Combined "Update list" control — a single popover with two tabs/modes:
// refreshing the master list from Pandora's full CSV, or uploading a simple
// Design Number list to mark designs discontinued. Keeping both in one
// control centralises every Pandora master-list maintenance task in one place.
function UpdateListControl({ onUpdated }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
        <RefreshCw className="size-4" /> Update list
      </Button>

      {open && (
        <div className="absolute left-0 top-full z-10 mt-2 w-80 rounded-lg border bg-card p-4 shadow-lg">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Master List Tools</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Refresh the list from Pandora's CSV, or mark designs as
                discontinued — both matched and merged by Design Number.
              </p>
            </div>
            <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => setOpen(false)}>
              <X className="size-3.5" />
            </Button>
          </div>

          <Tabs defaultValue="update">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="update">Update</TabsTrigger>
              <TabsTrigger value="discontinue">Mark Discontinued</TabsTrigger>
            </TabsList>

            <TabsContent value="update">
              <ImportPane
                inputId="pandora-update-csv"
                helpText={`Upload a refreshed CSV when Pandora releases new designs or changes build-to-levels / status — matched and merged by Design Number, so only what's new or different gets touched.`}
                endpoint="/pandora/import"
                importKind="update"
                submitLabel="Update list"
                busyLabel="Updating…"
                submitIcon={Upload}
                lastRunLabel="Last updated:"
                noRunsLabel="No updates recorded yet."
                onUpdated={onUpdated}
                renderResult={(result) => (
                  <>
                    {number.format(result.rowsTotal)} rows checked —{' '}
                    <strong>{number.format(result.rowsInserted)}</strong> new,{' '}
                    <strong>{number.format(result.rowsUpdated)}</strong> updated,{' '}
                    <strong>{number.format(result.rowsUnchanged)}</strong> unchanged.
                  </>
                )}
              />
            </TabsContent>

            <TabsContent value="discontinue">
              <ImportPane
                inputId="pandora-discontinue-csv"
                helpText={`Upload a simple list of Design Numbers — one per row, or a Design# column — to mark those designs discontinued. Anything not already on the master list gets added too (build-to-level 0, status discontinued), so we keep a record of it even though we'll never reorder it.`}
                endpoint="/pandora/discontinue"
                importKind="discontinue"
                submitLabel="Mark discontinued"
                busyLabel="Marking…"
                submitIcon={Ban}
                submitVariant="destructive"
                lastRunLabel="Last run:"
                noRunsLabel="No discontinue uploads recorded yet."
                onUpdated={onUpdated}
                renderResult={(result) => (
                  <>
                    {number.format(result.rowsTotal)} design numbers checked —{' '}
                    <strong>{number.format(result.rowsInserted)}</strong> added as new records,{' '}
                    <strong>{number.format(result.rowsUpdated)}</strong> newly marked discontinued,{' '}
                    <strong>{number.format(result.rowsUnchanged)}</strong> already discontinued.
                  </>
                )}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

// The headline feature — compares the master list's build-to-levels
// against our actual on-hand stock (matched by Design Number) and shows
// exactly what should be ordered today, with a one-click CSV export in
// the supplier's order-sheet format (Item / Description / Quantity / Cost).
function ReorderCard({ summary }) {
  const [department, setDepartment] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  useEffect(() => {
    setPage(1);
  }, [department]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = { page, pageSize: 25 };
    if (department) params.department = department;

    apiClient
      .get('/pandora/reorder', { params })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, [department, page]);

  async function handleGenerateOrder() {
    setExporting(true);
    setExportError(null);
    try {
      const params = {};
      if (department) params.department = department;

      const res = await apiClient.get('/pandora/reorder/export', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const stamp = new Date().toISOString().slice(0, 10);
      const suffix = department ? `-${department.toLowerCase().replace(/\s+/g, '-')}` : '';

      const link = document.createElement('a');
      link.href = url;
      link.download = `pandora-reorder-${stamp}${suffix}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err.response?.data?.error || err.message);
    } finally {
      setExporting(false);
    }
  }

  const departments = summary?.departments || [];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Reorder List</CardTitle>
          <CardDescription>
            Active designs currently short of their Pandora build-to-level — what to order
            today, matched against our on-hand stock by Design Number.
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reorder-department">Department</Label>
            <select
              id="reorder-department"
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
          <Button size="sm" onClick={handleGenerateOrder} disabled={exporting || !data?.total}>
            {exporting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Download className="size-4" /> Generate Order (CSV)
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">Error: {error}</p>
        )}
        {exportError && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Export error: {exportError}
          </p>
        )}

        {data && data.total > 0 && (
          <p className="text-sm text-muted-foreground">
            <strong>{number.format(data.total)}</strong> design{data.total === 1 ? '' : 's'} need restocking
            {department ? (
              <>
                {' '}
                in <strong>{department}</strong>
              </>
            ) : null}{' '}
            — totalling <strong>{number.format(data.totalReorderQty)}</strong> units.
          </p>
        )}

        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Design #</th>
                <th className="px-3 py-2 text-left font-medium">Department</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">On Hand</th>
                <th className="px-3 py-2 text-right font-medium">Build-to-Level</th>
                <th className="px-3 py-2 text-right font-medium">Reorder Qty</th>
                <th className="px-3 py-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-4 animate-spin" />
                  </td>
                </tr>
              )}
              {!loading && data?.items?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    Nothing to reorder — every stocked design currently meets its build-to-level.
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
                    <td className="px-3 py-2 text-right tabular-nums">{item.onHand}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{item.buildToLevel}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-primary">
                      {item.reorderQty}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {item.cost !== null ? currency.format(item.cost) : '—'}
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

export default function PandoraFunctions() {
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  // null = master list panel closed; '' | 'active' | 'discontinued' = open & filtered
  const [masterListFilter, setMasterListFilter] = useState(null);

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

  function handleSelectFilter(value) {
    // Clicking the active card again closes the panel; otherwise switch to it.
    setMasterListFilter((current) => (current === value ? null : value));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Pandora Functions</h2>
          <p className="text-sm text-muted-foreground">
            Pandora's build-to-level / discontinued master list, matched against our actual
            inventory by Design Number. Lives in its own database, separate from the main store data.
          </p>
        </div>
        <UpdateListControl onUpdated={loadSummary} />
      </div>

      <SummaryCards
        summary={summary}
        loading={summaryLoading}
        masterListFilter={masterListFilter}
        onSelectFilter={handleSelectFilter}
      />

      {masterListFilter !== null && (
        <MasterListPanel filter={masterListFilter} onClose={() => setMasterListFilter(null)} />
      )}

      <ReorderCard summary={summary} />
    </div>
  );
}
