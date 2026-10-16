CREATE TABLE "oauth_klien" (
	"client_id" text PRIMARY KEY NOT NULL,
	"nama" text,
	"redirect_uris" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_kode" (
	"kode_hash" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"dosen_id" integer NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"scope" text,
	"resource" text,
	"kedaluwarsa_at" timestamp with time zone NOT NULL,
	"dipakai_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_token" (
	"id" serial PRIMARY KEY NOT NULL,
	"dosen_id" integer NOT NULL,
	"client_id" text NOT NULL,
	"nama_klien" text,
	"scope" text,
	"resource" text,
	"access_hash" text NOT NULL,
	"access_kedaluwarsa_at" timestamp with time zone NOT NULL,
	"refresh_hash" text NOT NULL,
	"refresh_kedaluwarsa_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_token_access_hash_unique" UNIQUE("access_hash"),
	CONSTRAINT "oauth_token_refresh_hash_unique" UNIQUE("refresh_hash")
);
--> statement-breakpoint
ALTER TABLE "oauth_kode" ADD CONSTRAINT "oauth_kode_dosen_id_users_id_fk" FOREIGN KEY ("dosen_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_token" ADD CONSTRAINT "oauth_token_dosen_id_users_id_fk" FOREIGN KEY ("dosen_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_token_dosen_idx" ON "oauth_token" USING btree ("dosen_id");
