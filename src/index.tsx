import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Bindings, DomainResult, SearchResponse, RegistrarWithPrice, ApiKey } from './types'
import { 
  extractTLD, 
  normalizeDomain, 
  fetchWhoisData,
  isCacheExpired,
  domainrSearch,
  domainrStatus,
  convertDomainrStatus,
  checkDomainAvailabilityDNS
} from './utils'

const app = new Hono<{ Bindings: Bindings }>()

/**
 * Convert UTC datetime to JST (Japan Standard Time, UTC+9)
 */
function convertToJST(utcDateString: string): string {
  if (!utcDateString) return '';
  
  const date = new Date(utcDateString + 'Z'); // Add Z to ensure it's treated as UTC
  
  // Add 9 hours for JST
  date.setHours(date.getHours() + 9);
  
  // Format: YYYY-MM-DD HH:mm:ss
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Enable CORS for all routes
app.use('*', cors())

// ============================================
// API Routes
// ============================================

/**
 * POST /api/search
 * Search for domain availability using Domainr API
 */
app.post('/api/search', async (c) => {
  try {
    const { query, language: requestLanguage } = await c.req.json<{ query: string; language?: string }>()
    
    if (!query || query.trim().length === 0) {
      return c.json({ error: 'Query is required' }, 400)
    }

    const normalized = normalizeDomain(query)
    const db = c.env.DB

    // Get Domainr API key
    const apiKeyRecord = await db.prepare(`
      SELECT api_key FROM api_keys 
      WHERE service_name = 'domainr_api' AND is_active = 1
      LIMIT 1
    `).first() as ApiKey | null

    if (!apiKeyRecord || !apiKeyRecord.api_key) {
      return c.json({ 
        error: 'Domainr API key not configured',
        message: 'Please configure Domainr API key in admin panel'
      }, 503)
    }

    // 1. Search domains using Domainr API
    const searchResults = await domainrSearch(normalized, apiKeyRecord.api_key)
    
    if (searchResults.length === 0) {
      return c.json({
        query: normalized,
        results: [],
        timestamp: new Date().toISOString()
      })
    }

    // Extract domain names from search results
    const domains = searchResults.map((r: any) => r.domain).slice(0, 50) // Limit to 50

    // 2. Check status using Domainr API (batch check)
    const statusMap = await domainrStatus(domains, apiKeyRecord.api_key)

    // Get all active registrars with pricing
    const registrars = await db.prepare(`
      SELECT r.*, rp.tld, rp.price, rp.renewal_price, rp.transfer_price, rp.currency
      FROM registrars r
      LEFT JOIN registrar_pricing rp ON r.id = rp.registrar_id
      WHERE r.is_active = 1
      ORDER BY r.display_order ASC
    `).all()

    // 3. Build results
    const results: DomainResult[] = []

    for (const domain of domains) {
      const tld = extractTLD(domain)
      const domainStatus = statusMap.get(domain)
      
      if (!domainStatus) {
        continue // Skip if no status info
      }

      // Convert Domainr status to our format
      let status = convertDomainrStatus(domainStatus)
      
      // If Domainr returns unknown, fallback to DNS check
      if (status === 'unknown') {
        status = await checkDomainAvailabilityDNS(domain);
      }

      // Update cache
      await db.prepare(`
        INSERT OR REPLACE INTO domain_cache (domain, is_available, last_checked)
        VALUES (?, ?, datetime('now'))
      `).bind(
        domain,
        status === 'available' ? 1 : status === 'taken' ? 0 : 2
      ).run()

      // Get registrars for this TLD (only those with matching pricing)
      const domainRegistrars: RegistrarWithPrice[] = registrars.results
        .filter((r: any) => r.tld === tld && r.price !== null)
        .reduce((acc: RegistrarWithPrice[], curr: any) => {
          // Avoid duplicates - take first occurrence (should be sorted by display_order)
          if (!acc.find(r => r.id === curr.id)) {
            acc.push({
              id: curr.id,
              name: curr.name,
              website: curr.website,
              affiliate_link_template: curr.affiliate_link_template,
              logo_url: curr.logo_url,
              is_active: curr.is_active,
              display_order: curr.display_order,
              created_at: curr.created_at,
              updated_at: curr.updated_at,
              price: curr.price,
              renewal_price: curr.renewal_price,
              transfer_price: curr.transfer_price,
              currency: curr.currency,
              register_url: curr.affiliate_link_template.replace('{domain}', domain)
            })
          }
          return acc
        }, [])
        .sort((a, b) => {
          // Sort by price (ascending) - cheapest first
          // Normalize to USD for fair comparison
          const USD_TO_JPY = 150;
          let aPrice = a.price || Infinity;
          let bPrice = b.price || Infinity;
          
          if (a.currency === 'JPY' && aPrice !== Infinity) {
            aPrice = aPrice / USD_TO_JPY;
          }
          if (b.currency === 'JPY' && bPrice !== Infinity) {
            bPrice = bPrice / USD_TO_JPY;
          }
          
          return aPrice - bPrice;
        })
        .slice(0, 10) // Show top 10 cheapest registrars

      // Add to results
      if (tld && tld.length > 0) {
        results.push({
          domain,
          tld,
          status,
          registrars: status === 'available' ? domainRegistrars : undefined,
          whois: status === 'taken' ? null : undefined, // WHOIS can be fetched separately
          cached: false // Fresh from Domainr API
        })
        
        // Save to search history
        try {
          const userIP = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
          const userAgent = c.req.header('user-agent') || '';
          // Use request language instead of browser header
          const language = requestLanguage || 'en';
          
          await db.prepare(`
            INSERT INTO search_history (domain, status, tld, search_query, language, user_ip, user_agent, searched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `).bind(domain, status, tld, normalized, language, userIP.substring(0, 50), userAgent.substring(0, 200)).run();
        } catch (err) {
          console.error('Failed to save search history:', err);
          // Don't fail the request if history save fails
        }
      }
    }

    // Re-check unknown status domains after 1 second
    const unknownDomains = results.filter(r => r.status === 'unknown').map(r => r.domain);
    if (unknownDomains.length > 0) {
      // Wait 1 second before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Re-check status using Domainr API
      const retryStatusMap = await domainrStatus(unknownDomains, apiKeyRecord.api_key);
      
      for (const result of results) {
        if (result.status === 'unknown') {
          const retryDomainStatus = retryStatusMap.get(result.domain);
          if (retryDomainStatus) {
            let retryStatus = convertDomainrStatus(retryDomainStatus);
            
            // If still unknown, try DNS check one more time
            if (retryStatus === 'unknown') {
              retryStatus = await checkDomainAvailabilityDNS(result.domain);
            }
            
            // Update result status
            result.status = retryStatus;
            
            // Update cache with new status
            await db.prepare(`
              INSERT OR REPLACE INTO domain_cache (domain, is_available, last_checked)
              VALUES (?, ?, datetime('now'))
            `).bind(
              result.domain,
              retryStatus === 'available' ? 1 : retryStatus === 'taken' ? 0 : 2
            ).run();
            
            // If status changed to available, get registrars
            if (retryStatus === 'available' && !result.registrars) {
              const tld = result.tld;
              const domainRegistrars: RegistrarWithPrice[] = registrars.results
                .filter((r: any) => r.tld === tld && r.price !== null)
                .reduce((acc: RegistrarWithPrice[], curr: any) => {
                  if (!acc.find(r => r.id === curr.id)) {
                    acc.push({
                      id: curr.id,
                      name: curr.name,
                      website: curr.website,
                      affiliate_link_template: curr.affiliate_link_template,
                      logo_url: curr.logo_url,
                      is_active: curr.is_active,
                      display_order: curr.display_order,
                      created_at: curr.created_at,
                      updated_at: curr.updated_at,
                      price: curr.price,
                      renewal_price: curr.renewal_price,
                      transfer_price: curr.transfer_price,
                      currency: curr.currency,
                      register_url: curr.affiliate_link_template.replace('{domain}', result.domain)
                    });
                  }
                  return acc;
                }, [])
                .slice(0, 10);
              result.registrars = domainRegistrars;
            }
            
            // Update search history with final status
            try {
              await db.prepare(`
                UPDATE search_history 
                SET status = ?
                WHERE domain = ? AND search_query = ?
                ORDER BY searched_at DESC
                LIMIT 1
              `).bind(retryStatus, result.domain, normalized).run();
            } catch (err) {
              console.error('Failed to update search history:', err);
            }
          }
        }
      }
    }

    // Sort results: available first, then taken, then unknown
    results.sort((a, b) => {
      const statusOrder = { available: 0, taken: 1, unknown: 2 };
      return statusOrder[a.status] - statusOrder[b.status];
    });

    // If Japanese language, add .jp domain to results
    if (requestLanguage === 'ja') {
      // Extract base domain name from query
      const baseDomain = normalized.split(/[\s,]+/)[0].split('.')[0];
      const jpDomain = `${baseDomain}.jp`;
      
      // Check if .jp domain is already in results
      const hasJpDomain = results.some(r => r.domain === jpDomain);
      
      if (!hasJpDomain && baseDomain) {
        // Check .jp domain status
        try {
          const jpStatusMap = await domainrStatus([jpDomain], apiKeyRecord.api_key);
          const jpDomainStatus = jpStatusMap.get(jpDomain);
          
          if (jpDomainStatus) {
            let jpStatus = convertDomainrStatus(jpDomainStatus);
            
            if (jpStatus === 'unknown') {
              jpStatus = await checkDomainAvailabilityDNS(jpDomain);
            }
            
            // Update cache
            await db.prepare(`
              INSERT OR REPLACE INTO domain_cache (domain, is_available, last_checked)
              VALUES (?, ?, datetime('now'))
            `).bind(
              jpDomain,
              jpStatus === 'available' ? 1 : jpStatus === 'taken' ? 0 : 2
            ).run();
            
            // Get registrars for .jp TLD
            const jpRegistrars: RegistrarWithPrice[] = registrars.results
              .filter((r: any) => r.tld === '.jp' && r.price !== null)
              .reduce((acc: RegistrarWithPrice[], curr: any) => {
                if (!acc.find(r => r.id === curr.id)) {
                  acc.push({
                    id: curr.id,
                    name: curr.name,
                    website: curr.website,
                    affiliate_link_template: curr.affiliate_link_template,
                    logo_url: curr.logo_url,
                    is_active: curr.is_active,
                    display_order: curr.display_order,
                    created_at: curr.created_at,
                    updated_at: curr.updated_at,
                    price: curr.price,
                    renewal_price: curr.renewal_price,
                    transfer_price: curr.transfer_price,
                    currency: curr.currency,
                    register_url: curr.affiliate_link_template.replace('{domain}', jpDomain)
                  });
                }
                return acc;
              }, [])
              .slice(0, 10);
            
            // Add .jp domain to results
            results.push({
              domain: jpDomain,
              tld: '.jp',
              status: jpStatus,
              registrars: jpStatus === 'available' ? jpRegistrars : undefined,
              whois: jpStatus === 'taken' ? null : undefined,
              cached: false
            });
            
            // Save to search history
            try {
              const userIP = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
              const userAgent = c.req.header('user-agent') || '';
              
              await db.prepare(`
                INSERT INTO search_history (domain, status, tld, search_query, language, user_ip, user_agent, searched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
              `).bind(jpDomain, jpStatus, '.jp', normalized, 'ja', userIP.substring(0, 50), userAgent.substring(0, 200)).run();
            } catch (err) {
              console.error('Failed to save JP domain to history:', err);
            }
          }
        } catch (err) {
          console.error('Failed to check .jp domain:', err);
        }
      }
    }

    const response: SearchResponse = {
      query: normalized,
      results,
      timestamp: new Date().toISOString()
    }

    return c.json(response)
  } catch (error) {
    console.error('Search error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

/**
 * GET /api/whois/:domain
 * Get WHOIS information for a domain
 */
app.get('/api/whois/:domain', async (c) => {
  try {
    const domain = c.req.param('domain')
    const db = c.env.DB

    // Get Whois55 API key
    const apiKeyRecord = await db.prepare(`
      SELECT api_key FROM api_keys 
      WHERE service_name = 'whois55_api' AND is_active = 1
      LIMIT 1
    `).first() as ApiKey | null

    const whoisData = await fetchWhoisData(domain, apiKeyRecord?.api_key)

    // Cache the WHOIS data
    await db.prepare(`
      INSERT OR REPLACE INTO domain_cache (domain, is_available, whois_data, last_checked)
      VALUES (?, 0, ?, datetime('now'))
    `).bind(domain, JSON.stringify(whoisData)).run()

    return c.json({
      domain,
      whois: whoisData,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('WHOIS error:', error)
    return c.json({ error: 'Failed to fetch WHOIS data' }, 500)
  }
})

/**
 * GET /api/exchange-rate
 * Get current exchange rate (USD to JPY)
 */
app.get('/api/exchange-rate', async (c) => {
  try {
    const db = c.env.DB
    
    // Check if we have a recent rate (within 24 hours)
    const cached = await db.prepare(`
      SELECT rate, last_updated FROM exchange_rates 
      WHERE base_currency = 'USD' AND target_currency = 'JPY'
      ORDER BY last_updated DESC
      LIMIT 1
    `).first()
    
    const now = new Date()
    let rate = 150 // Default fallback rate
    
    if (cached) {
      const lastUpdated = new Date(cached.last_updated as string)
      const hoursSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60)
      
      // If rate is less than 24 hours old, use cached rate
      if (hoursSinceUpdate < 24) {
        return c.json({ 
          rate: cached.rate, 
          lastUpdated: cached.last_updated,
          cached: true 
        })
      }
      
      rate = cached.rate as number
    }
    
    // Fetch new rate from API
    try {
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
      const data = await response.json() as any
      
      if (data.rates && data.rates.JPY) {
        rate = data.rates.JPY
        
        // Update database
        await db.prepare(`
          INSERT OR REPLACE INTO exchange_rates (base_currency, target_currency, rate, last_updated)
          VALUES ('USD', 'JPY', ?, datetime('now'))
        `).bind(rate).run()
      }
    } catch (apiError) {
      console.error('Exchange rate API error:', apiError)
      // If API fails, use cached or default rate
    }
    
    return c.json({ 
      rate, 
      lastUpdated: now.toISOString(),
      cached: false 
    })
  } catch (error) {
    console.error('Exchange rate error:', error)
    return c.json({ rate: 150, error: 'Failed to fetch rate, using default' }, 500)
  }
})

/**
 * GET /api/registrars
 * Get all active registrars
 */
app.get('/api/registrars', async (c) => {
  try {
    const db = c.env.DB
    const result = await db.prepare(`
      SELECT * FROM registrars 
      WHERE is_active = 1 
      ORDER BY display_order ASC
    `).all()

    return c.json(result.results)
  } catch (error) {
    console.error('Registrars error:', error)
    return c.json({ error: 'Failed to fetch registrars' }, 500)
  }
})

// ============================================
// Admin API Routes
// ============================================

/**
 * GET /api/admin/registrars
 * Get all registrars (admin)
 */
app.get('/api/admin/registrars', async (c) => {
  try {
    const db = c.env.DB
    const result = await db.prepare(`
      SELECT * FROM registrars ORDER BY display_order ASC
    `).all()

    return c.json(result.results)
  } catch (error) {
    return c.json({ error: 'Failed to fetch registrars' }, 500)
  }
})

/**
 * POST /api/admin/registrars
 * Create new registrar
 */
app.post('/api/admin/registrars', async (c) => {
  try {
    const db = c.env.DB
    const data = await c.req.json()

    const result = await db.prepare(`
      INSERT INTO registrars (name, website, affiliate_link_template, logo_url, display_order)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      data.name,
      data.website,
      data.affiliate_link_template,
      data.logo_url || null,
      data.display_order || 0
    ).run()

    return c.json({ id: result.meta.last_row_id, ...data })
  } catch (error) {
    return c.json({ error: 'Failed to create registrar' }, 500)
  }
})

/**
 * PUT /api/admin/registrars/:id
 * Update registrar
 */
app.put('/api/admin/registrars/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')
    const data = await c.req.json()

    await db.prepare(`
      UPDATE registrars 
      SET name = ?, website = ?, affiliate_link_template = ?, 
          logo_url = ?, is_active = ?, display_order = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      data.name,
      data.website,
      data.affiliate_link_template,
      data.logo_url,
      data.is_active,
      data.display_order,
      id
    ).run()

    return c.json({ success: true })
  } catch (error) {
    return c.json({ error: 'Failed to update registrar' }, 500)
  }
})

/**
 * DELETE /api/admin/registrars/:id
 * Delete registrar
 */
app.delete('/api/admin/registrars/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')

    // First delete all pricing records for this registrar
    await db.prepare('DELETE FROM registrar_pricing WHERE registrar_id = ?').bind(id).run()
    
    // Then delete the registrar
    await db.prepare('DELETE FROM registrars WHERE id = ?').bind(id).run()

    return c.json({ success: true })
  } catch (error) {
    return c.json({ error: 'Failed to delete registrar' }, 500)
  }
})

/**
 * GET /api/admin/pricing
 * Get all pricing records
 */
app.get('/api/admin/pricing', async (c) => {
  try {
    const db = c.env.DB
    const result = await db.prepare(`
      SELECT rp.*, r.name as registrar_name
      FROM registrar_pricing rp
      JOIN registrars r ON rp.registrar_id = r.id
      ORDER BY rp.registrar_id, rp.tld
    `).all()

    return c.json(result.results)
  } catch (error) {
    return c.json({ error: 'Failed to fetch pricing' }, 500)
  }
})

/**
 * POST /api/admin/pricing
 * Create or replace pricing record
 * If a record with the same registrar_id, tld, and currency exists, it will be replaced
 */
app.post('/api/admin/pricing', async (c) => {
  try {
    const db = c.env.DB
    const data = await c.req.json()

    // REPLACE INTO: automatically deletes existing record with same UNIQUE constraint
    // and inserts the new record
    const result = await db.prepare(`
      REPLACE INTO registrar_pricing (registrar_id, tld, currency, price, renewal_price, transfer_price)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      data.registrar_id,
      data.tld,
      data.currency || 'USD',
      data.price,
      data.renewal_price || null,
      data.transfer_price || null
    ).run()

    return c.json({ id: result.meta.last_row_id, ...data })
  } catch (error) {
    return c.json({ error: 'Failed to create pricing' }, 500)
  }
})

/**
 * PUT /api/admin/pricing/:id
 * Update pricing record
 */
app.put('/api/admin/pricing/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')
    const data = await c.req.json()

    await db.prepare(`
      UPDATE registrar_pricing 
      SET registrar_id = ?, tld = ?, currency = ?, price = ?, renewal_price = ?, transfer_price = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      data.registrar_id,
      data.tld,
      data.currency,
      data.price,
      data.renewal_price,
      data.transfer_price,
      id
    ).run()

    return c.json({ success: true })
  } catch (error) {
    return c.json({ error: 'Failed to update pricing' }, 500)
  }
})

/**
 * DELETE /api/admin/pricing/:id
 * Delete pricing record
 */
app.delete('/api/admin/pricing/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')

    await db.prepare('DELETE FROM registrar_pricing WHERE id = ?').bind(id).run()

    return c.json({ success: true })
  } catch (error) {
    return c.json({ error: 'Failed to delete pricing' }, 500)
  }
})

