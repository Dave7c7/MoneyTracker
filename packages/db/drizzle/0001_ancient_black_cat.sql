ALTER TYPE "public"."assignment_source" ADD VALUE 'transfer_detection' BEFORE 'fallback';--> statement-breakpoint
CREATE TABLE "transfer_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'internal' NOT NULL,
	"source" text DEFAULT 'detected' NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transfer_groups" ADD CONSTRAINT "transfer_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transfer_groups_user_idx" ON "transfer_groups" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transfer_group_id_transfer_groups_id_fk" FOREIGN KEY ("transfer_group_id") REFERENCES "public"."transfer_groups"("id") ON DELETE set null ON UPDATE no action;