import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { LuPlug, LuPrinter, LuScale, LuUnplug, LuUserPlus } from 'react-icons/lu';
import { SyncPill } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Spinner } from '../components/ui/States';
import { useApiQuery } from '../hooks/useApiQuery';
import { api, errorMessage } from '../lib/api';
import { terminalId } from '../lib/ids';
import { useCatalogStore } from '../store/catalogStore';
import { useHardwareStore } from '../store/hardwareStore';
import { toast } from '../store/toastStore';

function Section({ title, description, children }) {
  return (
    <section className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-slate-900/[0.03] sm:p-5">
      <h2>{title}</h2>
      {description ? <p className="mt-0.5 text-desc text-slate-500">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function UserDialog({ open, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'CASHIER' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setForm({ name: '', email: '', password: '', role: 'CASHIER' });
      setError(null);
    }
  }, [open]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post('/users', form);
      toast.success(`${form.name} can now sign in`);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Add a team member"
      footer={
        <Button className="w-full" onClick={save} loading={saving} disabled={!form.name || !form.email || form.password.length < 8}>
          Create account
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="u-name" className="label">Name</label>
          <input id="u-name" className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label htmlFor="u-email" className="label">Email</label>
          <input id="u-email" type="email" className="field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label htmlFor="u-password" className="label">Temporary password</label>
          <input id="u-password" className="field" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" />
        </div>
        <div>
          <label htmlFor="u-role" className="label">Role</label>
          <select id="u-role" className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="CASHIER">Cashier — register only</option>
            <option value="ADMIN">Admin — full access</option>
          </select>
        </div>
        {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-desc text-rose-700" role="alert">{error}</p> : null}
      </div>
    </Modal>
  );
}

export default function SettingsPage() {
  const { openSync } = useOutletContext();
  const { settings, load } = useCatalogStore();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [addingUser, setAddingUser] = useState(false);
  const users = useApiQuery('/users', null);
  const { serialSupported, scale, printer, connectScale, disconnectScale, connectPrinter, disconnectPrinter } = useHardwareStore();

  useEffect(() => {
    if (settings && !form) setForm({ ...settings });
  }, [settings, form]);

  if (!form) return <Spinner label="Loading settings" />;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put('/settings', {
        ...form,
        taxRate: Number(form.taxRate),
        maxCashierDiscountPct: Number(form.maxCashierDiscountPct),
      });
      await load({ silent: true });
      toast.success('Store details saved');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleRole = async (user) => {
    try {
      await api.patch(`/users/${user.id}`, { role: user.role === 'ADMIN' ? 'CASHIER' : 'ADMIN' });
      users.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const toggleActive = async (user) => {
    try {
      await api.patch(`/users/${user.id}`, { isActive: !user.isActive });
      users.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-slate-50/85 px-4 pb-3 pt-4 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1>Settings</h1>
            <p className="truncate text-desc text-slate-500">Register {terminalId()}</p>
          </div>
          <SyncPill onClick={openSync} />
          <Button size="sm" onClick={save} loading={saving}>
            Save changes
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 px-4 py-4 sm:px-6">
        <Section title="Store details" description="Printed on every receipt">
          <div className="space-y-4">
            <div>
              <label htmlFor="s-name" className="label">Store name</label>
              <input id="s-name" className="field" value={form.storeName ?? ''} onChange={set('storeName')} maxLength={80} />
            </div>
            <div>
              <label htmlFor="s-tagline" className="label">Tagline</label>
              <input id="s-tagline" className="field" value={form.tagline ?? ''} onChange={set('tagline')} maxLength={120} />
            </div>
            <div>
              <label htmlFor="s-address" className="label">Address</label>
              <input id="s-address" className="field" value={form.address ?? ''} onChange={set('address')} maxLength={250} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="s-phone" className="label">Phone</label>
                <input id="s-phone" className="field" value={form.phone ?? ''} onChange={set('phone')} maxLength={20} />
              </div>
              <div>
                <label htmlFor="s-gstin" className="label">GSTIN</label>
                <input id="s-gstin" className="field tabular" value={form.gstin ?? ''} onChange={set('gstin')} placeholder="29ABCDE1234F1Z5" maxLength={15} />
              </div>
            </div>
            <div>
              <label htmlFor="s-footer" className="label">Receipt footer</label>
              <input id="s-footer" className="field" value={form.receiptFooter ?? ''} onChange={set('receiptFooter')} maxLength={200} />
            </div>
          </div>
        </Section>

        <Section title="Payments and tax" description="Used to calculate bills and build the UPI QR code">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="s-upi" className="label">UPI ID</label>
              <input id="s-upi" className="field" value={form.upiVpa ?? ''} onChange={set('upiVpa')} placeholder="store@bank" />
            </div>
            <div>
              <label htmlFor="s-payee" className="label">Payee name shown in UPI apps</label>
              <input id="s-payee" className="field" value={form.upiPayeeName ?? ''} onChange={set('upiPayeeName')} maxLength={60} />
            </div>
            <div>
              <label htmlFor="s-tax" className="label">GST rate (%)</label>
              <input id="s-tax" inputMode="decimal" className="field tabular" value={form.taxRate ?? ''} onChange={set('taxRate')} />
            </div>
            <div>
              <label htmlFor="s-cap" className="label">Cashier discount limit (%)</label>
              <input id="s-cap" inputMode="decimal" className="field tabular" value={form.maxCashierDiscountPct ?? ''} onChange={set('maxCashierDiscountPct')} />
            </div>
          </div>
          {error ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-desc text-rose-700" role="alert">{error}</p> : null}
        </Section>

        <Section title="Hardware on this register" description="Connections are per device and stay until you close the browser">
          <div className="space-y-2">
            {[
              { label: 'Weighing scale', icon: LuScale, state: scale, connect: connectScale, disconnect: disconnectScale, hint: 'Reads live weight over USB or RS-232' },
              { label: 'Receipt printer', icon: LuPrinter, state: printer, connect: connectPrinter, disconnect: disconnectPrinter, hint: 'Prints 80 mm ESC/POS receipts' },
            ].map(({ label, icon: Icon, state, connect, disconnect, hint }) => (
              <div key={label} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
                <Icon className="shrink-0 text-slate-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{label}</p>
                  <p className="truncate text-desc text-slate-500">{state.status === 'connected' ? 'Connected' : state.error || hint}</p>
                </div>
                {state.status === 'connected' ? (
                  <Button size="sm" variant="secondary" onClick={disconnect}>
                    <LuUnplug aria-hidden /> Disconnect
                  </Button>
                ) : (
                  <Button size="sm" variant="soft" onClick={() => connect()} disabled={!serialSupported}>
                    <LuPlug aria-hidden /> Connect
                  </Button>
                )}
              </div>
            ))}
            {!serialSupported ? <p className="text-desc text-slate-500">Hardware connections need Chrome or Edge on a computer. You can still print receipts from the browser print dialog.</p> : null}
          </div>
        </Section>

        <Section title="Team" description="Cashiers can use the register. Admins also see reports, inventory and settings.">
          <div className="mb-3 flex justify-end">
            <Button size="sm" variant="soft" onClick={() => setAddingUser(true)}>
              <LuUserPlus aria-hidden /> Add member
            </Button>
          </div>
          {users.loading && !users.data ? <Spinner /> : null}
          <ul className="divide-y divide-slate-100">
            {(users.data?.users ?? []).map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {u.name}
                    {!u.isActive ? <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-desc text-slate-500">Deactivated</span> : null}
                  </p>
                  <p className="truncate text-desc text-slate-500">{u.email}</p>
                </div>
                <button type="button" onClick={() => toggleRole(u)} className={`rounded-full px-2.5 py-1 text-desc font-medium ${u.role === 'ADMIN' ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
                  {u.role === 'ADMIN' ? 'Admin' : 'Cashier'}
                </button>
                <Button size="sm" variant="ghost" onClick={() => toggleActive(u)}>
                  {u.isActive ? 'Deactivate' : 'Restore'}
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <UserDialog open={addingUser} onClose={() => setAddingUser(false)} onSaved={users.refetch} />
    </div>
  );
}
