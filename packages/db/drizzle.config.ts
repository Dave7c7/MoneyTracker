import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://moneytracker:moneytracker@localhost:5432/moneytracker',
  },
  strict: true,
  verbose: true,
});
