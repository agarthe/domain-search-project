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
    const { query } = await c.req.json<{ query: string }>()
    
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

      // Get registrars for this TLD
      const domainRegistrars: RegistrarWithPrice[] = registrars.results
        .filter((r: any) => r.tld === tld || r.tld === null)
        .reduce((acc: RegistrarWithPrice[], curr: any) => {
          // Avoid duplicates
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
      }
    }

    // Sort results: available first, then taken, then unknown
    results.sort((a, b) => {
      const statusOrder = { available: 0, taken: 1, unknown: 2 };
      return statusOrder[a.status] - statusOrder[b.status];
    });

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

    // Get WHOIS API key
    const apiKeyRecord = await db.prepare(`
      SELECT api_key FROM api_keys 
      WHERE service_name = 'whois_xml_api' AND is_active = 1
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
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2248%22 fill=%22%233b82f6%22/><text x=%2250%22 y=%2255%22 font-size=%2260%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>🐕</text></svg>">
        <link rel="icon" type="image/svg+xml" href="/favicon.svg">
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <style>
          :root {
            --bg-primary: #ffffff;
            --bg-secondary: #f9fafb;
            --bg-header: #ffffff;
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
            --bg-header: #1f2937;
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
          
          footer {
            flex-shrink: 0;
          }
        </style>
    </head>
    <body>
        <!-- Header -->
        <header style="background-color: var(--bg-header); border-bottom: 1px solid var(--border-color);" class="sticky top-0 z-50">
            <div class="max-w-7xl mx-auto px-4 py-4">
                <div class="flex items-center" style="gap: 1.5rem;">
                    <!-- Left: Logo and Title -->
                    <div class="flex items-center flex-shrink-0" style="gap: 0.5rem;">
                        <i class="fas fa-dog text-blue-600 text-2xl"></i>
                        <div>
                            <div style="color: var(--text-secondary); font-size: 0.68rem; margin-bottom: -0.25rem;">
                                <span data-i18n="tagline">Fetch Domain, Woof!</span>
                            </div>
                            <h1 class="text-xl font-bold">inu.name</h1>
                        </div>
                    </div>
                    
                    <!-- Search Box (right after title) -->
                    <div class="w-96">
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
                    
                    <!-- Right: Actions -->
                    <div class="flex items-center space-x-2 flex-shrink-0 ml-auto">
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
                </div>
            </div>
        </header>

        <!-- Main Content -->
        <main>
            <div class="max-w-7xl mx-auto px-4 py-4">
                <div class="flex items-start" style="gap: 1.5rem;">
                    <!-- Left spacer (matches logo + title width) -->
                    <div class="flex items-center flex-shrink-0" style="visibility: hidden; gap: 0.5rem;">
                        <i class="fas fa-dog text-blue-600 text-2xl"></i>
                        <div>
                            <div style="font-size: 0.68rem; margin-bottom: -0.25rem;">
                                <span>Fetch Domain, Woof!</span>
                            </div>
                            <h1 class="text-xl font-bold">inu.name</h1>
                        </div>
                    </div>
                    
                    <!-- Results area (matches search box width) -->
                    <div class="w-96">
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
            </div>
        </main>

        <!-- Footer -->
        <footer style="background-color: var(--bg-secondary); border-top: 1px solid var(--border-color);">
            <div class="max-w-7xl mx-auto px-4 py-8">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                    <!-- About -->
                    <div>
                        <div class="flex items-center space-x-2 mb-4">
                            <i class="fas fa-dog text-blue-600 text-xl"></i>
                            <div>
                                <div style="color: var(--text-secondary); font-size: 0.68rem; margin-bottom: -0.45rem;">
                                    <span data-i18n="tagline">Fetch Domain, Woof!</span>
                                </div>
                                <h3 class="text-lg font-bold">inu.name</h3>
                            </div>
                        </div>
                        <p class="text-sm" style="color: var(--text-secondary);">
                            Fast and simple domain name search tool. Find your perfect domain instantly.
                        </p>
                    </div>
                    
                    <!-- Quick Links -->
                    <div>
                        <h4 class="font-semibold mb-4">Quick Links</h4>
                        <ul class="space-y-2 text-sm" style="color: var(--text-secondary);">
                            <li><a href="/" class="hover:text-blue-600 transition">Home</a></li>
                            <li><a href="/admin" class="hover:text-blue-600 transition">Admin Panel</a></li>
                        </ul>
                    </div>
                    
                    <!-- Contact & Social -->
                    <div>
                        <h4 class="font-semibold mb-4">Connect</h4>
                        <div class="flex space-x-4">
                            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" 
                               class="text-2xl hover:text-blue-400 transition" style="color: var(--text-secondary);">
                                <i class="fab fa-twitter"></i>
                            </a>
                            <a href="mailto:info@inu.name" 
                               class="text-2xl hover:text-blue-600 transition" style="color: var(--text-secondary);">
                                <i class="fas fa-envelope"></i>
                            </a>
                        </div>
                    </div>
                </div>
                
                <!-- Copyright -->
                <div class="pt-8 border-t text-center text-sm" style="border-color: var(--border-color); color: var(--text-secondary);">
                    <p>&copy; 2025 inu.name. All rights reserved. Built with Hono & Cloudflare Pages.</p>
                </div>
            </div>
        </footer>

        <!-- Domain Details Modal -->
        <div id="domainModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div class="domain-card max-w-2xl w-full rounded-lg p-6 max-h-[80vh] overflow-y-auto">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold" id="modalTitle">Domain Details</h3>
                    <button id="closeModal" class="text-2xl hover:opacity-70">&times;</button>
                </div>
                <div id="modalContent" class="text-sm">
                    <div class="loader mx-auto"></div>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js?v=16"></script>
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
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2248%22 fill=%22%233b82f6%22/><text x=%2250%22 y=%2255%22 font-size=%2260%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>🐕</text></svg>">
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
                </nav>
            </div>

            <!-- Registrars Tab -->
            <div id="registrarsTab" class="tab-content">
                <div class="panel-card rounded-lg p-6 mb-6">
                    <h2 class="text-xl font-bold mb-4">Manage Registrars</h2>
                    <button id="addRegistrarBtn" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                        <i class="fas fa-plus mr-2"></i>Add Registrar
                    </button>
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
                        <button id="bulkImportBtn" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                            <i class="fas fa-file-import mr-2"></i>Bulk Import
                        </button>
                    </div>
                </div>
                
                <!-- Bulk Import Panel -->
                <div id="bulkImportPanel" class="panel-card rounded-lg p-6 mb-6 hidden">
                    <h3 class="text-lg font-bold mb-4">Bulk Import Pricing Data</h3>
                    <p class="text-sm mb-4" style="color: var(--text-secondary);">
                        Format: <code>registrar_id,tld,currency,price,renewal_price,transfer_price</code> (one per line)<br>
                        Example: <code>1,.com,USD,10.99,12.99,15.99</code>
                    </p>
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
                    <div class="overflow-x-auto">
                        <table class="w-full" id="pricingTable">
                            <thead>
                                <tr style="border-bottom: 1px solid var(--border-color);">
                                    <th class="text-left py-3 px-4">Registrar</th>
                                    <th class="text-left py-3 px-4">TLD</th>
                                    <th class="text-left py-3 px-4">Price</th>
                                    <th class="text-left py-3 px-4">Renewal</th>
                                    <th class="text-left py-3 px-4">Transfer</th>
                                    <th class="text-left py-3 px-4">Currency</th>
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

            <!-- API Keys Tab -->
            <div id="apikeysTab" class="tab-content hidden">
                <div class="panel-card rounded-lg p-6 mb-6">
                    <h2 class="text-xl font-bold mb-4">Manage API Keys</h2>
                    <div class="mb-4 p-4 bg-blue-50 dark:bg-blue-900 rounded-lg">
                        <h3 class="font-semibold mb-2 text-blue-800 dark:text-blue-200">
                            <i class="fas fa-info-circle mr-2"></i>Domainr API (Required)
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
                </div>
                <div class="panel-card rounded-lg p-6">
                    <div class="space-y-4" id="apiKeysList">
                        <!-- Will be populated by JS -->
                    </div>
                </div>
            </div>
        </main>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/admin.js"></script>
    </body>
    </html>
  `)
})

export default app
