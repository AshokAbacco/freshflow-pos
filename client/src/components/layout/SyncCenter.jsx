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
  online: { dot: "bg-green-500", label: "Online" },
  unreachable: { dot: "bg-amber-500", label: "Server unreachable" },
  offline: { dot: "bg-gray-400", label: "Offline" },
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
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-gray-600 truncate">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${dot}`}
              aria-hidden
            />
            <span className="truncate">{label}</span>
          </span>
          <Button
            onClick={syncNow}
            loading={syncing}
            disabled={connection === "offline"}
            className="bg-green-700 hover:bg-green-800 text-white shrink-0"
          >
            <LuRefreshCw aria-hidden className="w-4 h-4 mr-2" /> Sync now
          </Button>
        </div>
      }
    >
      {connection !== "online" ? (
        <div className="mb-4 flex gap-3 rounded-2xl bg-amber-50 border border-amber-100 p-4 text-sm text-amber-800 shadow-sm w-full">
          <LuWifiOff className="mt-0.5 shrink-0 w-5 h-5" aria-hidden />
          <p className="leading-relaxed break-words min-w-0">
            Keep selling. Bills are saved on this device and upload
            automatically when the connection returns.
          </p>
        </div>
      ) : null}

      {lastError && connection === "online" ? (
        <p className="mb-4 text-sm font-medium text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-100 break-words">
          {lastError}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <div className="py-6">
          <EmptyState
            icon={LuCloudUpload}
            title="Everything is uploaded"
            description="Completed bills from this register are safely stored on the server."
          />
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto overflow-x-hidden pr-2 scroll-thin">
          {entries.map((e) => (
            <li
              key={e.clientId}
              className="flex flex-col sm:flex-row items-start gap-3 py-4 w-full"
            >
              <div className="min-w-0 flex-1 break-words w-full">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-bold text-gray-900 tabular-nums">
                    {formatMoney(e.payload.grandTotal)}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ${e.status === "failed" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}
                  >
                    {e.status === "failed" ? "Needs attention" : "Waiting"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs font-medium text-gray-500 truncate w-full">
                  {formatDateTime(e.payload.soldAt)} • {e.payload.items.length}{" "}
                  items • {e.payload.paymentMethod}
                </p>
                {e.lastError ? (
                  <p className="mt-1.5 text-xs font-medium text-rose-600 line-clamp-2">
                    {e.lastError}
                  </p>
                ) : null}
              </div>

              {e.status === "failed" ? (
                <div className="flex gap-2 w-full sm:w-auto shrink-0 mt-2 sm:mt-0 justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => retryBill(e.clientId)}
                    className="border-gray-200 hover:bg-gray-50"
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
                      className="bg-rose-600 hover:bg-rose-700 text-white"
                    >
                      Confirm
                    </Button>
                  ) : (
                    <Button
                      size="iconSm"
                      variant="ghost"
                      aria-label="Discard bill"
                      onClick={() => setConfirmDiscard(e.clientId)}
                      className="text-gray-400 hover:text-rose-600 hover:bg-rose-50"
                    >
                      <LuTrash2 className="w-4 h-4" />
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
