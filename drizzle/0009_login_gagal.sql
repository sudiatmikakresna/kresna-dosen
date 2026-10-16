CREATE TABLE "login_gagal" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"ip" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "login_gagal_username_idx" ON "login_gagal" USING btree ("username","created_at");--> statement-breakpoint
CREATE INDEX "login_gagal_ip_idx" ON "login_gagal" USING btree ("ip","created_at");
