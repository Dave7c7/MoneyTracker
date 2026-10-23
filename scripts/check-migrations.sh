#!/usr/bin/env bash
#
# Fails when the schema and the generated migrations disagree.
#
# The only way to change the database is `pnpm db:generate`, which writes a
# migration from `packages/db/src/schema.ts`. A hand-written migration, or a
# schema edit without one, leaves the two out of step and breaks the next
# fresh database.
#
# Generating here is harmless when they agree: drizzle-kit says there is
# nothing to migrate and writes nothing. When they disagree, it writes the
# missing migration and the check fails with the files to commit.

set -euo pipefail

cd "$(dirname "$0")/.."

pnpm db:generate

changed="$(git status --porcelain -- packages/db/drizzle)"
if [ -n "$changed" ]; then
  echo
  echo "The schema and the migrations disagree. Commit the migration that"
  echo "db:generate just wrote; never write one by hand:"
  echo
  echo "$changed"
  echo
  git --no-pager diff -- packages/db/drizzle || true
  exit 1
fi

echo "The schema and the migrations agree."