/**
 * GET /api/admin/apikeys
 * Get all API keys
 */
app.get('/api/admin/apikeys', async (c) => {
  try {
    const db = c.env.DB
    const result = await db.prepare(`
      SELECT id, service_name, 
             SUBSTR(api_key, 1, 8) || '...' as api_key_masked,
             base_url, is_active, created_at, updated_at
      FROM api_keys
    `).all()

    return c.json(result.results)
  } catch (error) {
    return c.json({ error: 'Failed to fetch API keys' }, 500)
  }
})

/**
 * PUT /api/admin/apikeys/:id
 * Update API key
 */
app.put('/api/admin/apikeys/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')
    const data = await c.req.json()

    await db.prepare(`
      UPDATE api_keys 
      SET api_key = ?, api_secret = ?, base_url = ?, is_active = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      data.api_key,
      data.api_secret || null,
      data.base_url || null,
      data.is_active,
      id
    ).run()

    return c.json({ success: true })
  } catch (error) {
    return c.json({ error: 'Failed to update API key' }, 500)
  }
})

// ============================================
// Settings Management API
// ============================================

/**
 * GET /api/admin/settings
 * Get all settings
 */
app.get('/api/admin/settings', async (c) => {
  try {
    const db = c.env.DB
    const result = await db.prepare(`
      SELECT setting_key, setting_value, description, updated_at
      FROM settings
    `).all()

    return c.json(result.results)
  } catch (error) {
    return c.json({ error: 'Failed to fetch settings' }, 500)
  }
})

/**
 * PUT /api/admin/settings/:key
 * Update a setting
 */
app.put('/api/admin/settings/:key', async (c) => {
  try {
    const db = c.env.DB
    const key = c.req.param('key')
    const data = await c.req.json()

    await db.prepare(`
      INSERT OR REPLACE INTO settings (setting_key, setting_value, updated_at)
      VALUES (?, ?, datetime('now'))
    `).bind(key, data.value).run()

    return c.json({ success: true })
  } catch (error) {
    return c.json({ error: 'Failed to update setting' }, 500)
  }
})

/**
 * GET /api/settings/tinymce-key
 * Get TinyMCE API key for frontend (public endpoint for admin only)
 */
app.get('/api/settings/tinymce-key', async (c) => {
  try {
    const db = c.env.DB
    const result = await db.prepare(`
      SELECT setting_value
      FROM settings
      WHERE setting_key = 'tinymce_api_key'
    `).first() as { setting_value: string } | null

    return c.json({ 
      api_key: result?.setting_value || 'no-api-key'
    })
  } catch (error) {
    return c.json({ api_key: 'no-api-key' })
  }
})

/**
 * GET /api/settings/broker-link
 * Get broker link for frontend (public endpoint)
 */
app.get('/api/settings/broker-link', async (c) => {
  try {
    const db = c.env.DB
    const result = await db.prepare(`
      SELECT setting_value
      FROM settings
      WHERE setting_key = 'domain_broker_link'
    `).first() as { setting_value: string } | null

    return c.json({ 
      broker_link: result?.setting_value || null 
    })
  } catch (error) {
    return c.json({ error: 'Failed to fetch broker link' }, 500)
  }
})

/**
 * GET /api/admin/history/recent
 * Get recent 100 search history records
 */
app.get('/api/admin/history/recent', async (c) => {
  try {
    const db = c.env.DB
    const result = await db.prepare(`
      SELECT id, domain, status, tld, search_query, language, searched_at
      FROM search_history
      ORDER BY searched_at DESC
      LIMIT 100
    `).all()

    // Convert searched_at to JST
    const resultsWithJST = result.results.map((record: any) => ({
      ...record,
      searched_at: convertToJST(record.searched_at)
    }))

    return c.json(resultsWithJST)
  } catch (error) {
    return c.json({ error: 'Failed to fetch search history' }, 500)
  }
})

/**
 * GET /api/admin/history/months
 * Get list of available months with search data
 */
app.get('/api/admin/history/months', async (c) => {
  try {
    const db = c.env.DB
    const result = await db.prepare(`
      SELECT DISTINCT strftime('%Y-%m', searched_at) as month,
             COUNT(*) as count
      FROM search_history
      GROUP BY month
      ORDER BY month DESC
      LIMIT 24
    `).all()

    return c.json(result.results)
  } catch (error) {
    return c.json({ error: 'Failed to fetch month list' }, 500)
  }
})

/**
 * GET /api/admin/history/export/:month
 * Export search history for a specific month as CSV
 */
app.get('/api/admin/history/export/:month', async (c) => {
  try {
    const db = c.env.DB
    const month = c.req.param('month') // Format: YYYY-MM
    
    const result = await db.prepare(`
      SELECT domain, status, tld, search_query, language, user_ip, searched_at
      FROM search_history
      WHERE strftime('%Y-%m', searched_at) = ?
      ORDER BY searched_at DESC
    `).bind(month).all()

    // Generate CSV with JST timezone
    const headers = ['searched_at_jst', 'domain', 'tld', 'status', 'search_query', 'language', 'user_ip'];
    const csvRows = [headers.join(',')];
    
    result.results.forEach((row: any) => {
      const values = headers.map(header => {
        let value: string;
        if (header === 'searched_at_jst') {
          value = convertToJST(row.searched_at);
        } else {
          value = row[header.replace('_jst', '')];
        }
        if (value === null || value === undefined) value = '';
        value = String(value);
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          value = '"' + value.replace(/"/g, '""') + '"';
        }
        return value;
      });
      csvRows.push(values.join(','));
    });

    const csvContent = csvRows.join('\n');
    
    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="search_history_${month}.csv"`
      }
    });
  } catch (error) {
    return c.json({ error: 'Failed to export history' }, 500)
  }
})

