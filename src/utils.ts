// Utility functions for domain operations

/**
 * Generate domain variations based on input keyword
 */
export function generateDomainVariations(keyword: string): string[] {
  const normalized = keyword.toLowerCase().replace(/[^a-z0-9-]/g, '');
  
  // Common TLDs to check
  const tlds = [
    '.com', '.net', '.org', '.io', '.co', '.app', '.dev', '.ai',
    '.tech', '.online', '.site', '.website', '.store', '.shop',
    '.blog', '.news', '.info', '.biz', '.jp', '.co.jp', '.ne.jp'
  ];
  
  const variations: string[] = [];
  
  // Direct domain with various TLDs
  tlds.forEach(tld => {
    variations.push(`${normalized}${tld}`);
  });
  
  // Common prefixes/suffixes
  const modifiers = ['get', 'try', 'my', 'the', 'app', 'hq', 'hub', 'go', 'new'];
  
  // Add some variations with modifiers (limit to .com, .io, .app for modifiers)
  const popularTlds = ['.com', '.io', '.app', '.net'];
  modifiers.slice(0, 3).forEach(mod => {
    popularTlds.forEach(tld => {
      variations.push(`${mod}${normalized}${tld}`);
      variations.push(`${normalized}${mod}${tld}`);
    });
  });
  
  // Return unique domains (limit to first 50 for performance)
  return [...new Set(variations)].slice(0, 50);
}

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
 * Check if domain format is valid
 */
export function isValidDomain(domain: string): boolean {
  const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
  return domainRegex.test(domain);
}

/**
 * Simple domain availability check using DNS lookup (fallback method)
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
    
    // If we get answers, domain exists (taken)
    // If status is NXDOMAIN (3), domain doesn't exist (potentially available)
    if (data.Status === 3) {
      return 'available';
    } else if (data.Answer && data.Answer.length > 0) {
      return 'taken';
    }
    
    return 'unknown';
  } catch (error) {
    console.error('DNS check error:', error);
    return 'unknown';
  }
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
