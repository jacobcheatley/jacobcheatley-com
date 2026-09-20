CREATE TABLE "article_topics" (
	"article_id" integer NOT NULL,
	"topic_id" integer NOT NULL,
	CONSTRAINT "article_topics_article_id_topic_id_pk" PRIMARY KEY("article_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "articles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" varchar(80) NOT NULL,
	"title" varchar(120) NOT NULL,
	"tagline" varchar(160) NOT NULL,
	"body" text NOT NULL,
	"publish_at" timestamp with time zone,
	CONSTRAINT "articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "topics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(30) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "article_topics" ADD CONSTRAINT "article_topics_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_topics" ADD CONSTRAINT "article_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "topics_name_lower" ON "topics" USING btree (lower("name"));