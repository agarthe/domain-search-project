// Type definitions for the domain search app

export type Bindings = {
  DB: D1Database;
}

export interface Registrar {
  id: number;
  name: string;
  website: string;
  affiliate_link_template: string;
  logo_url: string | null;
  is_active: number;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface RegistrarPricing {
  id: number;
  registrar_id: number;
  tld: string;
  currency: string;
  price: number;
  renewal_price: number | null;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: number;
  service_name: string;
  api_key: string;
  api_secret: string | null;
  base_url: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface DomainCache {
  id: number;
  domain: string;
  is_available: number; // 0: taken, 1: available, 2: unknown
  whois_data: string | null;
  last_checked: string;
  created_at: string;
}

export interface DomainResult {
  domain: string;
  tld: string;
  status: 'available' | 'taken' | 'unknown';
  registrars?: RegistrarWithPrice[];
  whois?: any;
  cached?: boolean;
}

export interface RegistrarWithPrice extends Registrar {
  price?: number;
  renewal_price?: number;
  currency?: string;
  register_url?: string;
}

export interface SearchResponse {
  query: string;
  results: DomainResult[];
  timestamp: string;
}

export interface WhoisResponse {
  domain: string;
  whois: any;
  registrar?: string;
  created_date?: string;
  expiry_date?: string;
  status?: string[];
}
