import { Link } from "react-router-dom";
import { LuCircleAlert, LuClock } from "react-icons/lu";
import { useAuthStore } from "../../store/authStore";

/**
 * A quiet line at the top of the app when the trial is running out or the plan has lapsed.
 * Cashiers see what is happening but are pointed at their admin rather than a payment screen.
 */
export function SubscriptionBanner() {
  const subscription = useAuthStore((s) => s.subscription);
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  if (!subscription) return null;

  const lapsed = !subscription.active;
  const endingSoon = subscription.active && subscription.daysLeft <= 7;
  if (!lapsed && !endingSoon) return null;

  const Icon = lapsed ? LuCircleAlert : LuClock;
  const tone = lapsed
    ? "bg-rose-50 text-rose-800"
    : "bg-[#FFF1E6] text-[#9A3F0B]";

  const message = lapsed
    ? isAdmin
      ? "Your subscription has ended. Bills still upload, but adding products, categories and staff is paused."
      : "This store’s subscription has ended. You can keep billing; ask your admin to renew."
    : isAdmin
      ? `${subscription.isTrial ? "Free trial" : "Your plan"} ends in ${subscription.daysLeft} day${subscription.daysLeft === 1 ? "" : "s"}.`
      : `${subscription.isTrial ? "Free trial" : "The plan"} ends in ${subscription.daysLeft} day${subscription.daysLeft === 1 ? "" : "s"}.`;

  return (
    <div
      className={`flex items-center gap-2 border-b border-black/5 px-4 py-2 text-desc sm:px-6 ${tone}`}
      role="status"
    >
      <Icon className="shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">{message}</p>
      {isAdmin ? (
        <Link
          to="/app/billing"
          className="shrink-0 rounded-full bg-white px-3 py-1 font-bold shadow-sm ring-1 ring-black/5 hover:bg-white/80"
        >
          {lapsed ? "Choose a plan" : "View plans"}
        </Link>
      ) : null}
    </div>
  );
}
