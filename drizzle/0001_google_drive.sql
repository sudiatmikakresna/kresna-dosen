CREATE TABLE "google_akun" (
	"id" serial PRIMARY KEY NOT NULL,
	"dosen_id" integer NOT NULL,
	"email" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"root_folder_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_akun_dosen_id_unique" UNIQUE("dosen_id")
);
--> statement-breakpoint
CREATE TABLE "upload_sesi" (
	"id" text PRIMARY KEY NOT NULL,
	"mahasiswa_id" integer NOT NULL,
	"jenis" text NOT NULL,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"ukuran" integer NOT NULL,
	"uri" text NOT NULL,
	"drive_file_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "berkas" ADD COLUMN "drive_file_id" text;--> statement-breakpoint
ALTER TABLE "berkas" ADD COLUMN "ukuran" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "drive_folder_id" text;--> statement-breakpoint
ALTER TABLE "google_akun" ADD CONSTRAINT "google_akun_dosen_id_users_id_fk" FOREIGN KEY ("dosen_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sesi" ADD CONSTRAINT "upload_sesi_mahasiswa_id_users_id_fk" FOREIGN KEY ("mahasiswa_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;