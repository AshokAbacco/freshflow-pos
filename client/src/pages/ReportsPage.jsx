import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { SyncPill } from '../components/layout/AppShell';
import { CategoryDensityChart } from '../components/charts/CategoryDensityChart';
import { SplitBar } from '../components/charts/SplitBar';
import { TrendChart } from '../components/charts/TrendChart';
import { KpiCard } from '../components/reports/KpiCard';
import { ProductPerformance } from '../components/reports/ProductPerformance';
import { RangePicker } from '../components/reports/RangePicker';
import { TransactionLedger } from '../components/reports/TransactionLedger';
import { Segmented } from '../components/ui/Segmented';
import { ErrorState, Skeleton } from '../components/ui/States';
import { useApiQuery } from '../hooks/useApiQuery';
import { describeRange, presetRange } from '../lib/dates';
import { formatMoney, formatNumber } from '../lib/format';
import { useCatalogStore } from '../store/catalogStore';

export default function ReportsPage() {
  const { openSync } = useOutletContext();
  const settings = useCatalogStore((s) => s.settings);
  const currency = settings?.currency || 'INR';
  const [range, setRange] = useState(() => presetRange('today'));
  const [level, setLevel] = useState('leaf');

  const overview = useApiQuery('/reports/overview', range);
  const categories = useApiQuery('/reports/categories', { ...range, level });

  const k = overview.data?.kpis;
  const inv = overview.data?.inventory;

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-slate-50/85 px-4 pb-3 pt-4 backdrop-blur-xl sm:px-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1>Daily business</h1>
            <p className="truncate text-desc text-slate-500">
              {describeRange(range.from, range.to)}
              {overview.data ? `, compared with the ${overview.data.period.days} day${overview.data.period.days === 1 ? '' : 's'} before` : ''}
            </p>
          </div>
          <SyncPill onClick={openSync} />
        </div>
        <div className="mt-3">
          <RangePicker range={range} onChange={setRange} />
        </div>
      </header>

      <div className="space-y-4 px-4 py-4 sm:px-6">
        {overview.error ? <ErrorState message={overview.error} onRetry={overview.refetch} /> : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {overview.loading && !k
            ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[104px] rounded-3xl" />)
            : k
              ? [
                  <KpiCard key="rev" label="Revenue" value={formatMoney(k.current.revenue, currency)} current={k.current.revenue} previous={k.previous.revenue} hint={`${k.current.orders} bills`} />,
                  <KpiCard key="bask" label="Average bill" value={formatMoney(k.current.avgBasket, currency)} current={k.current.avgBasket} previous={k.previous.avgBasket} />,
                  <KpiCard
                    key="items"
                    label="Items sold"
                    value={k.current.units ? formatNumber(k.current.units) : `${formatNumber(k.current.weightKg)} kg`}
                    current={k.current.units + k.current.weightKg}
                    previous={k.previous.units + k.previous.weightKg}
                    hint={
                      k.current.units && k.current.weightKg
                        ? `+ ${formatNumber(k.current.weightKg)} kg loose`
                        : k.current.units
                          ? 'packed items'
                          : 'loose produce'
                    }
                  />,
                  <KpiCard key="disc" label="Discounts given" value={formatMoney(k.current.discounts, currency)} current={k.current.discounts} previous={k.previous.discounts} invertColors hint="passed to customers" />,
                ]
              : null}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <section className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-slate-900/[0.03] sm:p-5">
            <h2>Revenue</h2>
            <p className="text-desc text-slate-500">Green is this period, grey is the one before</p>
            <div className="mt-3">
              {overview.data ? (
                <TrendChart current={overview.data.series.current} previous={overview.data.series.previous} currency={currency} />
              ) : (
                <Skeleton className="h-[200px]" />
              )}
            </div>
          </section>

          <div className="space-y-4">
            <section className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-slate-900/[0.03] sm:p-5">
              <h2>How customers paid</h2>
              <div className="mt-3">{overview.data ? <SplitBar data={overview.data.paymentSplit.current} currency={currency} /> : <Skeleton className="h-[120px]" />}</div>
            </section>

            <section className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-slate-900/[0.03] sm:p-5">
              <h2>Stock on hand</h2>
              {inv ? (
                <>
                  <p className="mt-1 text-h1 font-bold tabular">{formatMoney(inv.value, currency)}</p>
                  <p className="text-desc text-slate-500">across {formatNumber(inv.skus)} products</p>
                  <div className="mt-3 flex gap-2">
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-desc font-medium text-amber-700 tabular">{inv.lowStock} running low</span>
                    <span className="rounded-full bg-rose-50 px-2.5 py-1 text-desc font-medium text-rose-700 tabular">{inv.outOfStock} out of stock</span>
                  </div>
                </>
              ) : (
                <Skeleton className="mt-2 h-[92px]" />
              )}
            </section>
          </div>
        </div>

        <section className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-slate-900/[0.03] sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1">
              <h2>Categories</h2>
              <p className="text-desc text-slate-500">
                {categories.data ? `${formatNumber(categories.data.rows.length)} categories tracked` : 'Loading categories'}
              </p>
            </div>
            <Segmented
              size="sm"
              ariaLabel="Category level"
              value={level}
              onChange={setLevel}
              options={[
                { value: 'leaf', label: 'Detailed' },
                { value: 'top', label: 'Departments' },
              ]}
            />
          </div>
          <div className="mt-4">
            {categories.error ? <ErrorState message={categories.error} onRetry={categories.refetch} /> : null}
            {categories.data ? <CategoryDensityChart rows={categories.data.rows} currency={currency} /> : <Skeleton className="h-[240px]" />}
          </div>
        </section>

        <ProductPerformance range={range} currency={currency} />
        <TransactionLedger range={range} currency={currency} />
      </div>
    </div>
  );
}
