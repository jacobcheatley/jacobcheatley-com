CREATE TABLE "elements" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "elements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(30) NOT NULL,
	"emoji" varchar(16) NOT NULL,
	"colour" varchar(7) NOT NULL,
	"kind" varchar(6) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "elements_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"voter" uuid NOT NULL,
	"element_low" integer NOT NULL,
	"element_high" integer NOT NULL,
	"value" smallint NOT NULL,
	"cast_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "votes_voter_matchup" UNIQUE("voter","element_low","element_high"),
	CONSTRAINT "votes_value_step" CHECK ("votes"."value" between -2 and 2),
	CONSTRAINT "votes_element_order" CHECK ("votes"."element_low" < "votes"."element_high")
);
--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_element_low_elements_id_fk" FOREIGN KEY ("element_low") REFERENCES "public"."elements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_element_high_elements_id_fk" FOREIGN KEY ("element_high") REFERENCES "public"."elements"("id") ON DELETE no action ON UPDATE no action;