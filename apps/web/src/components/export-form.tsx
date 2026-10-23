/**
 * Downloading the data.
 *
 * A plain form, deliberately: the browser sends a GET, the route answers with
 * `Content-Disposition: attachment`, and the file lands in the downloads
 * folder. No JavaScript, no spinner, nothing to fail halfway.
 */

const inputClass =
  'mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';

export function ExportForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  return (
    <form action="/api/export" method="get" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
          From
          <input type="date" name="from" className={inputClass} />
        </label>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
          To
          <input type="date" name="to" className={inputClass} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
          Account
          <select name="accountId" className={inputClass} defaultValue="">
            <option value="">Every account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
          Format
          <select name="format" className={inputClass} defaultValue="csv">
            <option value="csv">Spreadsheet (CSV)</option>
            <option value="json">Everything (JSON)</option>
          </select>
        </label>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Leave the dates empty for everything. The CSV has one row per transaction and the amount as
        a decimal; the JSON keeps the accounts, the categories, the minor units and the split lines.
      </p>

      <button
        type="submit"
        className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
      >
        Download
      </button>
    </form>
  );
}
