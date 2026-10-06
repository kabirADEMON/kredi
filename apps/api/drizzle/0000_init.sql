CREATE TYPE "public"."entry_type" AS ENUM('credit', 'payment', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'momo');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'approved', 'declined', 'canceled');--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"share_token" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_share_token_unique" UNIQUE("share_token"),
	CONSTRAINT "customers_merchant_phone" UNIQUE("merchant_id","phone")
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "entries_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"merchant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" "entry_type" NOT NULL,
	"amount" integer NOT NULL,
	"note" text,
	"due_date" date,
	"method" "payment_method",
	"reverses_id" uuid,
	"payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entries_reverses_id_unique" UNIQUE("reverses_id"),
	CONSTRAINT "entries_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "entries_amount_positive" CHECK ("entries"."amount" > 0),
	CONSTRAINT "entries_reversal_target" CHECK (("entries"."type" = 'reversal') = ("entries"."reverses_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_name" text NOT NULL,
	"owner_name" text NOT NULL,
	"phone" text NOT NULL,
	"pin_hash" text NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchants_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_ref_unique" UNIQUE("provider_ref"),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_reverses_id_entries_id_fk" FOREIGN KEY ("reverses_id") REFERENCES "public"."entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_merchant_idx" ON "customers" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "entries_customer_idx" ON "entries" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "entries_merchant_idx" ON "entries" USING btree ("merchant_id","created_at");