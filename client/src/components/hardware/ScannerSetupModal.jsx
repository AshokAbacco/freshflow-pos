import { useEffect, useRef, useState } from "react";
import {
  LuCamera,
  LuCheck,
  LuCircleAlert,
  LuKeyboard,
  LuPlug,
  LuScanBarcode,
  LuUsb,
  LuX,
} from "react-icons/lu";
import { useScannerStore } from "../../store/scannerStore.js";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

/**
 * Connect and test a barcode scanner.
 *
 * Most scanners need nothing connected: they emulate a keyboard, so they work the moment they
 * are plugged in. That is the first thing this screen says, because the common case is "it
 * already works" and a setup screen that implies otherwise invites unnecessary fiddling.
 * The other two transports are for the cases where that is not true.
 */

const TRANSPORTS = [
  {
    id: "wedge",
    icon: LuKeyboard,
    title: "USB or Bluetooth scanner",
    body: "Almost every scanner works this way: it types the barcode and presses Enter. Plug it in and scan — there is nothing to set up.",
  },
  {
    id: "serial",
    icon: LuUsb,
    title: "Serial scanner",
    body: "For a scanner in RS-232 or USB-serial mode, which sends to a port rather than typing. Needs Chrome or Edge on a computer.",
  },
  {
    id: "camera",
    icon: LuCamera,
    title: "This device’s camera",
    body: "Use the camera to read barcodes when there is no scanner on the counter. Slower than a scanner, and best for occasional use or stock-taking.",
  },
];

