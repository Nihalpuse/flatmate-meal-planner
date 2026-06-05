/**
 * Database types for the FlatMate Meal Planner schema.
 *
 * This is a hand-maintained starter that mirrors the SQL in
 * `supabase/migrations`. Once the schema is live you can replace it with
 * generated types:
 *   npx supabase gen types typescript --project-id <id> > src/types/database.ts
 */

export type MemberRole = "admin" | "member";
export type SessionStatus = "open" | "voting" | "finalized" | "cancelled";
export type MealType = "lunch" | "dinner";

export interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
}

export interface Ingredient {
  id: string;
  group_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  available: boolean;
  created_at: string;
  updated_at: string;
}

export interface MealSession {
  id: string;
  group_id: string;
  session_date: string;
  meal_type: MealType;
  status: SessionStatus;
  created_at: string;
}

export interface MealSuggestion {
  id: string;
  session_id: string;
  meal_name: string;
  ai_generated: boolean;
  required_ingredients: string[];
  created_at: string;
}

export interface Vote {
  id: string;
  session_id: string;
  suggestion_id: string;
  user_id: string;
  created_at: string;
}

export interface FinalizedMeal {
  id: string;
  session_id: string;
  suggestion_id: string | null;
  meal_name: string;
  finalized_by: string;
  finalized_at: string;
}

export interface MealHistoryRow {
  id: string;
  group_id: string;
  meal_name: string;
  date: string;
  meal_type: MealType;
  finalized_at: string;
}

/**
 * Minimal Database shape consumed by the typed Supabase clients.
 * Expand `Insert` / `Update` variants as features are built.
 */
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      groups: { Row: Group; Insert: Partial<Group>; Update: Partial<Group> };
      group_members: {
        Row: GroupMember;
        Insert: Partial<GroupMember>;
        Update: Partial<GroupMember>;
      };
      ingredients: {
        Row: Ingredient;
        Insert: Partial<Ingredient>;
        Update: Partial<Ingredient>;
      };
      meal_sessions: {
        Row: MealSession;
        Insert: Partial<MealSession>;
        Update: Partial<MealSession>;
      };
      meal_suggestions: {
        Row: MealSuggestion;
        Insert: Partial<MealSuggestion>;
        Update: Partial<MealSuggestion>;
      };
      votes: { Row: Vote; Insert: Partial<Vote>; Update: Partial<Vote> };
      finalized_meals: {
        Row: FinalizedMeal;
        Insert: Partial<FinalizedMeal>;
        Update: Partial<FinalizedMeal>;
      };
    };
    Views: {
      meal_history: { Row: MealHistoryRow };
    };
    Enums: {
      member_role: MemberRole;
      session_status: SessionStatus;
      meal_type: MealType;
    };
    Functions: {
      create_group: { Args: { group_name: string }; Returns: string };
      join_group: { Args: { invite_code: string }; Returns: string | null };
    };
  };
}
