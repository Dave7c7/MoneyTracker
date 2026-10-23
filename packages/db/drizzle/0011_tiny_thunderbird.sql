CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"href" text,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"notify_attempts" integer DEFAULT 0 NOT NULL,
	"last_notify_error" text
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_user_dedupe_idx" ON "alerts" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "alerts_user_created_idx" ON "alerts" USING btree ("user_id","created_at");