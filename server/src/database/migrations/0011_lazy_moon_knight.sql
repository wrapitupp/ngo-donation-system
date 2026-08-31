CREATE TYPE "public"."risk_band" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."risk_review_status" AS ENUM('not_required', 'pending', 'cleared', 'confirmed');--> statement-breakpoint
CREATE TABLE "risk_assessments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "risk_assessments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"donation_id" bigint NOT NULL,
	"score" integer NOT NULL,
	"band" "risk_band" NOT NULL,
	"reasons" jsonb NOT NULL,
	"signals" jsonb NOT NULL,
	"model_version" varchar(16) NOT NULL,
	"review_status" "risk_review_status" DEFAULT 'not_required' NOT NULL,
	"reviewed_by" bigint,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "risk_assessments_donation_unique" ON "risk_assessments" USING btree ("donation_id");--> statement-breakpoint
CREATE INDEX "risk_assessments_band_idx" ON "risk_assessments" USING btree ("band");--> statement-breakpoint
CREATE INDEX "risk_assessments_review_status_idx" ON "risk_assessments" USING btree ("review_status");