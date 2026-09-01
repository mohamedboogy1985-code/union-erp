CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"nature" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"parent_id" text,
	"is_parent" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"requires_subledger" boolean DEFAULT false NOT NULL,
	"subledger_type" text DEFAULT 'NONE',
	"current_balance" double precision DEFAULT 0 NOT NULL,
	"organization_id" text DEFAULT 'org-union-main' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "accounts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "actuarial_funds" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'PENSION' NOT NULL,
	"current_reserve" double precision DEFAULT 0 NOT NULL,
	"target_reserve" double precision DEFAULT 0 NOT NULL,
	"actuarial_surplus_deficit" double precision DEFAULT 0 NOT NULL,
	"discount_rate" double precision DEFAULT 8.5 NOT NULL,
	"inflation_rate" double precision DEFAULT 12 NOT NULL,
	"active_members_count" integer DEFAULT 0 NOT NULL,
	"beneficiaries_count" integer DEFAULT 0 NOT NULL,
	"monthly_inflow" double precision DEFAULT 0 NOT NULL,
	"monthly_outflow" double precision DEFAULT 0 NOT NULL,
	"solvency_ratio" double precision DEFAULT 100 NOT NULL,
	"status" text DEFAULT 'SOLVENT' NOT NULL,
	"organization_id" text DEFAULT 'org-union-main' NOT NULL,
	"last_valuation_date" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "actuarial_funds_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"timestamp" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"user_role" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"organization_id" text DEFAULT 'org-union-main' NOT NULL,
	"details" text NOT NULL,
	"ip_address" text DEFAULT '127.0.0.1',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cost_centers" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'PROJECT' NOT NULL,
	"budget_limit" double precision DEFAULT 0 NOT NULL,
	"current_spent" double precision DEFAULT 0 NOT NULL,
	"organization_id" text DEFAULT 'org-union-main' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "cost_centers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"file_data" text NOT NULL,
	"sha256" text NOT NULL,
	"is_sealed" boolean DEFAULT false NOT NULL,
	"sealed_by" text,
	"seal_timestamp" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fiscal_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL,
	"organization_id" text DEFAULT 'org-union-main' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_number" text NOT NULL,
	"date" text NOT NULL,
	"organization_id" text DEFAULT 'org-union-main' NOT NULL,
	"period_id" text NOT NULL,
	"description" text NOT NULL,
	"type" text DEFAULT 'MANUAL' NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"total_debit" double precision DEFAULT 0 NOT NULL,
	"total_credit" double precision DEFAULT 0 NOT NULL,
	"created_by_id" text NOT NULL,
	"approved_by_id" text,
	"reversal_of_entry_id" text,
	"is_reversed" boolean DEFAULT false NOT NULL,
	"checksum" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "journal_entries_entry_number_unique" UNIQUE("entry_number")
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"journal_entry_id" text NOT NULL,
	"account_id" text NOT NULL,
	"subledger_party_id" text,
	"subledger_party_name_input" text,
	"cost_center_id" text,
	"debit" double precision DEFAULT 0 NOT NULL,
	"credit" double precision DEFAULT 0 NOT NULL,
	"description" text,
	"attachment_url" text,
	"ai_confidence_score" double precision,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"membership_number" text NOT NULL,
	"full_name" text NOT NULL,
	"national_id_masked" text NOT NULL,
	"national_id_hash" text NOT NULL,
	"syndicate_committee_id" text NOT NULL,
	"syndicate_committee_name" text NOT NULL,
	"profession" text NOT NULL,
	"company_name" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"join_date" text NOT NULL,
	"phone" text,
	"email" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "members_membership_number_unique" UNIQUE("membership_number")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"type" text DEFAULT 'GENERAL_SYNDICATE' NOT NULL,
	"registration_number" text,
	"tax_number" text,
	"address" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "organizations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"receipt_number" text NOT NULL,
	"organization_id" text DEFAULT 'org-union-main' NOT NULL,
	"payer_name" text NOT NULL,
	"member_id" text,
	"revenue_type_id" text NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"payment_method" text DEFAULT 'CASH' NOT NULL,
	"notes" text,
	"date" text NOT NULL,
	"qr_verification_token" text NOT NULL,
	"checksum" text NOT NULL,
	"created_by_id" text NOT NULL,
	"journal_entry_id" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "receipts_receipt_number_unique" UNIQUE("receipt_number")
);
--> statement-breakpoint
CREATE TABLE "revenue_distribution_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"revenue_type_id" text NOT NULL,
	"name" text NOT NULL,
	"percentage" double precision NOT NULL,
	"target_account_id" text NOT NULL,
	"cost_center_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"organization_id" text DEFAULT 'org-union-main' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "revenue_types" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"default_amount" double precision DEFAULT 0,
	"credit_account_id" text NOT NULL,
	"debit_account_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"organization_id" text DEFAULT 'org-union-main' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "revenue_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "subledger_parties" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'DEBTOR' NOT NULL,
	"national_id" text,
	"phone" text,
	"address" text,
	"tax_registration_number" text,
	"commercial_register" text,
	"balance" double precision DEFAULT 0 NOT NULL,
	"organization_id" text DEFAULT 'org-union-main' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "subledger_parties_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" text NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"role" text DEFAULT 'ACCOUNTANT' NOT NULL,
	"organization_id" text DEFAULT 'org-union-main' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_uid_unique" UNIQUE("uid")
);
