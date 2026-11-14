import { useCallback, useEffect, useState } from 'react';
import { LuCheck, LuLaptop, LuLoaderCircle, LuLogOut } from 'react-icons/lu';
import { Card, ErrorNote, Loading, Page, Pill, ReloadButton } from '../../components/platform/ui.jsx';
import { platformApi, platformErrorMessage } from '../../lib/platformApi.js';
import { ROLE_LABEL, sinceNow, whenExact } from '../../lib/platformFormat.js';
import { usePlatformAuthStore } from '../../store/platformAuthStore.js';

/*
 * Your own login: name, email, password, and the devices it is signed in on.
 *
 * Email and password each ask for the current password again. The token in memory is up to
 * thirty minutes old, so "already signed in" is a weaker claim than "knows the password right
 * now" -- and a laptop left open is the ordinary way one of these accounts gets taken.
 */

export default function PlatformAccountPage() {
  const admin = usePlatformAuthStore((s) => s.admin);
  const setAdmin = usePlatformAuthStore((s) => s.setAdmin);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [email, setEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [savingPassword, setSavingPassword] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await platformApi.get('/account');
      setData(response.data);
      setName(response.data.admin.name ?? '');
      setPhone(response.data.admin.phone ?? '');
      setEmail(response.data.admin.email ?? '');
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not load your account.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A confirmation that clears itself, so the page does not accumulate green ticks.
  useEffect(() => {
    if (!done) return undefined;
    const timer = setTimeout(() => setDone(null), 4000);
    return () => clearTimeout(timer);
  }, [done]);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    setError(null);
    try {
      const response = await platformApi.patch('/account', { name: name.trim(), phone: phone.trim() });
      setAdmin?.(response.data.admin);
      setDone('Your details are saved.');
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not save your details.'));
    } finally {
      setSavingProfile(false);
    }
  };

  const saveEmail = async (event) => {
    event.preventDefault();
    setSavingEmail(true);
    setError(null);
    try {
      const response = await platformApi.post('/account/email', {
        email: email.trim(),
        currentPassword: emailPassword,
      });
      setAdmin?.(response.data.admin);
      setEmailPassword('');
      setDone('Your email address is changed. Use it next time you sign in.');
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not change your email.'));
    } finally {
      setSavingEmail(false);
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('The two new passwords do not match.');
      return;
    }
    setSavingPassword(true);
    setError(null);
    try {
      const response = await platformApi.post('/account/password', {
        currentPassword,
        newPassword,
        signOutOthers,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setDone(
        response.data.signedOutOtherDevices
          ? 'Your password is changed and your other devices have been signed out.'
          : 'Your password is changed.',
      );
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not change your password.'));
    } finally {
      setSavingPassword(false);
    }
  };

  const signOutDevice = async (id) => {
    setError(null);
    try {
      await platformApi.delete(`/account/sessions/${id}`);
      setDone('That device has been signed out.');
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not sign that device out.'));
    }
  };

  if (loading && !data) return <Loading what="Loading your account" />;

  // Mirrors the server rule so the person is told before the round trip, not after.
  const strong =
    newPassword.length >= 12 &&
    /[a-z]/.test(newPassword) &&
    /[A-Z]/.test(newPassword) &&
    /\d/.test(newPassword);

  return (
    <Page
      title="Your account"
      subtitle={`${admin?.email ?? ''} · ${ROLE_LABEL[admin?.role] ?? admin?.role ?? ''}`}
      actions={<ReloadButton onClick={load} busy={loading} />}
    >
      {done ? (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-body text-emerald-800">
          <LuCheck size={16} aria-hidden />
          {done}
        </p>
      ) : null}

      <ErrorNote message={error} />

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-h2 font-bold text-slate-900">Your details</h2>
        <form onSubmit={saveProfile} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-desc font-semibold text-slate-500">Name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-2.5 text-body text-slate-900 focus:border-brand focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-desc font-semibold text-slate-500">Phone</span>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Optional"
              className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-2.5 text-body text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={savingProfile || !name.trim()}
              className="flex h-11 items-center gap-2 rounded-lg bg-brand px-4 text-body font-bold text-ink transition hover:bg-brand-700 disabled:opacity-40"
            >
              {savingProfile ? <LuLoaderCircle className="animate-spin" size={16} aria-hidden /> : null}
              Save details
            </button>
          </div>
        </form>
      </section>

      <section className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-h2 font-bold text-slate-900">Email address</h2>
        <p className="mt-0.5 text-desc text-slate-500">
          This is what you sign in with, so changing it needs your password.
        </p>
        <form onSubmit={saveEmail} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-desc font-semibold text-slate-500">New email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-2.5 text-body text-slate-900 focus:border-brand focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-desc font-semibold text-slate-500">Your current password</span>
            <input
              type="password"
              value={emailPassword}
              onChange={(event) => setEmailPassword(event.target.value)}
              autoComplete="current-password"
              className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-2.5 text-body text-slate-900 focus:border-brand focus:outline-none"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={
                savingEmail || !emailPassword || !email.trim() || email.trim() === data?.admin?.email
              }
              className="flex h-11 items-center gap-2 rounded-lg bg-brand px-4 text-body font-bold text-ink transition hover:bg-brand-700 disabled:opacity-40"
            >
              {savingEmail ? <LuLoaderCircle className="animate-spin" size={16} aria-hidden /> : null}
              Change email
            </button>
          </div>
        </form>
      </section>

      <section className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-h2 font-bold text-slate-900">Password</h2>
        <p className="mt-0.5 text-desc text-slate-500">
          Last changed {sinceNow(data?.passwordSetAt)}.
        </p>
        <form onSubmit={savePassword} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-desc font-semibold text-slate-500">Current password</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-2.5 text-body text-slate-900 focus:border-brand focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-desc font-semibold text-slate-500">New password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-2.5 text-body text-slate-900 focus:border-brand focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-desc font-semibold text-slate-500">New password again</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              className={`mt-1 h-11 w-full rounded-lg border px-2.5 text-body text-slate-900 focus:outline-none ${
                confirmPassword && confirmPassword !== newPassword
                  ? 'border-rose-400'
                  : 'border-slate-200 focus:border-brand'
              }`}
            />
          </label>

          <p className="text-desc text-slate-500 sm:col-span-2">
            {newPassword && !strong
              ? 'At least 12 characters, with a capital, a lower-case letter and a digit.'
              : confirmPassword && confirmPassword !== newPassword
                ? 'The two new passwords do not match.'
                : 'At least 12 characters, with a capital, a lower-case letter and a digit.'}
          </p>

          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={signOutOthers}
              onChange={(event) => setSignOutOthers(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-brand"
            />
            <span className="text-body text-slate-600">
              Sign out my other devices (recommended if this password was shared)
            </span>
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={
                savingPassword || !currentPassword || !strong || newPassword !== confirmPassword
              }
              className="flex h-11 items-center gap-2 rounded-lg bg-brand px-4 text-body font-bold text-ink transition hover:bg-brand-700 disabled:opacity-40"
            >
              {savingPassword ? <LuLoaderCircle className="animate-spin" size={16} aria-hidden /> : null}
              Change password
            </button>
          </div>
        </form>
      </section>

      <section className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-h2 font-bold text-slate-900">Where you are signed in</h2>
        <ul className="mt-2 divide-y divide-slate-100">
          {(data?.sessions ?? []).map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <LuLaptop size={16} className="shrink-0 text-slate-400" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body text-slate-800">
                  {s.userAgent || 'Unknown device'}
                  {s.current ? <Pill className="ml-2 bg-emerald-50 text-emerald-700">this device</Pill> : null}
                </p>
                <p className="text-desc text-slate-400" title={whenExact(s.createdAt)}>
                  {s.ip ? `${s.ip} · ` : ''}signed in {sinceNow(s.createdAt)}
                </p>
              </div>
              {!s.current ? (
                <button
                  type="button"
                  onClick={() => signOutDevice(s.id)}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-desc font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  <LuLogOut size={13} aria-hidden />
                  Sign out
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </Page>
  );
}
