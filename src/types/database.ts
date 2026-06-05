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

export type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
}

export type Group = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type GroupMember = {
  id: string;
  group_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
}

export type Ingredient = {
  id: string;
  group_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  available: boolean;
  created_at: string;
  updated_at: string;
}

export type MealSession = {
  id: string;
  group_id: string;
  session_date: string;
  meal_type: MealType;
  status: SessionStatus;
  created_at: string;
}

export type MealSuggestion = {
  id: string;
  session_id: string;
  meal_name: string;
  ai_generated: boolean;
  required_ingredients: string[];
  created_at: string;
}

export type Vote = {
  id: string;
  session_id: string;
  suggestion_id: string;
  user_id: string;
  created_at: string;
}

export type FinalizedMeal = {
  id: string;
  session_id: string;
  suggestion_id: string | null;
  meal_name: string;
  finalized_by: string;
  finalized_at: string;
}

export type MealHistoryRow = {
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
      profiles: {
        Row: Profile;
        Insert: Partial<Profile>;
        Update: Partial<Profile>;
        Relationships: [];
      };
      groups: {
        Row: Group;
        Insert: Partial<Group>;
        Update: Partial<Group>;
        Relationships: [];
      };
      group_members: {
        Row: GroupMember;
        Insert: Partial<GroupMember>;
        Update: Partial<GroupMember>;
        Relationships: [];
      };
      ingredients: {
        Row: Ingredient;
        Insert: Partial<Ingredient>;
        Update: Partial<Ingredient>;
        Relationships: [];
      };
      meal_sessions: {
        Row: MealSession;
        Insert: Partial<MealSession>;
        Update: Partial<MealSession>;
        Relationships: [];
      };
      meal_suggestions: {
        Row: MealSuggestion;
        Insert: Partial<MealSuggestion>;
        Update: Partial<MealSuggestion>;
        Relationships: [];
      };
      votes: {
        Row: Vote;
        Insert: Partial<Vote>;
        Update: Partial<Vote>;
        Relationships: [];
      };
      finalized_meals: {
        Row: FinalizedMeal;
        Insert: Partial<FinalizedMeal>;
        Update: Partial<FinalizedMeal>;
        Relationships: [];
      };
    };
    Views: {
      meal_history: { Row: MealHistoryRow; Relationships: [] };
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
