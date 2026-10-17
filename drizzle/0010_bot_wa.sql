CREATE TABLE "bot_dokumen" (
	"id" serial PRIMARY KEY NOT NULL,
	"judul" text NOT NULL,
	"nama_file" text,
	"teks" text NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_tanya" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"pengirim" text,
	"pengirim_id" text,
	"pertanyaan" text NOT NULL,
	"jawaban" text,
	"status" text DEFAULT 'diproses' NOT NULL,
	"sumber" text,
	"alasan" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_read_tokens" integer,
	"durasi_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bot_tanya_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
ALTER TABLE "wa_grup" ADD COLUMN "bot_aktif" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "bot_tanya_pengirim_idx" ON "bot_tanya" USING btree ("pengirim_id","created_at");--> statement-breakpoint
CREATE INDEX "bot_tanya_chat_idx" ON "bot_tanya" USING btree ("chat_id","created_at");