// ============================================
// Content Pages API
// ============================================

/**
 * GET /api/content/:page_key
 * Get content page by key (public endpoint)
 */
app.get('/api/content/:page_key', async (c) => {
  try {
    const db = c.env.DB
    const pageKey = c.req.param('page_key')
    
    const result = await db.prepare(`
      SELECT page_key, title_en, title_ja, content_en, content_ja
      FROM content_pages
      WHERE page_key = ? AND is_active = 1
    `).bind(pageKey).first()
    
    if (!result) {
      return c.json({ error: 'Page not found' }, 404)
    }
    
    return c.json(result)
  } catch (error) {
    return c.json({ error: 'Failed to fetch content' }, 500)
  }
})

/**
 * GET /api/admin/content
 * Get all content pages (admin)
 */
app.get('/api/admin/content', async (c) => {
  try {
    const db = c.env.DB
    const result = await db.prepare(`
      SELECT id, page_key, title_en, title_ja, 
             SUBSTR(content_en, 1, 100) as content_en_preview,
             SUBSTR(content_ja, 1, 100) as content_ja_preview,
             is_active, updated_at
      FROM content_pages
      ORDER BY page_key
    `).all()
    
    return c.json(result.results)
  } catch (error) {
    return c.json({ error: 'Failed to fetch content pages' }, 500)
  }
})

