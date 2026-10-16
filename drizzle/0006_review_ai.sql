CREATE TABLE "review_ai" (
	"id" serial PRIMARY KEY NOT NULL,
	"berkas_id" integer NOT NULL,
	"status" text DEFAULT 'proses' NOT NULL,
	"keputusan" text,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_read_tokens" integer,
	"jumlah_catatan" integer,
	"alasan" text,
	"durasi_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"selesai_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "review_ai" ADD CONSTRAINT "review_ai_berkas_id_berkas_id_fk" FOREIGN KEY ("berkas_id") REFERENCES "public"."berkas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_ai_berkas_idx" ON "review_ai" USING btree ("berkas_id","created_at");