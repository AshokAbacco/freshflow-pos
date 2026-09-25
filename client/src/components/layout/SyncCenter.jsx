import { useState } from "react";
import {
  LuCloudUpload,
  LuRefreshCw,
  LuTrash2,
  LuWifiOff,
} from "react-icons/lu";
import { formatDateTime, formatMoney, relativeTime } from "../../lib/format";
import { discardBill, flushOutbox, retryBill } from "../../lib/sync";
import { selectConnection, useSyncStore } from "../../store/syncStore";
import { toast } from "../../store/toastStore";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { EmptyState } from "../ui/States";

const STATUS_COPY = {
  online: { dot: "bg-brand", label: "Online" },
  unreachable: { dot: "bg-amber-500", label: "Server unreachable" },
  offline: { dot: "bg-slate-400", label: "Offline" },
};

export function useSyncSummary() {
  const connection = useSyncStore(selectConnection);
  const pending = useSyncStore((s) => s.pendingCount);
  const failed = useSyncStore((s) => s.failedCount);
  const syncing = useSyncStore((s) => s.syncing);
  return { connection, pending, failed, syncing, ...STATUS_COPY[connection] };
}

export function SyncCenter({ open, onClose }) {
  const { entries, lastSyncAt, lastError, syncing } = useSyncStore();
  const { connection, label, dot } = useSyncSummary();
  const [confirmDiscard, setConfirmDiscard] = useState(null);

  const syncNow = async () => {
    const synced = await flushOutbox();
    if (synced.length)
      toast.success(
        `${synced.length} bill${synced.length > 1 ? "s" : ""} uploaded`,
      );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bill sync"
      description={`Last upload ${relativeTime(lastSyncAt)}`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-desc text-slate-600">
            <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
            {label}
          </span>
          <Button
            onClick={syncNow}
            loading={syncing}
            disabled={connection === "offline"}
          >
            <LuRefreshCw aria-hidden /> Sync now
          </Button>
        </div>
      }
    >
      {connection !== "online" ? (
        <div className="mb-4 flex gap-3 rounded-lg bg-[#FFF1E6] text-[#9A3F0B] p-3 text-desc">
          <LuWifiOff className="mt-0.5 shrink-0" aria-hidden />
          <p>
            Keep selling. Bills are saved on this device and upload
            automatically when the connection returns.
          </p>
        </div>
      ) : null}
      {lastError && connection === "online" ? (
        <p className="mb-3 text-desc text-rose-600">{lastError}</p>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState
          icon={LuCloudUpload}
          title="Everything is uploaded"
          description="Completed bills from this register are safely stored on the server."
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {entries.map((e) => (
            <li key={e.clientId} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-gray-900 tabular">
                    {formatMoney(e.payload.grandTotal)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-desc font-medium ${e.status === "failed" ? "bg-rose-50 text-rose-700" : "bg-[#FFF1E6] text-[#C2560F]"}`}
                  >
                    {e.status === "failed" ? "Needs attention" : "Waiting"}
                  </span>
                </div>
                <p className="mt-0.5 text-desc text-slate-500">
                  {formatDateTime(e.payload.soldAt)}, {e.payload.items.length}{" "}
                  items, {e.payload.paymentMethod}
                </p>
                {e.lastError ? (
                  <p className="mt-1 text-desc text-rose-600">{e.lastError}</p>
                ) : null}
              </div>
              {e.status === "failed" ? (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => retryBill(e.clientId)}
                  >
                    Retry
                  </Button>
                  {confirmDiscard === e.clientId ? (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={async () => {
                        await discardBill(e.clientId);
                        setConfirmDiscard(null);
                        toast.info("Bill removed from this register");
                      }}
                    >
                      Confirm
                    </Button>
                  ) : (
                    <Button
                      size="iconSm"
                      variant="ghost"
                      aria-label="Discard bill"
                      onClick={() => setConfirmDiscard(e.clientId)}
                    >
                      <LuTrash2 />
                    </Button>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