/**
 * GET /api/admin/content/:id
 * Get full content page by ID (admin)
 */
app.get('/api/admin/content/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')
    
    const result = await db.prepare(`
      SELECT * FROM content_pages WHERE id = ?
    `).bind(id).first()
    
    if (!result) {
      return c.json({ error: 'Page not found' }, 404)
    }
    
    return c.json(result)
  } catch (error) {
    return c.json({ error: 'Failed to fetch content page' }, 500)
  }
})

/**
 * PUT /api/admin/content/:id
 * Update content page (admin) - with version history
 */
app.put('/api/admin/content/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')
    const data = await c.req.json()
    
    // Get current content for versioning
    const currentContent = await db.prepare(`
      SELECT * FROM content_pages WHERE id = ?
    `).bind(id).first()
    
    if (currentContent) {
      // Try to save version history (ignore errors if table doesn't exist)
      try {
        // Get next version number
        const versionResult = await db.prepare(`
          SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
          FROM content_versions
          WHERE content_page_id = ?
        `).bind(id).first()
        
        const nextVersion = versionResult?.next_version || 1
        
        // Save current content as a version
        await db.prepare(`
          INSERT INTO content_versions 
          (content_page_id, version_number, title_en, title_ja, content_en, content_ja, edited_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          id,
          nextVersion,
          currentContent.title_en,
          currentContent.title_ja,
          currentContent.content_en,
          currentContent.content_ja,
          'admin'
        ).run()
      } catch (versionError) {
        console.log('Version history not available yet:', versionError)
      }
    }
    
    // Update content
    await db.prepare(`
      UPDATE content_pages 
      SET title_en = ?, title_ja = ?, content_en = ?, content_ja = ?, 
          is_active = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      data.title_en,
      data.title_ja,
      data.content_en,
      data.content_ja,
      data.is_active,
      id
    ).run()
    
    return c.json({ success: true })
  } catch (error) {
    return c.json({ error: 'Failed to update content page' }, 500)
  }
})

/**
 * GET /api/admin/content/:id/versions
 * Get version history for a content page
 */
app.get('/api/admin/content/:id/versions', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')
    
    const result = await db.prepare(`
      SELECT id, version_number, title_en, title_ja, 
             edited_by, created_at
      FROM content_versions
      WHERE content_page_id = ?
      ORDER BY version_number DESC
    `).bind(id).all()
    
    return c.json(result.results)
  } catch (error) {
    console.error('Version history error:', error)
    return c.json({ error: 'Failed to fetch version history' }, 500)
  }
})

/**
 * GET /api/admin/content/version/:version_id
 * Get specific version details
 */
app.get('/api/admin/content/version/:version_id', async (c) => {
  try {
    const db = c.env.DB
    const versionId = c.req.param('version_id')
    
    const result = await db.prepare(`
      SELECT * FROM content_versions WHERE id = ?
    `).bind(versionId).first()
    
    if (!result) {
      return c.json({ error: 'Version not found' }, 404)
    }
    
    return c.json(result)
  } catch (error) {
    return c.json({ error: 'Failed to fetch version' }, 500)
  }
})

// ============================================
// Main Page Route
// ============================================

