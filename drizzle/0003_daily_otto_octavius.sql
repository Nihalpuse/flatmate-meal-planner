CREATE TYPE "public"."dish_source" AS ENUM('seed', 'ai');--> statement-breakpoint
CREATE TABLE "dishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"required_ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" "dish_source" DEFAULT 'seed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_suggestions" ADD COLUMN "added_by" text;--> statement-breakpoint
ALTER TABLE "meal_suggestions" ADD COLUMN "dish_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "dishes_lower_name_idx" ON "dishes" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "meal_suggestions" ADD CONSTRAINT "meal_suggestions_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_suggestions" ADD CONSTRAINT "meal_suggestions_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "dishes" ("name", "required_ingredients", "source") VALUES
  ('Egg Fried Rice', '["egg","rice","onion","soy sauce"]', 'seed'),
  ('Aloo Jeera', '["potato","cumin","oil"]', 'seed'),
  ('Rajma Chawal', '["rajma","rice","onion","tomato"]', 'seed'),
  ('Chole', '["chickpeas","onion","tomato","ginger"]', 'seed'),
  ('Paneer Butter Masala', '["paneer","tomato","cream","butter"]', 'seed'),
  ('Palak Paneer', '["paneer","spinach","onion","garlic"]', 'seed'),
  ('Dal Tadka', '["toor dal","onion","tomato","cumin"]', 'seed'),
  ('Dal Makhani', '["urad dal","rajma","cream","butter"]', 'seed'),
  ('Veg Pulao', '["rice","mixed vegetables","onion","whole spices"]', 'seed'),
  ('Jeera Rice', '["rice","cumin","oil"]', 'seed'),
  ('Aloo Gobi', '["potato","cauliflower","onion","turmeric"]', 'seed'),
  ('Bhindi Masala', '["okra","onion","tomato"]', 'seed'),
  ('Egg Curry', '["egg","onion","tomato","ginger"]', 'seed'),
  ('Chicken Curry', '["chicken","onion","tomato","ginger garlic"]', 'seed'),
  ('Butter Chicken', '["chicken","tomato","cream","butter"]', 'seed'),
  ('Veg Biryani', '["rice","mixed vegetables","yogurt","whole spices"]', 'seed'),
  ('Chicken Biryani', '["chicken","rice","yogurt","whole spices"]', 'seed'),
  ('Masala Dosa', '["dosa batter","potato","onion"]', 'seed'),
  ('Idli Sambar', '["idli batter","toor dal","mixed vegetables"]', 'seed'),
  ('Poha', '["flattened rice","onion","peanuts","mustard seeds"]', 'seed'),
  ('Upma', '["semolina","onion","mustard seeds"]', 'seed'),
  ('Maggi', '["maggi noodles","onion"]', 'seed'),
  ('Veg Fried Rice', '["rice","mixed vegetables","soy sauce"]', 'seed'),
  ('Veg Hakka Noodles', '["noodles","mixed vegetables","soy sauce"]', 'seed'),
  ('Pav Bhaji', '["pav","potato","mixed vegetables","butter"]', 'seed'),
  ('Chana Masala', '["chickpeas","onion","tomato"]', 'seed'),
  ('Kadhi Chawal', '["yogurt","gram flour","rice"]', 'seed'),
  ('Matar Paneer', '["paneer","peas","tomato","onion"]', 'seed'),
  ('Veg Khichdi', '["rice","moong dal","mixed vegetables"]', 'seed'),
  ('Roti Sabzi', '["wheat flour","mixed vegetables","onion"]', 'seed'),
  ('Lemon Rice', '["rice","lemon","peanuts","curry leaves"]', 'seed'),
  ('Curd Rice', '["rice","yogurt","curry leaves"]', 'seed'),
  ('Pasta', '["pasta","tomato","onion","cheese"]', 'seed'),
  ('Veg Sandwich', '["bread","potato","onion","tomato"]', 'seed'),
  ('Omelette', '["egg","onion","green chilli"]', 'seed'),
  ('Sambar Rice', '["rice","toor dal","mixed vegetables","tamarind"]', 'seed')
ON CONFLICT (lower(name)) DO NOTHING;