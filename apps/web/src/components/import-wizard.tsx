'use client';

import { useCallback, useMemo, useState } from 'react';

import { createCsvMapping, detectDelimiter, parseCsv, type CsvMapping } from '@moneytracker/core';

import type { ImportPreviewView, ImportProfileView, ImportResultView } from '@/lib/imports.ts';

/** The account kinds a profile can point at. */
const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'loan', label: 'Loan' },
  { value: 'cash', label: 'Cash' },
] as const;

/** The currencies the app offers. */
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'JPY'] as const;

/** The steps of the import, in order. */
type Step = 'file' | 'mapping' | 'preview' | 'done';

/** The fields of a profile, as the form holds them. */
interface ProfileDraft {
  name: string;
  institution: string;
  accountName: string;
  accountType: 'checking' | 'savings' | 'credit_card' | 'loan' | 'cash';
  currency: string;
}

/**
 * The import screen.
 *
 * A file is read the way a saved profile says, and the preview shows what
 * the import will do before it does it. The file never leaves the browser
 * until the user asks for it to.
 */
export function ImportWizard({ profiles }: { profiles: ImportProfileView[] }) {
  const [step, setStep] = useState<Step>('file');
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [mapping, setMapping] = useState<CsvMapping>(() => createCsvMapping());
  const [draft, setDraft] = useState<ProfileDraft>({
    name: '',
    institution: '',
    accountName: '',
    accountType: 'checking',
    currency: 'USD',
  });
  const [profileId, setProfileId] = useState<string>('');
  const [preview, setPreview] = useState<ImportPreviewView | null>(null);
  const [result, setResult] = useState<ImportResultView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedProfileName = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId)?.name ?? null,
    [profiles, selectedProfileId],
  );

  /** Reads the file in the browser, so the columns can be shown right away. */
  const chooseFile = useCallback(async (chosen: File) => {
    setError(null);
    setPreview(null);
    setResult(null);

    let text: string;
    try {
      text = await chosen.text();
    } catch {
      setError('That file could not be read.');
      return;
    }

    const delimiter = detectDelimiter(text);
    const rows = parseCsv(text, delimiter);
    const header = (rows[0] ?? []).map((cell) => cell.trim());

    setFile(chosen);
    setColumns(header);
    setSampleRows(rows.slice(1, 4).map((row) => row.map((cell) => cell.trim())));
    setMapping(guessMapping(header));
    setStep('mapping');
  }, []);

  /** Loads a saved profile into the form. */
  const chooseProfile = useCallback((profile: ImportProfileView | null) => {
    setError(null);
    if (!profile) {
      setSelectedProfileId('');
      setProfileId('');
      setDraft({
        name: '',
        institution: '',
        accountName: '',
        accountType: 'checking',
        currency: 'USD',
      });
      setMapping(createCsvMapping());
      return;
    }

    setSelectedProfileId(profile.id);
    setProfileId(profile.id);
    setDraft({
      name: profile.name,
      institution: profile.institution ?? '',
      accountName: profile.accountName,
      accountType: profile.accountType,
      currency: profile.currency,
    });
    setMapping(profile.mapping);
  }, []);

  /** Saves the profile, then asks the server what the file would do. */
  const saveAndPreview = useCallback(async () => {
    if (!file) return;
    setError(null);

    if (draft.name.trim().length === 0) {
      setError('Give the profile a name, so you can find it again.');
      return;
    }
    if (mapping.dateColumn.length === 0) {
      setError('Choose the column that holds the date.');
      return;
    }
    if (mapping.descriptionColumn.length === 0) {
      setError('Choose the column that holds the description.');
      return;
    }
    if (mapping.amountMode === 'single' && mapping.amountColumn.length === 0) {
      setError('Choose the column that holds the amount.');
      return;
    }
    if (
      mapping.amountMode === 'separate' &&
      mapping.debitColumn.length === 0 &&
      mapping.creditColumn.length === 0
    ) {
      setError('Choose the columns that hold the amount.');
      return;
    }

    setBusy(true);
    try {
      const body = {
        name: draft.name.trim(),
        institution: draft.institution.trim() || null,
        mapping,
        accountName: draft.accountName.trim() || draft.name.trim(),
        accountType: draft.accountType,
        currency: draft.currency,
      };

      const response =
        selectedProfileId === ''
          ? await fetch('/api/imports/profiles', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
          : await fetch(`/api/imports/profiles/${selectedProfileId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });

      const payload = (await response.json()) as {
        profile?: ImportProfileView;
        error?: string;
      };
      if (!response.ok || !payload.profile) {
        setError(payload.error ?? 'The profile could not be saved.');
        return;
      }

      setProfileId(payload.profile.id);
      setSelectedProfileId(payload.profile.id);
      setPreview(null);

      const previewResponse = await fetch('/api/imports/preview', {
        method: 'POST',
        body: formData(file, payload.profile.id),
      });
      const previewPayload = (await previewResponse.json()) as {
        preview?: ImportPreviewView;
        error?: string;
      };
      if (!previewResponse.ok || !previewPayload.preview) {
        setError(previewPayload.error ?? 'The file could not be read.');
        return;
      }

      setPreview(previewPayload.preview);
      setStep('preview');
    } catch {
      setError('The file could not be read.');
    } finally {
      setBusy(false);
    }
  }, [file, draft, mapping, selectedProfileId]);

  /** Imports the file. */
  const commit = useCallback(async () => {
    if (!file || !profileId) return;
    setError(null);
    setBusy(true);

    try {
      const response = await fetch('/api/imports/commit', {
        method: 'POST',
        body: formData(file, profileId),
      });
      const payload = (await response.json()) as {
        result?: ImportResultView;
        error?: string;
      };
      if (!response.ok || !payload.result) {
        setError(payload.error ?? 'The import failed.');
        return;
      }

      setResult(payload.result);
      setStep('done');
    } catch {
      setError('The import failed.');
    } finally {
      setBusy(false);
    }
  }, [file, profileId]);

  /** Starts over with a new file. */
  const reset = useCallback(() => {
    setStep('file');
    setFile(null);
    setColumns([]);
    setSampleRows([]);
    setPreview(null);
    setResult(null);
    setError(null);
    setProfileId('');
    chooseProfile(null);
  }, [chooseProfile]);

  return (
    <div className="space-y-4">
      {step === 'file' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Choose a file
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            A CSV export from your bank. The file is read in this browser and sent to the app
            only when you import it.
          </p>

          <label className="mt-3 flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 p-6 text-center hover:border-slate-400 dark:border-slate-700">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {file ? file.name : 'Choose a CSV file'}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {file ? 'Choose another file' : 'From your bank, as a spreadsheet export'}
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => {
                const chosen = event.target.files?.[0];
                if (chosen) void chooseFile(chosen);
              }}
            />
          </label>

          {profiles.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Saved profiles
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {profiles.map((profile) => (
                  <li key={profile.id}>
                    <button
                      type="button"
                      onClick={() => {
                        chooseProfile(profile);
                        setStep('mapping');
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                    >
                      <span className="truncate text-slate-800 dark:text-slate-100">
                        {profile.name}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                        {profile.institution ?? profile.accountName}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {step === 'mapping' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  How should this file be read?
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {file?.name} · {columns.length} columns
                  {selectedProfileName ? ` · ${selectedProfileName}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={reset}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Change file
              </button>
            </div>

            <ColumnTable columns={columns} rows={sampleRows} />

            {profiles.length > 0 && (
              <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Profile
                <select
                  value={selectedProfileId}
                  onChange={(event) => {
                    const chosen = profiles.find((profile) => profile.id === event.target.value);
                    chooseProfile(chosen ?? null);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">New profile</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Profile name">
                <input
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="SoFi checking"
                  className={inputClass}
                />
              </Field>
              <Field label="Institution (optional)">
                <input
                  value={draft.institution}
                  onChange={(event) => setDraft({ ...draft, institution: event.target.value })}
                  placeholder="SoFi"
                  className={inputClass}
                />
              </Field>
              <Field label="Account name">
                <input
                  value={draft.accountName}
                  onChange={(event) => setDraft({ ...draft, accountName: event.target.value })}
                  placeholder="SoFi Checking"
                  className={inputClass}
                />
              </Field>
              <Field label="Account type">
                <select
                  value={draft.accountType}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      accountType: event.target.value as ProfileDraft['accountType'],
                    })
                  }
                  className={inputClass}
                >
                  {ACCOUNT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Currency">
                <select
                  value={draft.currency}
                  onChange={(event) => setDraft({ ...draft, currency: event.target.value })}
                  className={inputClass}
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              The columns
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              The app reads the file the way you say here, and remembers it for the next export.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Date column">
                <ColumnSelect
                  columns={columns}
                  value={mapping.dateColumn}
                  onChange={(value) => setMapping({ ...mapping, dateColumn: value })}
                />
              </Field>
              <Field label="Dates are written as">
                <select
                  value={mapping.dateFormat}
                  onChange={(event) =>
                    setMapping({
                      ...mapping,
                      dateFormat: event.target.value as CsvMapping['dateFormat'],
                    })
                  }
                  className={inputClass}
                >
                  <option value="auto">Let the app work it out</option>
                  <option value="iso">2026-03-04</option>
                  <option value="mdy">03/04/2026 (month first)</option>
                  <option value="dmy">03/04/2026 (day first)</option>
                  <option value="month_day_year">Mar 4, 2026</option>
                </select>
              </Field>

              <Field label="Where the amount is">
                <select
                  value={mapping.amountMode}
                  onChange={(event) =>
                    setMapping({
                      ...mapping,
                      amountMode: event.target.value as CsvMapping['amountMode'],
                    })
                  }
                  className={inputClass}
                >
                  <option value="single">In one column</option>
                  <option value="separate">In two columns</option>
                </select>
              </Field>

              {mapping.amountMode === 'single' ? (
                <>
                  <Field label="Amount column">
                    <ColumnSelect
                      columns={columns}
                      value={mapping.amountColumn}
                      onChange={(value) => setMapping({ ...mapping, amountColumn: value })}
                    />
                  </Field>
                  <Field label="Money out is written as">
                    <select
                      value={mapping.amountSign}
                      onChange={(event) =>
                        setMapping({
                          ...mapping,
                          amountSign: event.target.value as CsvMapping['amountSign'],
                        })
                      }
                      className={inputClass}
                    >
                      <option value="signed">A negative number</option>
                      <option value="debit_positive">A positive number</option>
                      <option value="debit_negative">A negative number</option>
                    </select>
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Money out column">
                    <ColumnSelect
                      columns={columns}
                      value={mapping.debitColumn}
                      onChange={(value) => setMapping({ ...mapping, debitColumn: value })}
                    />
                  </Field>
                  <Field label="Money in column">
                    <ColumnSelect
                      columns={columns}
                      value={mapping.creditColumn}
                      onChange={(value) => setMapping({ ...mapping, creditColumn: value })}
                    />
                  </Field>
                </>
              )}

              <Field label="Description column">
                <ColumnSelect
                  columns={columns}
                  value={mapping.descriptionColumn}
                  onChange={(value) => setMapping({ ...mapping, descriptionColumn: value })}
                />
              </Field>
              <Field label="Decimals are separated by">
                <select
                  value={mapping.decimalSeparator}
                  onChange={(event) =>
                    setMapping({
                      ...mapping,
                      decimalSeparator: event.target.value as CsvMapping['decimalSeparator'],
                    })
                  }
                  className={inputClass}
                >
                  <option value="auto">Let the app work it out</option>
                  <option value=".">.</option>
                  <option value=",">,</option>
                </select>
              </Field>
              <Field label="Bank category column (optional)">
                <ColumnSelect
                  columns={columns}
                  value={mapping.categoryColumn ?? ''}
                  onChange={(value) => setMapping({ ...mapping, categoryColumn: value || null })}
                  optional
                />
              </Field>
              <Field label="Account column (optional)">
                <ColumnSelect
                  columns={columns}
                  value={mapping.accountColumn ?? ''}
                  onChange={(value) => setMapping({ ...mapping, accountColumn: value || null })}
                  optional
                />
              </Field>
              <Field label="Columns are separated by">
                <select
                  value={mapping.delimiter}
                  onChange={(event) =>
                    setMapping({
                      ...mapping,
                      delimiter: event.target.value as CsvMapping['delimiter'],
                    })
                  }
                  className={inputClass}
                >
                  <option value="auto">Let the app work it out</option>
                  <option value=",">, (comma)</option>
                  <option value=";">; (semicolon)</option>
                  <option value="\t">Tab</option>
                  <option value="|">| (pipe)</option>
                </select>
              </Field>
              <Field label="Header is on row">
                <input
                  type="number"
                  min={0}
                  value={mapping.headerRow + 1}
                  onChange={(event) =>
                    setMapping({
                      ...mapping,
                      headerRow: Math.max(0, Number.parseInt(event.target.value, 10) - 1 || 0),
                    })
                  }
                  className={inputClass}
                />
              </Field>
            </div>
          </div>

          {error && <ErrorMessage message={error} />}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void saveAndPreview()}
              disabled={busy}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
            >
              {busy ? 'Working...' : 'Save and preview'}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Start over
            </button>
          </div>
        </section>
      )}

      {step === 'preview' && preview && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              What this file would do
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {preview.fileName} · {preview.rowCount} rows
              {preview.dateRange.from
                ? ` · ${preview.dateRange.from} to ${preview.dateRange.to ?? preview.dateRange.from}`
                : ''}
            </p>

            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="New rows" value={String(preview.newRowCount)} />
              <Stat label="Already imported" value={String(preview.duplicateCount)} />
              <Stat label="Could not be read" value={String(preview.errors.length)} />
              <Stat label="Accounts" value={String(preview.accounts.length)} />
            </dl>

            {preview.accounts.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Accounts
                </p>
                <ul className="mt-1 space-y-1">
                  {preview.accounts.map((account) => (
                    <li
                      key={account.externalId}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="truncate text-slate-700 dark:text-slate-200">
                        {account.name}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                        {account.rowCount} rows · {account.exists ? 'already there' : 'new'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.unmappedColumns.length > 0 && (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Columns that are not used: {preview.unmappedColumns.join(', ')}
              </p>
            )}

            {preview.missingColumns.length > 0 && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                The file has no column named {preview.missingColumns.join(', ')}.
              </p>
            )}

            {preview.ambiguousDates > 0 && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                {preview.ambiguousDates} dates could be read in two ways. The app reads them as month
                first.
              </p>
            )}

            {preview.errors.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  Rows that are skipped
                </p>
                <ul className="mt-1 space-y-0.5">
                  {preview.errors.slice(0, 5).map((error) => (
                    <li key={error.rowNumber} className="text-xs text-slate-500 dark:text-slate-400">
                      Row {error.rowNumber}: {error.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.sample.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Date</th>
                      <th className="py-1 pr-3 font-medium">Amount</th>
                      <th className="py-1 pr-3 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700 dark:text-slate-200">
                    {preview.sample.map((row, index) => (
                      <tr key={`${row.date}-${index}`} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="py-1 pr-3 whitespace-nowrap">{row.date}</td>
                        <td className="tabular py-1 pr-3 whitespace-nowrap">
                          {formatAmount(row.amountMinor)}
                        </td>
                        <td className="py-1 pr-3">{row.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {error && <ErrorMessage message={error} />}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void commit()}
              disabled={busy}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
            >
              {busy ? 'Importing...' : `Import ${preview.newRowCount} rows`}
            </button>
            <button
              type="button"
              onClick={() => setStep('mapping')}
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Change the columns
            </button>
          </div>
        </section>
      )}

      {step === 'done' && result && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            The file is in
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Rows added" value={String(result.transactionsInserted)} />
            <Stat label="Rows updated" value={String(result.transactionsUpdated)} />
            <Stat label="Skipped" value={String(result.skippedRows)} />
            <Stat label="Accounts" value={String(result.accountsUpserted)} />
            <Stat label="Transfers found" value={String(result.transfersLinked)} />
            <Stat label="Need a look" value={String(result.suspectedTransfers)} />
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a
              href="/transactions"
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-900"
            >
              See the transactions
            </a>
            <button
              type="button"
              onClick={reset}
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Import another file
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/** A labelled field. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

/** A dropdown of the columns of the file. */
function ColumnSelect({
  columns,
  value,
  onChange,
  optional = false,
}: {
  columns: string[];
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
      <option value="">{optional ? 'Not in this file' : 'Choose a column'}</option>
      {columns.map((column) => (
        <option key={column} value={column}>
          {column}
        </option>
      ))}
    </select>
  );
}

/** The first rows of the file, so the user can see what they picked. */
function ColumnTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  if (columns.length === 0) return null;

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-slate-500 dark:text-slate-400">
          <tr>
            {columns.map((column) => (
              <th key={column} className="py-1 pr-3 font-medium whitespace-nowrap">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-slate-600 dark:text-slate-300">
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-slate-100 dark:border-slate-800">
              {columns.map((column, columnIndex) => (
                <td key={column} className="py-1 pr-3 whitespace-nowrap">
                  {row[columnIndex] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One number of the preview. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="tabular text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}

/** Says what went wrong. */
function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      {message}
    </p>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

/** Guesses a mapping from the names of the columns. */
function guessMapping(columns: string[]): CsvMapping {
  const mapping = createCsvMapping();

  const find = (patterns: RegExp[]): string =>
    columns.find((column) => patterns.some((pattern) => pattern.test(column))) ?? '';

  mapping.dateColumn = find([/^date/i, /posted/i, /transaction date/i]);
  mapping.amountColumn = find([/^amount/i, /^value/i, /debit/i]);
  mapping.descriptionColumn = find([/description/i, /memo/i, /payee/i, /details/i, /name/i]);
  mapping.categoryColumn = find([/category/i, /type/i]) || null;
  mapping.accountColumn = find([/^account/i, /account name/i]) || null;

  const hasDebit = columns.some((column) => /debit|withdrawal|money out|paid out/i.test(column));
  const hasCredit = columns.some((column) => /credit|deposit|money in|paid in/i.test(column));

  if (hasDebit && hasCredit && mapping.amountColumn === '') {
    mapping.amountMode = 'separate';
    mapping.debitColumn = find([/debit/i, /withdrawal/i, /money out/i, /paid out/i]);
    mapping.creditColumn = find([/credit/i, /deposit/i, /money in/i, /paid in/i]);
  }

  return mapping;
}

/** The request that carries the file and the profile. */
function formData(file: File, profileId: string): FormData {
  const data = new FormData();
  data.set('file', file);
  data.set('profileId', profileId);
  return data;
}

/** An amount, in the plain form the app uses. */
function formatAmount(amountMinor: number): string {
  const sign = amountMinor < 0 ? '-' : '';
  const value = Math.abs(amountMinor);
  return `${sign}$${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}
