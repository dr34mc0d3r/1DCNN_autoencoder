import { useState } from "react";

/**
 * FieldInfo — inline ⓘ icon that opens a modal explaining a config field.
 *
 * Props
 * -----
 * info : { label, what, values, affects }
 */
export default function FieldInfo({ info }) {
  const [open, setOpen] = useState(false);

  if (!info) return null;

  return (
    <>
      <button
        type="button"
        aria-label={`Info for ${info.label}`}
        onClick={() => setOpen(true)}
        className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full
                   border border-gray-600 text-gray-400 hover:border-indigo-400 hover:text-indigo-400
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
            className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-gray-100">{info.label}</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-500 hover:text-gray-200 text-lg leading-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  What it does
                </p>
                <p className="text-sm text-gray-300 leading-relaxed">{info.what}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Acceptable values
                </p>
                <p className="text-sm text-gray-300 leading-relaxed">{info.values}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Where it has effect
                </p>
                <p className="text-sm text-gray-300 leading-relaxed">{info.affects}</p>
              </div>
              {info.svg && (
                <div className="border-t border-gray-800 pt-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Visual
                  </p>
                  {info.svg}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
