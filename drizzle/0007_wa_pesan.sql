CREATE TABLE "wa_pesan" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"pengirim" text,
	"pengirim_id" text,
	"dari_saya" boolean DEFAULT false NOT NULL,
	"teks" text DEFAULT '' NOT NULL,
	"lampiran" boolean DEFAULT false NOT NULL,
	"sumber" text DEFAULT 'webhook' NOT NULL,
	"waktu" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wa_pesan_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE INDEX "wa_pesan_chat_waktu_idx" ON "wa_pesan" USING btree ("chat_id","waktu");
