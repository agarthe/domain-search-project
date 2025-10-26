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
 * Convert Domainr summary to our status format
 * Domainr summaries: available, inactive, active, unknown, undelegated, parked, etc.
 */
export function convertDomainrStatus(summary: string): 'available' | 'taken' | 'unknown' {
  const lowerSummary = summary.toLowerCase();
  
  // Available states
  if (lowerSummary === 'available' || lowerSummary === 'inactive' || lowerSummary === 'undelegated') {
    return 'available';
  }
  
  // Taken states
  if (lowerSummary === 'active' || lowerSummary === 'parked' || lowerSummary === 'claimed') {
    return 'taken';
  }
  
  // Unknown/uncertain states
  return 'unknown';
}
