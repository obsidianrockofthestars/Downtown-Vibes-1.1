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
  business_type: string;
  menu_link: string | null;
  website: string | null;
  description: string | null;
}
