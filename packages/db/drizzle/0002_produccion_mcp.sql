CREATE TABLE "api_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"token_prefix" varchar(16) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"scopes" jsonb DEFAULT '["read"]'::jsonb NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "mcp_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"auth_kind" varchar(16) NOT NULL,
	"client_id" varchar(64),
	"api_token_id" integer,
	"tool" varchar(64) NOT NULL,
	"ok" boolean NOT NULL,
	"error" text,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"args" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "cancelled_by" integer;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "unit_cost" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
-- Ventas existentes: se toma el costo actual del producto como mejor aproximación.
UPDATE "sale_items" SET "unit_cost" = "products"."cost" FROM "products" WHERE "products"."id" = "sale_items"."product_id";--> statement-breakpoint
-- Ventas canceladas antes de esta migración: la fecha de cancelación es desconocida.
UPDATE "sales" SET "cancelled_at" = "created_at" WHERE "status" = 'cancelled' AND "cancelled_at" IS NULL;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_audit_logs" ADD CONSTRAINT "mcp_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_audit_logs" ADD CONSTRAINT "mcp_audit_logs_api_token_id_api_tokens_id_fk" FOREIGN KEY ("api_token_id") REFERENCES "public"."api_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_tokens_user_id_idx" ON "api_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mcp_audit_logs_created_at_idx" ON "mcp_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "mcp_audit_logs_user_id_created_at_idx" ON "mcp_audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_user_client_idx" ON "oauth_refresh_tokens" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE INDEX "products_category_id_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_items_product_id_idx" ON "sale_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sales_created_at_idx" ON "sales" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sales_status_created_at_idx" ON "sales" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "sales_user_id_idx" ON "sales" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stock_movements_product_id_created_at_idx" ON "stock_movements" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_sale_id_idx" ON "stock_movements" USING btree ("sale_id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_stock_non_negative" CHECK ("products"."stock" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_min_stock_non_negative" CHECK ("products"."min_stock" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_price_non_negative" CHECK ("products"."price" >= 0 AND "products"."cost" >= 0);--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_quantity_positive" CHECK ("sale_items"."quantity" > 0);
