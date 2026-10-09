CREATE TABLE "aktivitas" (
	"id" serial PRIMARY KEY NOT NULL,
	"mahasiswa_id" integer NOT NULL,
	"berkas_id" integer,
	"teks" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "berkas" (
	"id" serial PRIMARY KEY NOT NULL,
	"mahasiswa_id" integer NOT NULL,
	"jenis" text NOT NULL,
	"versi" integer NOT NULL,
	"sumber" text NOT NULL,
	"file_url" text,
	"file_name" text,
	"gdocs_url" text,
	"catatan" text,
	"teks" text,
	"status" text DEFAULT 'menunggu' NOT NULL,
	"ringkasan" text,
	"keputusan_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"dosen_id" integer NOT NULL,
	"nama" text NOT NULL,
	"prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "revisi" (
	"id" serial PRIMARY KEY NOT NULL,
	"berkas_id" integer NOT NULL,
	"lokasi" text DEFAULT '' NOT NULL,
	"jenis" text DEFAULT 'wajib' NOT NULL,
	"teks" text NOT NULL,
	"sumber" text DEFAULT 'dosen' NOT NULL,
	"status" text DEFAULT 'draf' NOT NULL,
	"selesai" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"nim" text,
	"username" text,
	"nama" text NOT NULL,
	"password_hash" text NOT NULL,
	"judul_skripsi" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_nim_unique" UNIQUE("nim"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "aktivitas" ADD CONSTRAINT "aktivitas_mahasiswa_id_users_id_fk" FOREIGN KEY ("mahasiswa_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aktivitas" ADD CONSTRAINT "aktivitas_berkas_id_berkas_id_fk" FOREIGN KEY ("berkas_id") REFERENCES "public"."berkas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "berkas" ADD CONSTRAINT "berkas_mahasiswa_id_users_id_fk" FOREIGN KEY ("mahasiswa_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_dosen_id_users_id_fk" FOREIGN KEY ("dosen_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisi" ADD CONSTRAINT "revisi_berkas_id_berkas_id_fk" FOREIGN KEY ("berkas_id") REFERENCES "public"."berkas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "berkas_mahasiswa_idx" ON "berkas" USING btree ("mahasiswa_id");--> statement-breakpoint
CREATE INDEX "revisi_berkas_idx" ON "revisi" USING btree ("berkas_id");