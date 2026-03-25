export interface Business {
  id: string;
  place_id: string | null;
  google_place_id?: string | null;
  owner_id: string;
  business_name: string;
  history_fact: string;
  flash_sale: string | null;
  emoji_icon: string | null;
  is_active: boolean;
  latitude: number;
  longitude: number;
  static_latitude?: number | null;
  static_longitude?: number | null;
  is_traveling_active?: boolean;
  account_tier?: 'single' | 'dual';
  business_type: string;
  menu_link: string | null;
  website: string | null;
  description: string | null;
}

export interface VibeCheck {
  id: string;
  created_at: string;
  business_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
}

export type UserRole = 'owner' | 'customer';
