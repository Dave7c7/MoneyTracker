'use client';

/**
 * A message with an undo button.
 *
 * Undo matters here: a bulk categorization is easy to do by accident, and
 * the rules ask for a way back.
 */
export function UndoToast({
  message,
  onUndo,
  onDismiss,
  tone = 'neutral',
}: {
  message: string;
  onUndo?: () => void;
  onDismiss: () => void;
  tone?: 'neutral' | 'error';
}) {
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 mx-auto w-full max-w-md px-4 md:bottom-6"
    >
      <div
        className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ${
          tone === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white dark:bg-slate-700'
        }`}
      >
        <span className="min-w-0 flex-1 truncate">{message}</span>
        {onUndo && (
          <button
            type="button"
            onClick={onUndo}
            className="shrink-0 rounded-lg bg-white/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide hover:bg-white/25"
          >
            Undo
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-lg px-1.5 py-1 text-white/70 hover:bg-white/15 hover:text-white"
        >
          <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3.5 w-3.5">
            <path d="M2 2 10 10M10 2 2 10" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