app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en" class="light">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>inu.name - Find Your Perfect Domain</title>
        <meta name="description" content="Search and check domain availability instantly. Find the perfect domain name for your project.">
        <link rel="icon" type="image/svg+xml" href="/favicon.svg">
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <style>
          :root {
            --bg-primary: #ffffff;
            --bg-secondary: #f9fafb;
            --bg-header: #ffffff;
            --bg-footer: #f9fafb;
            --text-primary: #111827;
            --text-secondary: #6b7280;
            --border-color: #e5e7eb;
            --success-bg: #dcfce7;
            --success-text: #166534;
            --error-bg: #fee2e2;
            --error-text: #991b1b;
          }
          
          .dark {
            --bg-primary: #111827;
            --bg-secondary: #1f2937;
            --bg-header: #111827;
            --bg-footer: #18202e;
            --text-primary: #f9fafb;
            --text-secondary: #9ca3af;
            --border-color: #374151;
            --success-bg: #064e3b;
            --success-text: #86efac;
            --error-bg: #7f1d1d;
            --error-text: #fca5a5;
          }
          
          body {
            background-color: var(--bg-primary);
            color: var(--text-primary);
            transition: all 0.3s ease;
          }
          
          .domain-card {
            background-color: var(--bg-primary);
            border: 1px solid var(--border-color);
            transition: all 0.2s ease;
          }
          
          .domain-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          }
          
          .status-available {
            background-color: var(--success-bg);
            color: var(--success-text);
          }
          
          .status-taken {
            background-color: var(--error-bg);
            color: var(--error-text);
          }
          
          .search-box {
            background-color: var(--bg-secondary);
            border: 2px solid var(--border-color);
          }
          
          .search-box:focus {
            outline: none;
            border-color: #3b82f6;
          }
          
          .loader {
            border: 3px solid var(--border-color);
            border-top: 3px solid #3b82f6;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
          }
          
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          .fade-in {
            animation: fadeIn 0.3s ease-in;
          }
          
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          /* Sticky footer layout */
          html, body {
            height: 100%;
            margin: 0;
          }
          
          body {
            display: flex;
            flex-direction: column;
            min-height: 100vh;
          }
          
          main {
            flex: 1 0 auto;
          }
          
          /* Results wrapper */
          .results-wrapper {
            max-width: 600px;
            margin: 0 auto;
          }
          
          /* Footer grid */
          .footer-grid {
            display: grid;
            grid-template-columns: 2fr 1fr 1fr;
            gap: 2rem;
            align-items: start;
          }
          
          /* Logo tooltip */
          .logo-link {
            position: relative;
            cursor: pointer;
            transition: transform 0.2s ease;
          }
          
          .logo-link:hover {
            transform: scale(1.1);
          }
          
          .logo-tooltip {
            position: absolute;
            left: 100%;
            top: 50%;
            transform: translateY(-50%);
            margin-left: 0.5rem;
            background-color: var(--bg-secondary);
            border: 1px solid var(--border-color);
            padding: 0.5rem 0.75rem;
            border-radius: 0.5rem;
            white-space: nowrap;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s ease;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            z-index: 100;
            color: var(--text-primary);
          }
          
          .logo-link:hover .logo-tooltip {
            opacity: 1;
          }
          
          /* Modal styles */
          .modal-overlay {
            position: fixed;
            inset: 0;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 50;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
          }
          
          .modal-content {
            background-color: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 0.5rem;
            padding: 1.5rem;
            max-width: 42rem;
            width: 100%;
            max-height: 80vh;
            overflow-y: auto;
          }
          
          /* Mobile responsive styles */
          @media (max-width: 768px) {
            .header-title-full {
              display: none !important;
            }
            
            .header-actions-desktop {
              display: none !important;
            }
            
            .header-menu-mobile {
              display: block !important;
            }
            
            .logo-tooltip {
              display: none !important;
            }
            
            .results-wrapper {
              max-width: 100%;
            }
            
            .footer-grid {
              grid-template-columns: 1fr 1fr;
              gap: 1rem;
              font-size: 0.875rem;
            }
            
            .footer-about {
              grid-column: 1 / -1;
            }
            
            /* Modal adjustments for mobile - bottom sheet style */
            .modal-overlay {
              align-items: flex-end;
              padding: 0;
            }
            
            .modal-content {
              max-width: 100%;
              max-height: 85vh;
              border-radius: 1rem 1rem 0 0;
              padding: 1rem;
            }
            
            /* Results font size for mobile */
            .domain-card {
              font-size: 0.9rem;
            }
          }
          
          @media (min-width: 769px) {
            .header-menu-mobile {
              display: none !important;
            }
            
            .header-actions-desktop {
              display: flex !important;
            }
            
            .header-title-full {
              display: block !important;
            }
          }
          
          footer {
            flex-shrink: 0;
          }
        </style>
    </head>
    <body>
        <!-- Header -->
        <header style="background-color: var(--bg-header); border-bottom: 1px solid var(--border-color);" class="sticky top-0 z-50">
            <div class="max-w-7xl mx-auto px-4 py-4">
                <div class="flex items-center" style="gap: 1rem;">
                    <!-- Left: Logo and Title -->
                    <div class="flex items-center flex-shrink-0" style="gap: 0.5rem;">
                        <a href="/" class="logo-link relative">
                            <i class="fas fa-dog text-blue-600 text-2xl"></i>
                            <div class="logo-tooltip">
                                <div style="font-size: 0.68rem; margin-bottom: -0.25rem;">
                                    <span data-i18n="tagline">Fetch Domain, Woof!</span>
                                </div>
                                <div class="font-bold">inu.name</div>
                            </div>
                        </a>
                        <div class="header-title-full">
                            <div style="color: var(--text-secondary); font-size: 0.68rem; margin-bottom: -0.25rem;">
                                <span data-i18n="tagline">Fetch Domain, Woof!</span>
                            </div>
                            <h1 class="text-xl font-bold">inu.name</h1>
                        </div>
                    </div>
                    
                    <!-- Search Box (flexible width) -->
                    <div class="flex-1 min-w-0">
                        <div class="relative">
                            <input 
                                type="text" 
                                id="searchInput" 
                                class="w-full px-4 py-2 pr-10 text-base rounded-lg search-box"
                                placeholder="Enter a domain or keyword..."
                                data-i18n-placeholder="search.placeholder"
                            >
                            <button 
                                id="clearBtn" 
                                class="absolute right-2 top-1/2 transform -translate-y-1/2 px-2 py-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition hidden"
                                title="Clear search"
                            >
                                <i class="fas fa-times-circle text-lg"></i>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Right: Actions - Desktop -->
                    <div class="header-actions-desktop flex items-center space-x-2 flex-shrink-0">
                        <!-- Language Toggle -->
                        <button id="langToggle" class="px-3 py-1 rounded transition" style="border: 1px solid transparent;" onmouseover="this.style.backgroundColor='var(--bg-primary)'; this.style.borderColor='var(--border-color)';" onmouseout="this.style.backgroundColor='transparent'; this.style.borderColor='transparent';">
                            <i class="fas fa-language mr-1"></i>
                            <span id="currentLang">EN</span>
                        </button>
                        <!-- Currency Toggle -->
                        <button id="currencyToggle" class="px-3 py-1 rounded transition" style="border: 1px solid transparent;" onmouseover="this.style.backgroundColor='var(--bg-primary)'; this.style.borderColor='var(--border-color)';" onmouseout="this.style.backgroundColor='transparent'; this.style.borderColor='transparent';" title="Switch Currency">
                            <i class="fas fa-dollar-sign" id="currencyIcon"></i>
                        </button>
                        <!-- Theme Toggle -->
                        <button id="themeToggle" class="px-3 py-1 rounded transition" style="border: 1px solid transparent;" onmouseover="this.style.backgroundColor='var(--bg-primary)'; this.style.borderColor='var(--border-color)';" onmouseout="this.style.backgroundColor='transparent'; this.style.borderColor='transparent';">
                            <i class="fas fa-moon" id="themeIcon"></i>
                        </button>
                        <!-- Admin Link -->
                        <a href="/admin" class="px-3 py-1 rounded transition" style="border: 1px solid transparent;" onmouseover="this.style.backgroundColor='var(--bg-primary)'; this.style.borderColor='var(--border-color)';" onmouseout="this.style.backgroundColor='transparent'; this.style.borderColor='transparent';">
                            <i class="fas fa-cog"></i>
                        </a>
                    </div>
                    
                    <!-- Right: Mobile Menu Button -->
                    <button id="mobileMenuBtn" class="header-menu-mobile px-3 py-1 rounded transition" style="border: 1px solid transparent;" onmouseover="this.style.backgroundColor='var(--bg-primary)'; this.style.borderColor='var(--border-color)';" onmouseout="this.style.backgroundColor='transparent'; this.style.borderColor='transparent';">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                </div>
            </div>
            
            <!-- Mobile Menu Dropdown -->
            <div id="mobileMenu" class="hidden" style="background-color: var(--bg-secondary); border-top: 1px solid var(--border-color);">
                <div class="max-w-7xl mx-auto px-4 py-2">
                    <div class="flex flex-col space-y-2">
                        <button id="langToggleMobile" class="flex items-center px-3 py-2 rounded transition hover:bg-opacity-50" style="background-color: transparent;" onmouseover="this.style.backgroundColor='var(--bg-primary)'" onmouseout="this.style.backgroundColor='transparent'">
                            <i class="fas fa-language mr-2"></i>
                            <span data-i18n="header.language">Language</span>
                            <span class="ml-auto" id="currentLangMobile">EN</span>
                        </button>
                        <button id="currencyToggleMobile" class="flex items-center px-3 py-2 rounded transition hover:bg-opacity-50" style="background-color: transparent;" onmouseover="this.style.backgroundColor='var(--bg-primary)'" onmouseout="this.style.backgroundColor='transparent'">
                            <i class="fas fa-dollar-sign mr-2" id="currencyIconMobile"></i>
                            <span data-i18n="header.currency">Currency</span>
                        </button>
                        <button id="themeToggleMobile" class="flex items-center px-3 py-2 rounded transition hover:bg-opacity-50" style="background-color: transparent;" onmouseover="this.style.backgroundColor='var(--bg-primary)'" onmouseout="this.style.backgroundColor='transparent'">
                            <i class="fas fa-moon mr-2" id="themeIconMobile"></i>
                            <span data-i18n="header.theme">Theme</span>
                        </button>
                        <a href="/admin" class="flex items-center px-3 py-2 rounded transition hover:bg-opacity-50" style="background-color: transparent;" onmouseover="this.style.backgroundColor='var(--bg-primary)'" onmouseout="this.style.backgroundColor='transparent'">
                            <i class="fas fa-cog mr-2"></i>
                            <span data-i18n="header.admin">Admin</span>
                        </a>
                    </div>
                </div>
            </div>
        </header>

        <!-- Main Content -->
        <main>
            <div class="max-w-7xl mx-auto px-4 py-4">
                <div class="results-wrapper">
                    <!-- Loading State -->
                    <div id="loadingState" class="hidden text-center py-12">
                        <div class="loader mx-auto mb-4"></div>
                        <p style="color: var(--text-secondary);" data-i18n="search.loading">Searching domains...</p>
                    </div>

                    <!-- Results -->
                    <div id="resultsContainer" class="hidden">
                        <div id="resultsList" class="divide-y" style="border-color: var(--border-color);">
                            <!-- Results will be inserted here -->
                        </div>
                    </div>
                </div>
            </div>
        </main>

        <!-- Footer -->
        <footer style="background-color: var(--bg-footer); border-top: 1px solid var(--border-color);">
            <div class="max-w-7xl mx-auto px-4 py-6">
                <!-- Footer Links - Single Row -->
                <div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mb-4">
                    <!-- Logo and Title -->
                    <a href="/" class="flex items-center space-x-2 hover:opacity-80 transition">
                        <i class="fas fa-dog text-blue-600"></i>
                        <div>
                            <h3 class="font-bold text-sm">inu.name</h3>
                            <p class="text-xs" style="color: var(--text-secondary); margin-top: -2px;">
                                Fast domain search tool
                            </p>
                        </div>
                    </a>
                    
                    <span style="color: var(--border-color);">|</span>
                    
                    <!-- Content Links -->
                    <a href="javascript:void(0)" onclick="showContentPage('how_to_use')" 
                       class="text-xs hover:text-blue-600 transition" 
                       style="color: var(--text-secondary);"
                       data-i18n="footer.how_to_use">How to Use</a>
                    
                    <a href="javascript:void(0)" onclick="showContentPage('company')" 
                       class="text-xs hover:text-blue-600 transition" 
                       style="color: var(--text-secondary);"
                       data-i18n="footer.company">Company</a>
                    
                    <a href="javascript:void(0)" onclick="showContentPage('terms')" 
                       class="text-xs hover:text-blue-600 transition" 
                       style="color: var(--text-secondary);"
                       data-i18n="footer.terms">Terms</a>
                    
                    <a href="javascript:void(0)" onclick="showContentPage('privacy')" 
                       class="text-xs hover:text-blue-600 transition" 
                       style="color: var(--text-secondary);"
                       data-i18n="footer.privacy">Privacy</a>
                    
                    <span style="color: var(--border-color);">|</span>
                    
                    <!-- Social Links -->
                    <a href="https://x.com/inuname" target="_blank" rel="noopener noreferrer" 
                       class="text-base hover:text-blue-400 transition" 
                       style="color: var(--text-secondary);" 
                       title="X (Twitter)">
                        <i class="fab fa-twitter"></i>
                    </a>
                    
                    <a href="https://www.instagram.com/inu.name_/" target="_blank" rel="noopener noreferrer" 
                       class="text-base hover:text-pink-400 transition" 
                       style="color: var(--text-secondary);" 
                       title="Instagram">
                        <i class="fab fa-instagram"></i>
                    </a>
                    
                    <a href="mailto:info@inu.name" 
                       class="text-base hover:text-blue-600 transition" 
                       style="color: var(--text-secondary);" 
                       title="Email">
                        <i class="fas fa-envelope"></i>
                    </a>
                </div>
                
                <!-- Copyright -->
                <div class="text-center text-xs" style="color: var(--text-secondary);">
                    <p>&copy; <span id="currentYear">2025</span> Agarthe LLC — Made with ❤️🤖 in Tokyo</p>
                </div>
            </div>
        </footer>
        
        <!-- Content Page Modal -->
        <div id="contentModal" class="modal-overlay hidden">
            <div class="modal-content" style="max-width: 800px;">
                <div class="flex justify-between items-center mb-4 sticky top-0 z-10 pb-4" style="background-color: var(--bg-primary); border-bottom: 1px solid var(--border-color);">
                    <h3 class="text-xl font-bold" id="contentModalTitle">Content</h3>
                    <button id="closeContentModal" class="text-2xl hover:opacity-70 px-2">&times;</button>
                </div>
                <div id="contentModalBody" class="text-sm prose prose-sm max-w-none" style="color: var(--text-primary);">
                    <div class="loader mx-auto"></div>
                </div>
            </div>
        </div>

        <!-- Domain Details Modal -->
        <div id="domainModal" class="modal-overlay hidden">
            <div class="modal-content">
                <div class="flex justify-between items-center mb-4 sticky top-0 z-10 pb-4" style="background-color: var(--bg-primary); border-bottom: 1px solid var(--border-color);">
                    <h3 class="text-xl font-bold" id="modalTitle">Domain Details</h3>
                    <button id="closeModal" class="text-2xl hover:opacity-70 px-2">&times;</button>
                </div>
                <div id="modalContent" class="text-sm">
                    <div class="loader mx-auto"></div>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js?v=22"></script>
    </body>
    </html>
  `)
})

/**
 * Admin page route
 */
app.get('/admin', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en" class="light">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Admin Panel - inu.name</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg">
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <style>
          :root {
            --bg-primary: #ffffff;
            --bg-secondary: #f9fafb;
            --text-primary: #111827;
            --text-secondary: #6b7280;
            --border-color: #e5e7eb;
          }
          
          .dark {
            --bg-primary: #111827;
            --bg-secondary: #1f2937;
            --text-primary: #f9fafb;
            --text-secondary: #9ca3af;
            --border-color: #374151;
          }
          
          body {
            background-color: var(--bg-primary);
            color: var(--text-primary);
            display: flex;
            flex-direction: column;
            min-height: 100vh;
            margin: 0;
          }
          
          main {
            flex: 1 0 auto;
          }
          
          .panel-card {
            background-color: var(--bg-secondary);
            border: 1px solid var(--border-color);
          }
          
          input, select, textarea {
            background-color: var(--bg-primary);
            border: 1px solid var(--border-color);
            color: var(--text-primary);
          }
          
          table {
            background-color: var(--bg-primary);
          }
          
          tbody tr:hover {
            background-color: var(--bg-secondary);
          }
        </style>
    </head>
    <body>
        <!-- Header -->
        <header style="background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color);" class="sticky top-0 z-50">
            <div class="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
                <div class="flex items-center space-x-2">
                    <i class="fas fa-cog text-blue-600 text-2xl"></i>
                    <h1 class="text-xl font-bold">inu.name Admin</h1>
                </div>
                <div class="flex items-center space-x-4">
                    <button id="themeToggle" class="px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
                        <i class="fas fa-moon" id="themeIcon"></i>
                    </button>
                    <a href="/" class="px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
                        <i class="fas fa-home mr-1"></i>Home
                    </a>
                </div>
            </div>
        </header>

        <!-- Main Content -->
        <main class="max-w-7xl mx-auto px-4 py-8">
            <!-- Tabs -->
            <div class="mb-6 border-b" style="border-color: var(--border-color);">
                <nav class="flex space-x-4">
                    <button class="tab-btn px-4 py-2 font-semibold border-b-2 border-blue-600" data-tab="registrars">
                        <i class="fas fa-building mr-2"></i>Registrars
                    </button>
                    <button class="tab-btn px-4 py-2 font-semibold" style="border-bottom: 2px solid transparent;" data-tab="pricing">
                        <i class="fas fa-dollar-sign mr-2"></i>Pricing
                    </button>
                    <button class="tab-btn px-4 py-2 font-semibold" style="border-bottom: 2px solid transparent;" data-tab="apikeys">
                        <i class="fas fa-key mr-2"></i>API Keys
                    </button>
                    <button class="tab-btn px-4 py-2 font-semibold" style="border-bottom: 2px solid transparent;" data-tab="settings">
                        <i class="fas fa-cog mr-2"></i>Settings
                    </button>
                    <button class="tab-btn px-4 py-2 font-semibold" style="border-bottom: 2px solid transparent;" data-tab="history">
                        <i class="fas fa-history mr-2"></i>History
                    </button>
                    <button class="tab-btn px-4 py-2 font-semibold" style="border-bottom: 2px solid transparent;" data-tab="content">
                        <i class="fas fa-file-alt mr-2"></i>Content Pages
                    </button>
                </nav>
            </div>

            <!-- Registrars Tab -->
            <div id="registrarsTab" class="tab-content">
                <div class="panel-card rounded-lg p-6 mb-6">
                    <h2 class="text-xl font-bold mb-4">Manage Registrars</h2>
                    <div class="flex gap-4">
                        <button id="addRegistrarBtn" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                            <i class="fas fa-plus mr-2"></i>Add Registrar
                        </button>
                        <button id="importRegistrarsBtn" class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">
                            <i class="fas fa-upload mr-2"></i>Import CSV
                        </button>
                        <button id="exportRegistrarsBtn" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                            <i class="fas fa-download mr-2"></i>Export CSV
                        </button>
                    </div>
                </div>
                
                <!-- CSV Import Panel for Registrars -->
                <div id="importRegistrarsPanel" class="panel-card rounded-lg p-6 mb-6 hidden">
                    <h3 class="text-lg font-bold mb-4">Import Registrars from CSV</h3>
                    <p class="text-sm mb-4" style="color: var(--text-secondary);">
                        Format: <code>name,website,affiliate_link_template,logo_url,is_active,display_order</code> (one per line)<br>
                        Example: <code>Namecheap,https://namecheap.com,https://namecheap.com/aff,logo.png,1,1</code>
                    </p>
                    <textarea id="importRegistrarsData" class="w-full h-64 p-4 rounded border font-mono text-sm" style="background-color: var(--bg-primary); border-color: var(--border-color);" placeholder="Namecheap,https://namecheap.com,https://namecheap.com/aff,logo.png,1,1
GoDaddy,https://godaddy.com,https://godaddy.com/aff,logo2.png,1,2"></textarea>
                    <div class="flex gap-2 mt-4">
                        <button id="importRegistrarsExecuteBtn" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                            <i class="fas fa-upload mr-2"></i>Import
                        </button>
                        <button id="importRegistrarsCancelBtn" class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">
                            Cancel
                        </button>
                    </div>
                </div>
                <div class="panel-card rounded-lg p-6">
                    <div class="overflow-x-auto">
                        <table class="w-full" id="registrarsTable">
                            <thead>
                                <tr style="border-bottom: 1px solid var(--border-color);">
                                    <th class="text-left py-3 px-4">ID</th>
                                    <th class="text-left py-3 px-4">Name</th>
                                    <th class="text-left py-3 px-4">Website</th>
                                    <th class="text-left py-3 px-4">Affiliate URL</th>
                                    <th class="text-left py-3 px-4">Status</th>
                                    <th class="text-left py-3 px-4">Order</th>
                                    <th class="text-left py-3 px-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <!-- Will be populated by JS -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Pricing Tab -->
            <div id="pricingTab" class="tab-content hidden">
                <div class="panel-card rounded-lg p-6 mb-6">
                    <h2 class="text-xl font-bold mb-4">Manage Pricing</h2>
                    <div class="flex gap-4">
                        <button id="addPricingBtn" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                            <i class="fas fa-plus mr-2"></i>Add Pricing
                        </button>
                        <button id="bulkImportBtn" class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">
                            <i class="fas fa-upload mr-2"></i>Import CSV
                        </button>
                        <button id="exportPricingBtn" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                            <i class="fas fa-download mr-2"></i>Export CSV
                        </button>
                    </div>
                </div>
                
                <!-- CSV Import Panel for Pricing -->
                <div id="bulkImportPanel" class="panel-card rounded-lg p-6 mb-6 hidden">
                    <h3 class="text-lg font-bold mb-4">Import Pricing Data from CSV</h3>
                    <p class="text-sm mb-4" style="color: var(--text-secondary);">
                        Format: <code>registrar_id,tld,currency,price,renewal_price,transfer_price</code> (one per line)<br>
                        Example: <code>1,.com,USD,10.99,12.99,15.99</code>
                    </p>
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-2">Upload CSV File (optional):</label>
                        <input type="file" id="pricingCsvFile" accept=".csv" class="px-3 py-2 rounded border" 
                               style="background-color: var(--bg-primary); border-color: var(--border-color);">
                        <button id="loadCsvBtn" class="ml-2 px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
                            Load File
                        </button>
                    </div>
                    <textarea id="bulkImportData" class="w-full h-64 p-4 rounded border font-mono text-sm" style="background-color: var(--bg-primary); border-color: var(--border-color);" placeholder="1,.com,USD,10.99,12.99,15.99
1,.net,USD,12.99,14.99,17.99
2,.com,USD,9.99,11.99,14.99"></textarea>
                    <div class="flex gap-2 mt-4">
                        <button id="importExecuteBtn" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                            <i class="fas fa-upload mr-2"></i>Import
                        </button>
                        <button id="importCancelBtn" class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">
                            Cancel
                        </button>
                    </div>
                </div>
                
                <div class="panel-card rounded-lg p-6">
                    <!-- Filters and Pagination Controls -->
                    <div class="mb-4 flex flex-wrap gap-4 items-center">
                        <div class="flex-1 min-w-[200px]">
                            <input type="text" id="pricingSearchInput" placeholder="Search TLD, Registrar or ID..." 
                                   class="w-full px-3 py-2 rounded border" 
                                   style="background-color: var(--bg-primary); border-color: var(--border-color);">
                        </div>
                        <div class="flex items-center gap-2">
                            <label class="text-sm" style="color: var(--text-secondary);">Show:</label>
                            <select id="pricingPageSize" class="px-3 py-2 rounded border" 
                                    style="background-color: var(--bg-primary); border-color: var(--border-color);">
                                <option value="25">25</option>
                                <option value="100">100</option>
                                <option value="500">500</option>
                                <option value="all">All</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="overflow-x-auto">
                        <table class="w-full" id="pricingTable">
                            <thead>
                                <tr style="border-bottom: 1px solid var(--border-color);">
                                    <th class="text-left py-3 px-4">Registrar</th>
                                    <th class="text-left py-3 px-4">TLD</th>
                                    <th class="text-left py-3 px-4">Currency</th>
                                    <th class="text-left py-3 px-4">Price</th>
                                    <th class="text-left py-3 px-4">Renewal</th>
                                    <th class="text-left py-3 px-4">Transfer In</th>
                                    <th class="text-left py-3 px-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <!-- Will be populated by JS -->
                            </tbody>
                        </table>
                    </div>
                    
                    <!-- Pagination Info -->
                    <div class="mt-4 flex justify-between items-center text-sm" style="color: var(--text-secondary);">
                        <div id="pricingResultInfo">Showing 0 of 0 entries</div>
                        <div class="flex gap-2">
                            <button id="pricingPrevBtn" class="px-3 py-1 rounded border hover:bg-gray-100 dark:hover:bg-gray-800" 
                                    style="border-color: var(--border-color);" disabled>
                                <i class="fas fa-chevron-left"></i> Prev
                            </button>
                            <button id="pricingNextBtn" class="px-3 py-1 rounded border hover:bg-gray-100 dark:hover:bg-gray-800" 
                                    style="border-color: var(--border-color);" disabled>
                                Next <i class="fas fa-chevron-right"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- API Keys Tab -->
            <div id="apikeysTab" class="tab-content hidden">
                <div class="panel-card rounded-lg p-6 mb-6">
                    <h2 class="text-xl font-bold mb-4">Manage API Keys</h2>
                    
                    <!-- Domainr API Info -->
                    <div class="mb-4 p-4 bg-blue-50 dark:bg-blue-900 rounded-lg">
                        <h3 class="font-semibold mb-2 text-blue-800 dark:text-blue-200">
                            <i class="fas fa-search mr-2"></i>Domainr API (Required)
                        </h3>
                        <p class="text-sm mb-2" style="color: var(--text-secondary);">
                            This application uses <strong>Domainr API</strong> for domain search and availability checking.
                        </p>
                        <ul class="text-sm space-y-1 ml-4" style="color: var(--text-secondary); list-style: disc;">
                            <li>Get API key from: <a href="https://rapidapi.com/domainr/api/domainr" target="_blank" class="text-blue-600 hover:underline">RapidAPI - Domainr</a></li>
                            <li>Service name: <code class="bg-gray-200 dark:bg-gray-700 px-1 rounded">domainr_api</code></li>
                            <li>Set the RapidAPI key as the API Key value</li>
                            <li>Base URL is preset to: <code class="bg-gray-200 dark:bg-gray-700 px-1 rounded">https://domainr.p.rapidapi.com/v2</code></li>
                        </ul>
                    </div>
                    
                    <!-- Whois55 API Info -->
                    <div class="mb-4 p-4 bg-green-50 dark:bg-green-900 rounded-lg">
                        <h3 class="font-semibold mb-2 text-green-800 dark:text-green-200">
                            <i class="fas fa-info-circle mr-2"></i>Whois55 API (Optional)
                        </h3>
                        <p class="text-sm mb-2" style="color: var(--text-secondary);">
                            This application uses <strong>Whois55 API</strong> for WHOIS information lookup.
                        </p>
                        <ul class="text-sm space-y-1 ml-4" style="color: var(--text-secondary); list-style: disc;">
                            <li>Get API key from: <a href="https://rapidapi.com/iaminwinter/api/whois55" target="_blank" class="text-blue-600 hover:underline">RapidAPI - Whois55</a></li>
                            <li>Service name: <code class="bg-gray-200 dark:bg-gray-700 px-1 rounded">whois55_api</code></li>
                            <li>Set the RapidAPI key as the API Key value</li>
                            <li>Base URL is preset to: <code class="bg-gray-200 dark:bg-gray-700 px-1 rounded">https://whois55.p.rapidapi.com</code></li>
                        </ul>
                    </div>
                </div>
                <div class="panel-card rounded-lg p-6">
                    <div class="space-y-4" id="apiKeysList">
                        <!-- Will be populated by JS -->
                    </div>
                </div>
            </div>

            <!-- Settings Tab -->
            <div id="settingsTab" class="tab-content hidden">
                <div class="panel-card rounded-lg p-6 mb-6">
                    <h2 class="text-xl font-bold mb-4">Application Settings</h2>
                    <p class="text-sm mb-4" style="color: var(--text-secondary);">
                        Configure general application settings and features.
                    </p>
                </div>
                
                <!-- Domain Broker Link Setting -->
                <div class="panel-card rounded-lg p-6">
                    <h3 class="text-lg font-semibold mb-3">
                        <i class="fas fa-handshake mr-2 text-blue-600"></i>
                        Domain Broker Link
                    </h3>
                    <p class="text-sm mb-4" style="color: var(--text-secondary);">
                        Configure the domain broker service link that appears in the WHOIS modal for taken domains.
                        Use <code class="bg-gray-200 dark:bg-gray-700 px-1 rounded">{{ domain }}</code> as a placeholder for the domain name.
                    </p>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium mb-2">Broker Link Template</label>
                            <input 
                                type="text" 
                                id="brokerLinkInput" 
                                class="w-full px-3 py-2 rounded border" 
                                style="background-color: var(--bg-primary); border-color: var(--border-color);"
                                placeholder="https://domainagents.com/offer/{{ domain }}"
                            >
                            <p class="text-xs mt-1" style="color: var(--text-secondary);">
                                Example: <code class="bg-gray-200 dark:bg-gray-700 px-1 rounded">https://domainagents.com/offer/{{ domain }}</code>
                            </p>
                        </div>
                        
                        <button 
                            id="saveBrokerLinkBtn" 
                            class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                            <i class="fas fa-save mr-2"></i>Save Settings
                        </button>
                        
                        <div id="brokerLinkStatus" class="text-sm hidden"></div>
                    </div>
                </div>
            </div>

            <!-- History Tab -->
            <div id="historyTab" class="tab-content hidden">
                <div class="panel-card rounded-lg p-6 mb-6">
                    <h2 class="text-xl font-bold mb-4">Search History</h2>
                    <p class="text-sm mb-4" style="color: var(--text-secondary);">
                        View search history and download monthly reports as CSV.
                    </p>
                </div>
                
                <!-- Monthly Export -->
                <div class="panel-card rounded-lg p-6 mb-6">
                    <h3 class="text-lg font-semibold mb-4">
                        <i class="fas fa-calendar-alt mr-2 text-blue-600"></i>
                        Monthly Export
                    </h3>
                    <div id="monthlyExportList" class="space-y-2">
                        <!-- Dynamically populated -->
                    </div>
                </div>
                
                <!-- Recent History -->
                <div class="panel-card rounded-lg p-6">
                    <h3 class="text-lg font-semibold mb-4">
                        <i class="fas fa-clock mr-2 text-blue-600"></i>
                        Recent Searches (Latest 100)
                    </h3>
                    <div class="overflow-x-auto">
                        <table class="w-full" id="historyTable">
                            <thead>
                                <tr style="border-bottom: 1px solid var(--border-color);">
                                    <th class="text-left py-3 px-4">Date & Time</th>
                                    <th class="text-left py-3 px-4">Domain</th>
                                    <th class="text-left py-3 px-4">TLD</th>
                                    <th class="text-left py-3 px-4">Status</th>
                                    <th class="text-left py-3 px-4">Language</th>
                                </tr>
                            </thead>
                            <tbody>
                                <!-- Will be populated by JS -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
            <!-- Content Pages Tab -->
            <div id="contentTab" class="tab-content hidden">
                <div class="panel-card rounded-lg p-6 mb-6">
                    <h2 class="text-xl font-bold mb-4">Content Pages Management</h2>
                    <p class="text-sm mb-4" style="color: var(--text-secondary);">
                        Manage content for footer links (How to Use, Company, Terms, Privacy)
                    </p>
                    
                    <div class="overflow-x-auto">
                        <table class="w-full" id="contentTable">
                            <thead>
                                <tr style="border-bottom: 1px solid var(--border-color);">
                                    <th class="text-left py-3 px-4">Page</th>
                                    <th class="text-left py-3 px-4">Title (EN)</th>
                                    <th class="text-left py-3 px-4">Title (JA)</th>
                                    <th class="text-left py-3 px-4">Last Updated</th>
                                    <th class="text-left py-3 px-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <!-- Will be populated by JS -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </main>
        
        <!-- Content Page Edit Modal -->
        <div id="contentEditModal" class="modal-overlay hidden">
            <div class="modal-content" style="max-width: 1200px; max-height: 90vh; overflow-y: auto;">
                <div class="flex justify-between items-center mb-4 sticky top-0 z-10 pb-4" style="background-color: var(--bg-primary); border-bottom: 1px solid var(--border-color);">
                    <h3 class="text-xl font-bold" id="contentEditTitle">Edit Content Page</h3>
                    <div class="flex gap-2 items-center">
                        <button id="viewHistoryBtn" class="px-3 py-1 text-sm rounded bg-gray-200 hover:bg-gray-300">
                            <i class="fas fa-history mr-1"></i>History
                        </button>
                        <button id="closeContentEdit" class="text-2xl hover:opacity-70 px-2">&times;</button>
                    </div>
                </div>
                <div id="contentEditBody">
                    <!-- Tab Switcher -->
                    <div class="mb-4 border-b" style="border-color: var(--border-color);">
                        <div class="flex gap-2">
                            <button id="tabEnglish" class="px-4 py-2 font-semibold border-b-2 border-blue-600 text-blue-600">
                                English
                            </button>
                            <button id="tabJapanese" class="px-4 py-2 font-semibold border-b-2" style="border-bottom-color: transparent; color: var(--text-secondary);">
                                日本語
                            </button>
                            <button id="tabPreview" class="px-4 py-2 font-semibold border-b-2" style="border-bottom-color: transparent; color: var(--text-secondary);">
                                <i class="fas fa-eye mr-1"></i>Preview
                            </button>
                        </div>
                    </div>
                    
                    <!-- English Tab -->
                    <div id="englishContent" class="content-edit-tab">
                        <div class="mb-4">
                            <label class="block text-sm font-semibold mb-2">Title</label>
                            <input type="text" id="titleEn" class="w-full px-3 py-2 border rounded" style="border-color: var(--border-color); background-color: var(--bg-primary); color: var(--text-primary);">
                        </div>
                        <div class="mb-4">
                            <label class="block text-sm font-semibold mb-2 flex justify-between items-center">
                                <span>Content</span>
                                <div class="flex gap-2">
                                    <button id="uploadImageEn" class="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
                                        <i class="fas fa-image mr-1"></i>Upload Image
                                    </button>
                                    <button id="switchToHtmlEn" class="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300">
                                        <i class="fas fa-code mr-1"></i>HTML
                                    </button>
                                </div>
                            </label>
                            <div id="contentEn" style="min-height: 400px; background: white;"></div>
                            <textarea id="contentEnHtml" class="w-full hidden" rows="15"></textarea>
                        </div>
                    </div>
                    
                    <!-- Japanese Tab -->
                    <div id="japaneseContent" class="content-edit-tab hidden">
                        <div class="mb-4">
                            <label class="block text-sm font-semibold mb-2">タイトル</label>
                            <input type="text" id="titleJa" class="w-full px-3 py-2 border rounded" style="border-color: var(--border-color); background-color: var(--bg-primary); color: var(--text-primary);">
                        </div>
                        <div class="mb-4">
                            <label class="block text-sm font-semibold mb-2 flex justify-between items-center">
                                <span>コンテンツ</span>
                                <div class="flex gap-2">
                                    <button id="uploadImageJa" class="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
                                        <i class="fas fa-image mr-1"></i>画像アップロード
                                    </button>
                                    <button id="switchToHtmlJa" class="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300">
                                        <i class="fas fa-code mr-1"></i>HTML
                                    </button>
                                </div>
                            </label>
                            <div id="contentJa" style="min-height: 400px; background: white;"></div>
                            <textarea id="contentJaHtml" class="w-full hidden" rows="15"></textarea>
                        </div>
                    </div>
                    
                    <!-- Preview Tab -->
                    <div id="previewContent" class="content-edit-tab hidden">
                        <div class="mb-4">
                            <div class="flex gap-2 mb-2">
                                <button id="previewEn" class="px-3 py-1 text-sm bg-blue-600 text-white rounded">English</button>
                                <button id="previewJa" class="px-3 py-1 text-sm bg-gray-200 rounded">日本語</button>
                            </div>
                        </div>
                        <div class="border rounded p-4 prose prose-sm max-w-none" style="border-color: var(--border-color); background-color: var(--bg-secondary);">
                            <h2 id="previewTitle">Title</h2>
                            <div id="previewBody">Content will appear here...</div>
                        </div>
                    </div>
                    
                    <div class="flex justify-end gap-2 mt-4 pt-4" style="border-top: 1px solid var(--border-color);">
                        <button id="cancelContentEdit" class="px-4 py-2 rounded" style="background-color: var(--bg-secondary);">Cancel</button>
                        <button id="saveContentEdit" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                            <i class="fas fa-save mr-1"></i>Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Version History Modal -->
        <div id="versionHistoryModal" class="modal-overlay hidden">
            <div class="modal-content" style="max-width: 900px;">
                <div class="flex justify-between items-center mb-4 pb-4" style="border-bottom: 1px solid var(--border-color);">
                    <h3 class="text-xl font-bold">Version History</h3>
                    <button id="closeVersionHistory" class="text-2xl hover:opacity-70 px-2">&times;</button>
                </div>
                <div id="versionHistoryList" class="space-y-2">
                    <!-- Will be populated by JS -->
                </div>
            </div>
        </div>
        
        <!-- Image Upload Modal -->
        <div id="imageUploadModal" class="modal-overlay hidden">
            <div class="modal-content" style="max-width: 600px;">
                <div class="flex justify-between items-center mb-4 pb-4" style="border-bottom: 1px solid var(--border-color);">
                    <h3 class="text-xl font-bold">Upload Image</h3>
                    <button id="closeImageUpload" class="text-2xl hover:opacity-70 px-2">&times;</button>
                </div>
                <div>
                    <input type="file" id="imageFileInput" accept="image/*" class="mb-4">
                    <div id="imagePreviewContainer" class="mb-4 hidden">
                        <img id="imagePreview" class="max-w-full h-auto border rounded" style="max-height: 300px;">
                    </div>
                    <div class="flex justify-end gap-2">
                        <button id="cancelImageUpload" class="px-4 py-2 rounded" style="background-color: var(--bg-secondary);">Cancel</button>
                        <button id="confirmImageUpload" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                            <i class="fas fa-upload mr-1"></i>Upload
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Quill Editor CSS -->
        <link href="https://cdn.quilljs.com/1.3.6/quill.snow.css" rel="stylesheet">
        
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <!-- Quill Editor JS -->
        <script src="https://cdn.quilljs.com/1.3.6/quill.js"></script>
        <script>
          console.log('Quill loaded:', typeof Quill !== 'undefined');
        </script>
        <script src="/static/admin.js"></script>
    </body>
    </html>
  `)
})

export default app
