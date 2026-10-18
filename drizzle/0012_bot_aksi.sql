CREATE TABLE "bot_aksi" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"pengirim_id" text NOT NULL,
	"jenis" text NOT NULL,
	"data" jsonb NOT NULL,
	"ringkasan" text NOT NULL,
	"status" text DEFAULT 'menunggu' NOT NULL,
	"hasil" text,
	"kedaluwarsa_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"selesai_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "bot_aksi_menunggu_idx" ON "bot_aksi" USING btree ("chat_id","pengirim_id","created_at");