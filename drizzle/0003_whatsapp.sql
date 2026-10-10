CREATE TABLE "wa_grup" (
	"chat_id" text PRIMARY KEY NOT NULL,
	"nama" text,
	"diizinkan" boolean DEFAULT false NOT NULL,
	"terakhir_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_tanya" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"pengirim" text NOT NULL,
	"nama_pengirim" text,
	"pertanyaan" text NOT NULL,
	"jawaban" text,
	"status" text DEFAULT 'diproses' NOT NULL,
	"alasan" text,
	"perlu_dosen" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wa_tanya_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE INDEX "wa_tanya_pengirim_idx" ON "wa_tanya" USING btree ("pengirim","created_at");--> statement-breakpoint
CREATE INDEX "wa_tanya_chat_idx" ON "wa_tanya" USING btree ("chat_id","created_at");