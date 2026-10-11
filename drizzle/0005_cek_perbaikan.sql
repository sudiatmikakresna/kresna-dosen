CREATE TABLE "cek_perbaikan" (
	"id" serial PRIMARY KEY NOT NULL,
	"berkas_id" integer NOT NULL,
	"revisi_id" integer NOT NULL,
	"diperbaiki" boolean NOT NULL,
	"keterangan" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cek_perbaikan" ADD CONSTRAINT "cek_perbaikan_berkas_id_berkas_id_fk" FOREIGN KEY ("berkas_id") REFERENCES "public"."berkas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cek_perbaikan" ADD CONSTRAINT "cek_perbaikan_revisi_id_revisi_id_fk" FOREIGN KEY ("revisi_id") REFERENCES "public"."revisi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cek_perbaikan_berkas_revisi_idx" ON "cek_perbaikan" USING btree ("berkas_id","revisi_id");