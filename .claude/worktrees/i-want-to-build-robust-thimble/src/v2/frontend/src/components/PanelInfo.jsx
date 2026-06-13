import { useState } from "react";

/**
 * PanelInfo — inline ⓘ icon that opens a modal explaining a chart panel.
 *
 * Props
 * -----
 * label : string         — panel name shown as modal heading
 * what  : string         — one-paragraph "what it shows" explanation
 * watch : string[]       — bullet list of things to look for
 */
export default function PanelInfo({ label, what, watch = [] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={`Info for ${label}`}
        onClick={() => setOpen(true)}
        className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full
                   text-gray-500 hover:text-indigo-400 hover:bg-gray-700
                   text-[10px] font-bold transition-colors leading-none"
        style={{ verticalAlign: "middle" }}
      >
        i
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-gray-100">{label}</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-500 hover:text-gray-200 text-lg leading-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  What it shows
                </p>
                <p className="text-sm text-gray-300 leading-relaxed">{what}</p>
              </div>

              {watch.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    What to watch
                  </p>
                  <ul className="space-y-1.5">
                    {watch.map((w, i) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-300 leading-relaxed">
                        <span className="text-indigo-400 shrink-0 mt-0.5">›</span>
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
