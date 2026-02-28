export interface Business {
  id: string;
  place_id: string;
  owner_id: string;
  business_name: string;
  history_fact: string;
  flash_sale: string | null;
  is_active: boolean;
  latitude: number;
  longitude: number;
  business_type: string;
  menu_link: string | null;
}
