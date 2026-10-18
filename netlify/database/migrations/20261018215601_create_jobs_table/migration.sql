CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY,
	"code" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"output" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
