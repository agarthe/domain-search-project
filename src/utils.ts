// Utility functions for domain operations

/**
 * Extract TLD from domain name
 */
export function extractTLD(domain: string): string {
  const parts = domain.split('.');
  if (parts.length >= 2) {
    // Handle .co.jp, .ne.jp etc
    if (parts.length >= 3 && parts[parts.length - 2].length <= 3) {
      return '.' + parts.slice(-2).join('.');
    }
    return '.' + parts[parts.length - 1];
  }
  return '';
}

/**
 * Normalize domain name (remove protocol, www, etc)
 */
export function normalizeDomain(input: string): string {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .split('/')[0]
    .trim();
}

/**
 * Fetch WHOIS data from external API
 */
export async function fetchWhoisData(domain: string, apiKey?: string): Promise<any> {
  // If no API key, return mock data
  if (!apiKey) {
    return {
      domain,
      status: 'API key not configured',
      message: 'Please configure WHOIS API key in admin panel'
    };
  }
  
  try {
    // Using WhoisXML API as example
    const response = await fetch(
      `https://www.whoisxmlapi.com/whoisserver/WhoisService?apiKey=${apiKey}&domainName=${domain}&outputFormat=JSON`,
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`WHOIS API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('WHOIS fetch error:', error);
    return {
      domain,
      error: 'Failed to fetch WHOIS data',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Cache expiry time in milliseconds (24 hours)
 */
export const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Check if cache entry is expired
 */
export function isCacheExpired(lastChecked: string): boolean {
  const lastCheckedTime = new Date(lastChecked).getTime();
  const now = Date.now();
  return (now - lastCheckedTime) > CACHE_EXPIRY_MS;
}

/**
 * Domainr API: Search for domains
 * https://domainr.com/docs/api#search
 */
export async function domainrSearch(query: string, apiKey: string): Promise<any[]> {
  try {
    const url = `https://domainr.p.rapidapi.com/v2/search?query=${encodeURIComponent(query)}`;
    
    const response = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'domainr.p.rapidapi.com'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Domainr Search API error: ${response.status}`);
    }
    
    const data = await response.json() as any;
    return data.results || [];
  } catch (error) {
    console.error('Domainr Search error:', error);
    return [];
  }
}

/**
 * Domainr API: Check domain status
 * https://domainr.com/docs/api#status
 */
export async function domainrStatus(domains: string[], apiKey: string): Promise<Map<string, any>> {
  try {
    // Join domains with comma for batch check
    const domainList = domains.join(',');
    const url = `https://domainr.p.rapidapi.com/v2/status?domain=${encodeURIComponent(domainList)}`;
    
    const response = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'domainr.p.rapidapi.com'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Domainr Status API error: ${response.status}`);
    }
    
    const data = await response.json() as any;
    
    // Create map of domain -> status
    const statusMap = new Map<string, any>();
    if (data.status) {
      data.status.forEach((item: any) => {
        statusMap.set(item.domain, item);
      });
    }
    
    return statusMap;
  } catch (error) {
    console.error('Domainr Status error:', error);
    return new Map();
  }
}

/**
 * Convert Domainr status to our status format
 * Domainr response format:
 * {
 *   domain: "example.com",
 *   zone: "com",
 *   status: "undelegated inactive" or "active" or "unknown",  // space-separated tokens
 *   summary: "inactive" or "active" or "unknown"              // human-readable summary
 * }
 * 
 * NOTE: When Domainr API returns "unknown" status, we use DNS fallback check
 */
export function convertDomainrStatus(domainStatus: any): 'available' | 'taken' | 'unknown' {
  if (!domainStatus) {
    return 'unknown';
  }
  
  // Parse status tokens (space-separated string)
  const statusTokens = (domainStatus.status || '').toLowerCase().split(/\s+/).filter(Boolean);
  const summary = (domainStatus.summary || '').toLowerCase();
  
  // Check summary first (most reliable indicator)
  // Available/Inactive states
  if (summary === 'inactive' || summary === 'available' || summary === 'undelegated') {
    return 'available';
  }
  
  // Active/Registered states
  if (summary === 'active' || summary === 'parked' || summary === 'claimed' || 
      summary === 'registered' || summary === 'reserved') {
    return 'taken';
  }
  
  // If summary is "unknown", check status tokens as fallback
  if (summary === 'unknown' || summary === '') {
    // Available indicators in status tokens
    if (statusTokens.includes('undelegated') || 
        statusTokens.includes('inactive') || 
        statusTokens.includes('available')) {
      return 'available';
    }
    
    // Taken indicators in status tokens
    if (statusTokens.includes('active') || 
        statusTokens.includes('parked') || 
        statusTokens.includes('premium') ||
        statusTokens.includes('registered') ||
        statusTokens.includes('reserved')) {
      return 'taken';
    }
    
    // If status is just "unknown", we truly don't know - use DNS fallback
    if (statusTokens.includes('unknown') || statusTokens.length === 0) {
      return 'unknown';
    }
  }
  
  // Default to unknown - will trigger DNS fallback
  return 'unknown';
}

/**
 * Simple DNS-based availability check (fallback when Domainr returns unknown)
 */
export async function checkDomainAvailabilityDNS(domain: string): Promise<'available' | 'taken' | 'unknown'> {
  try {
    // Use DNS over HTTPS (Cloudflare DNS)
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=A`, {
      headers: {
        'Accept': 'application/dns-json'
      }
    });
    
    if (!response.ok) {
      return 'unknown';
    }
    
    const data = await response.json() as any;
    
    // If status is NXDOMAIN (3), domain doesn't exist (potentially available)
    if (data.Status === 3) {
      return 'available';
    } 
    // If we get answers, domain exists (taken)
    else if (data.Answer && data.Answer.length > 0) {
      return 'taken';
    }
    
    return 'unknown';
  } catch (error) {
    console.error('DNS check error for', domain, ':', error);
    return 'unknown';
  }
}
