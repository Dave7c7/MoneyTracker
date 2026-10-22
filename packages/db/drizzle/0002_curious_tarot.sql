CREATE TABLE "import_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"institution" text,
	"mapping" jsonb NOT NULL,
	"account_key" text NOT NULL,
	"account_name" text NOT NULL,
	"account_type" "account_type" DEFAULT 'checking' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_profiles" ADD CONSTRAINT "import_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "import_profiles_user_name_idx" ON "import_profiles" USING btree ("user_id","name");