import { useCallback, useEffect, useState } from 'react';
import { LuCopy, LuKey, LuLogOut, LuUserPlus } from 'react-icons/lu';
import { Card, Empty, ErrorNote, Loading, Page, Pill, ReloadButton, Select } from '../../components/platform/ui.jsx';
import { platformApi, platformErrorMessage } from '../../lib/platformApi.js';
import { ROLE_LABEL, sinceNow, when } from '../../lib/platformFormat.js';
import { usePlatformAuthStore } from '../../store/platformAuthStore.js';

/*
 * Who works here and what they can reach.
 *
 * Nobody sets anybody else's password. A new account gets a one-time link and chooses its own,
 * which is why invites and resets hand back a link to pass on rather than quietly emailing
 * something: no mail provider is wired up, and pretending otherwise would lose the invite.
 */

const ROLE_HELP = {
  SUPER_ADMIN: 'Everything, including suspending stores and managing this team.',
  SUPPORT: 'Stores, people and follow-ups. No payment details, no audit log.',
  FINANCE: 'Everything support sees, plus payments, reports and the audit log.',
};

export default function PlatformTeamPage() {
  const me = usePlatformAuthStore((s) => s.admin);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [link, setLink] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'SUPPORT' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await platformApi.get('/team');
      setData(response.data);
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not load the team.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const invite = async (event) => {
    event.preventDefault();
    setInviting(true);
    setError(null);
    try {
      const response = await platformApi.post('/team', {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
      });
      setLink({
        kind: 'invite',
        who: form.email.trim(),
        token: response.data.inviteToken,
        hours: response.data.inviteExpiresInHours,
      });
      setForm({ name: '', email: '', role: 'SUPPORT' });
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not send that invite.'));
    } finally {
      setInviting(false);
    }
  };

  const patch = async (id, body) => {
    setError(null);
    try {
      await platformApi.patch(`/team/${id}`, body);
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, 'That change did not go through.'));
    }
  };

  const resetLink = async (admin) => {
    setError(null);
    try {
      const response = await platformApi.post(`/team/${admin.id}/reset-link`);
      setLink({ kind: 'reset', who: admin.email, token: response.data.resetToken, minutes: 60 });
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not create a reset link.'));
    }
  };

  const signOutEverywhere = async (admin) => {
    setError(null);
    try {
      await platformApi.post(`/team/${admin.id}/sign-out`);
      await load();
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not sign them out.'));
    }
  };

  const url = link ? `${window.location.origin}/platform/reset?token=${link.token}` : '';

  return (
    <Page
      title="Team"
      subtitle={
        loading && !data
          ? 'Loading…'
          : `${data.admins.length} platform accounts · ${data.superAdmins} super admin${
              data.superAdmins === 1 ? '' : 's'
            }`
      }
      actions={<ReloadButton onClick={load} busy={loading} />}
    >
      <ErrorNote message={error} onRetry={load} />

      {link ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-h2 font-bold text-amber-900">
            {link.kind === 'invite' ? 'Invite link for' : 'Reset link for'} {link.who}
          </h2>
          <p className="mt-1 text-body text-amber-900">
            Send this to them yourself — no email is sent from here. It works once and expires in{' '}
            {link.hours ? `${link.hours} hours` : `${link.minutes} minutes`}.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(event) => event.target.select()}
              className="h-10 flex-1 rounded-lg border border-amber-300 bg-white px-2.5 font-mono text-desc text-slate-700"
            />
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(url)}
              className="flex h-10 items-center gap-1.5 rounded-lg bg-amber-600 px-3 text-body font-bold text-white hover:bg-amber-700"
            >
              <LuCopy size={14} aria-hidden />
              Copy
            </button>
            <button
              type="button"
              onClick={() => setLink(null)}
              className="h-10 rounded-lg px-3 text-body font-semibold text-amber-900 hover:bg-amber-100"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-h2 font-bold text-slate-900">Invite someone</h2>
        <form onSubmit={invite} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block min-w-[180px] flex-1">
            <span className="text-desc font-semibold text-slate-500">Name</span>
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-2.5 text-body text-slate-900 focus:border-brand focus:outline-none"
            />
          </label>
          <label className="block min-w-[200px] flex-1">
            <span className="text-desc font-semibold text-slate-500">Work email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-2.5 text-body text-slate-900 focus:border-brand focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-desc font-semibold text-slate-500">Role</span>
            <select
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
              className="mt-1 h-11 rounded-lg border border-slate-200 bg-white px-2.5 text-body text-slate-900 focus:border-brand focus:outline-none"
            >
              <option value="SUPPORT">Support</option>
              <option value="FINANCE">Finance</option>
              <option value="SUPER_ADMIN">Super admin</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={inviting || !form.name.trim() || !form.email.trim()}
            className="flex h-11 items-center gap-2 rounded-lg bg-brand px-4 text-body font-bold text-ink transition hover:bg-brand-700 disabled:opacity-40"
          >
            <LuUserPlus size={16} aria-hidden />
            Invite
          </button>
        </form>
        <p className="mt-2 text-desc text-slate-500">{ROLE_HELP[form.role]}</p>
      </section>

      <Card>
        {loading && !data ? (
          <Loading what="Loading the team" />
        ) : !data.admins.length ? (
          <Empty title="Nobody here yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.admins.map((a) => {
              const isMe = a.id === me?.id;
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-semibold text-slate-900">
                      {a.name}
                      {isMe ? <Pill className="ml-2 bg-slate-100 text-slate-600">you</Pill> : null}
                      {!a.isActive ? (
                        <Pill className="ml-2 bg-slate-100 text-slate-500">disabled</Pill>
                      ) : null}
                      {a.lockedUntil && new Date(a.lockedUntil) > new Date() ? (
                        <Pill className="ml-2 bg-rose-50 text-rose-700">locked out</Pill>
                      ) : null}
                    </p>
                    <p className="text-desc text-slate-500">
                      {a.email} · signed in on {a.activeSessions} device
                      {a.activeSessions === 1 ? '' : 's'} · last seen {sinceNow(a.lastLoginAt)}
                    </p>
                  </div>

                  <select
                    value={a.role}
                    disabled={isMe}
                    onChange={(event) => patch(a.id, { role: event.target.value })}
                    title={isMe ? 'You cannot change your own role' : ROLE_HELP[a.role]}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-desc text-slate-700 focus:border-brand focus:outline-none disabled:opacity-50"
                  >
                    <option value="SUPPORT">Support</option>
                    <option value="FINANCE">Finance</option>
                    <option value="SUPER_ADMIN">Super admin</option>
                  </select>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => resetLink(a)}
                      disabled={!a.isActive}
                      className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-desc font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                      title="Create a one-time password reset link"
                    >
                      <LuKey size={13} aria-hidden />
                      Reset link
                    </button>
                    <button
                      type="button"
                      onClick={() => signOutEverywhere(a)}
                      disabled={!a.activeSessions}
                      className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-desc font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                      title="Sign this account out of every device"
                    >
                      <LuLogOut size={13} aria-hidden />
                      Sign out
                    </button>
                    <button
                      type="button"
                      onClick={() => patch(a.id, { isActive: !a.isActive })}
                      disabled={isMe}
                      title={isMe ? 'You cannot disable your own account' : undefined}
                      className={`h-9 rounded-lg border px-2.5 text-desc font-semibold transition disabled:opacity-40 ${
                        a.isActive
                          ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                          : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                      }`}
                    >
                      {a.isActive ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </Page>
  );
}