export function ScannerSetupModal({ open, onClose }) {
  const {
    settings,
    serial,
    camera,
    lastScan,
    scanCount,
    capabilities,
    unavailableReason,
    updateSettings,
    resetSettings,
    connectSerial,
    disconnectSerial,
    startCamera,
    stopCamera,
  } = useScannerStore();

  const videoRef = useRef(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testFocus, setTestFocus] = useState(false);
  const startCount = useRef(scanCount);

  // Leaving the camera running after the dialog closes would keep the indicator light on.
  useEffect(() => {
    if (!open) stopCamera();
  }, [open, stopCamera]);

  useEffect(() => {
    if (open) startCount.current = scanCount;
    // Only on open: this is the baseline the "scans in this session" count is measured from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cameraReason = unavailableReason("camera");
  const serialReason = unavailableReason("serial");
  const scansHere = Math.max(0, scanCount - startCount.current);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Barcode scanner"
      description="Connect a scanner and check that it reads correctly"
      footer={
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={resetSettings}
            className="text-desc font-semibold text-slate-500 hover:text-slate-800"
          >
            Restore defaults
          </button>
          <Button onClick={onClose}>Done</Button>
        </div>
      }
    >
      {/* Test area first: the question people open this screen with is "is it working?" */}
      <section
        className={`rounded-xl border-2 border-dashed p-4 transition ${
          lastScan && !lastScan.rejected
            ? "border-brand bg-brand-50/50"
            : "border-slate-200 bg-slate-50"
        }`}
      >
        <div className="flex items-center gap-2">
          <LuScanBarcode className="shrink-0 text-brand" aria-hidden />
          <h3 className="flex-1">Scan anything to test</h3>
          {scansHere > 0 ? (
            <span className="rounded-full bg-brand px-2 py-0.5 text-desc font-bold text-white tabular">
              {scansHere} scanned
            </span>
          ) : null}
        </div>

        {lastScan ? (
          <div className="mt-3" aria-live="polite">
            <p className="break-all font-mono text-h1 font-bold text-slate-900">
              {lastScan.code}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-desc text-slate-600">
              <span className="font-semibold">{lastScan.symbology}</span>
              <span>read by {sourceLabel(lastScan.source)}</span>
              {lastScan.checkDigitOk === true ? (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                  <LuCheck size={12} aria-hidden /> check digit valid
                </span>
              ) : null}
              {lastScan.checkDigitOk === false ? (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                  <LuCircleAlert size={12} aria-hidden /> check digit does not
                  match
                </span>
              ) : null}
            </div>
            {lastScan.rejected === "CHECK_DIGIT" ? (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-desc font-semibold text-amber-800">
                This scan was refused because its check digit does not match and
                the strict setting below is on. Turn that off if your shop
                prints its own labels.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-desc text-slate-500">
            Point your scanner at any barcode. What it reads will appear here,
            so you can check it matches the number printed on the label.
          </p>
        )}

        {/* A plain field, because a scan into a focused input is the stock-entry case and is
            worth being able to try separately from the global listener. */}
        <label htmlFor="scanner-test-field" className="label mt-4">
          Or scan into a field, as you would on the stock screen
        </label>
        <input
          id="scanner-test-field"
          className="field font-mono"
          placeholder="Click here, then scan"
          onFocus={() => setTestFocus(true)}
          onBlur={() => setTestFocus(false)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            useScannerStore.getState().emitScan(e.currentTarget.value, "wedge");
            e.currentTarget.value = "";
          }}
        />
        {testFocus ? (
          <p className="mt-1.5 text-desc text-slate-500">
            While a field has the cursor, the field receives the scan. That is
            how the stock screen fills a product in.
          </p>
        ) : null}
      </section>

      {/* ---------------------------------------------------------------- transports */}
      <h3 className="mt-6">How your scanner connects</h3>
      <ul className="mt-2 space-y-2">
        {TRANSPORTS.map(({ id, icon: Icon, title, body }) => {
          const available = capabilities[id];
          const reason =
            id === "serial"
              ? serialReason
              : id === "camera"
                ? cameraReason
                : null;
          return (
            <li
              key={id}
              className={`rounded-xl border p-3 ${available ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50"}`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
                    available
                      ? "bg-brand-50 text-brand-700"
                      : "bg-slate-100 text-slate-400"
                  }`}
                  aria-hidden
                >
                  <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-body font-bold text-slate-900">
                      {title}
                    </h4>
                    {id === "wedge" && settings.wedgeEnabled ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-desc font-bold text-emerald-700">
                        Listening
                      </span>
                    ) : null}
                    {id === "serial" && serial.status === "connected" ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-desc font-bold text-emerald-700">
                        Connected
                      </span>
                    ) : null}
                    {id === "camera" && camera.status === "scanning" ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-desc font-bold text-emerald-700">
                        Scanning
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-desc leading-5 text-slate-600">
                    {body}
                  </p>

                  {reason ? (
                    <p className="mt-2 text-desc font-semibold text-slate-500">
                      {reason}
                    </p>
                  ) : null}

                  {id === "wedge" ? (
                    <label className="mt-2 inline-flex items-center gap-2 text-desc font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand"
                        checked={settings.wedgeEnabled}
                        onChange={(e) =>
                          updateSettings({ wedgeEnabled: e.target.checked })
                        }
                      />
                      Listen for keyboard-style scanners
                    </label>
                  ) : null}

                  {id === "serial" && available ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {serial.status === "connected" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={disconnectSerial}
                        >
                          <LuX aria-hidden /> Disconnect
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="soft"
                          loading={serial.status === "connecting"}
                          onClick={() => connectSerial()}
                        >
                          <LuPlug aria-hidden /> Choose a port
                        </Button>
                      )}
                      <select
                        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-desc"
                        value={serial.baudRate}
                        disabled={serial.status === "connected"}
                        onChange={(e) =>
                          useScannerStore.setState({
                            serial: {
                              ...serial,
                              baudRate: Number(e.target.value),
                            },
                          })
                        }
                        aria-label="Serial speed"
                      >
                        {[9600, 19200, 38400, 57600, 115200].map((rate) => (
                          <option key={rate} value={rate}>
                            {rate} baud
                          </option>
                        ))}
                      </select>
                      {serial.error ? (
                        <span className="text-desc font-semibold text-rose-600">
                          {serial.error}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {id === "camera" && available ? (
                    <div className="mt-2">
                      {camera.status === "scanning" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={stopCamera}
                        >
                          <LuX aria-hidden /> Stop the camera
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="soft"
                          loading={camera.status === "starting"}
                          onClick={() => startCamera(videoRef.current)}
                        >
                          <LuCamera aria-hidden /> Start the camera
                        </Button>
                      )}
                      {camera.error ? (
                        <p className="mt-2 text-desc font-semibold text-rose-600">
                          {camera.error}
                        </p>
                      ) : null}
                      {/* Kept mounted so the ref exists when the button is pressed. */}
                      <div
                        className={
                          camera.status === "scanning" ? "mt-3" : "hidden"
                        }
                      >
                        <video
                          ref={videoRef}
                          muted
                          playsInline
                          className="aspect-video w-full max-w-sm rounded-xl bg-slate-900 object-cover"
                        />
                        <p className="mt-1.5 text-desc text-slate-500">
                          Hold the barcode 10–20 cm from the lens, filling the
                          width of the frame.
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* ---------------------------------------------------------------- advanced */}
      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="mt-5 text-desc font-bold text-brand-700 hover:text-brand-800"
        aria-expanded={showAdvanced}
      >
        {showAdvanced ? "Hide" : "Show"} scanner settings
      </button>

      {showAdvanced ? (
        <div className="mt-3 space-y-4 rounded-xl bg-slate-50 p-4">
          <p className="text-desc text-slate-600">
            Only needed if your scanner has been programmed to add characters
            around the code, or if it fires twice on one trigger pull.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="scanner-prefix" className="label">
                Characters it adds before the code
              </label>
              <input
                id="scanner-prefix"
                className="field font-mono"
                value={settings.prefix}
                placeholder="none"
                onChange={(e) => updateSettings({ prefix: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="scanner-suffix" className="label">
                Characters it adds after the code
              </label>
              <input
                id="scanner-suffix"
                className="field font-mono"
                value={settings.suffix}
                placeholder="none"
                onChange={(e) => updateSettings({ suffix: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="scanner-minlength" className="label">
                Shortest code to accept
              </label>
              <input
                id="scanner-minlength"
                type="number"
                min={1}
                max={20}
                className="field tabular"
                value={settings.minLength}
                onChange={(e) =>
                  updateSettings({
                    minLength: Math.max(1, Number(e.target.value) || 1),
                  })
                }
              />
            </div>
            <div>
              <label htmlFor="scanner-dedupe" className="label">
                Ignore a repeat within (ms)
              </label>
              <input
                id="scanner-dedupe"
                type="number"
                min={0}
                max={2000}
                step={50}
                className="field tabular"
                value={settings.dedupeMs}
                onChange={(e) =>
                  updateSettings({
                    dedupeMs: Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </div>
          </div>

          <label className="flex items-start gap-2 text-desc text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-brand"
              checked={settings.requireValidCheckDigit}
              onChange={(e) =>
                updateSettings({ requireValidCheckDigit: e.target.checked })
              }
            />
            <span>
              <span className="font-semibold">
                Refuse codes whose check digit does not match.
              </span>{" "}
              Catches misreads, but leave it off if your shop prints its own
              shelf labels — those often have no check digit at all.
            </span>
          </label>
        </div>
      ) : null}
    </Modal>
  );
}

function sourceLabel(source) {
  if (source === "serial") return "a serial scanner";
  if (source === "camera") return "the camera";
  return "a keyboard-style scanner";
}
