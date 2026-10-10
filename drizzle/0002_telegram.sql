CREATE TABLE "pengaturan" (
	"kunci" text PRIMARY KEY NOT NULL,
	"nilai" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
