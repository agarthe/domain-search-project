import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Bindings, DomainResult, SearchResponse, RegistrarWithPrice, ApiKey } from './types'
import { 
  generateDomainVariations, 
  extractTLD, 
  normalizeDomain, 
  checkDomainAvailabilityDNS,
  fetchWhoisData,
  isCacheExpired,
  isValidDomain
} from './utils'

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS for all routes
app.use('*', cors())

// ============================================
// API Routes
// ============================================

/**
 * POST /api/search
 * Search for domain availability and suggestions
 */
app.post('/api/search', async (c) => {
  try {
    const { query } = await c.req.json<{ query: string }>()
    
    if (!query || query.trim().length === 0) {
      return c.json({ error: 'Query is required' }, 400)
    }

    const normalized = normalizeDomain(query)
    const domains = isValidDomain(normalized) 
      ? [normalized, ...generateDomainVariations(normalized.split('.')[0])]
      : generateDomainVariations(normalized)

    const results: DomainResult[] = []
    const db = c.env.DB

    // Get all active registrars with pricing
    const registrars = await db.prepare(`
      SELECT r.*, rp.tld, rp.price, rp.renewal_price, rp.currency
      FROM registrars r
      LEFT JOIN registrar_pricing rp ON r.id = rp.registrar_id
      WHERE r.is_active = 1
      ORDER BY r.display_order ASC
    `).all()

    // Check each domain
    for (const domain of domains.slice(0, 30)) { // Limit to 30 domains
      const tld = extractTLD(domain)
      
      // Check cache first
      const cached = await db.prepare(`
        SELECT * FROM domain_cache 
        WHERE domain = ? 
        ORDER BY last_checked DESC 
        LIMIT 1
      `).bind(domain).first()

      let status: 'available' | 'taken' | 'unknown' = 'unknown'
      let whoisData = null

      if (cached && !isCacheExpired(cached.last_checked as string)) {
        // Use cached data
        status = cached.is_available === 1 ? 'available' : cached.is_available === 0 ? 'taken' : 'unknown'
        whoisData = cached.whois_data ? JSON.parse(cached.whois_data as string) : null
      } else {
        // Check availability
        status = await checkDomainAvailabilityDNS(domain)
        
        // Update cache
        await db.prepare(`
          INSERT OR REPLACE INTO domain_cache (domain, is_available, last_checked)
          VALUES (?, ?, datetime('now'))
        `).bind(
          domain,
          status === 'available' ? 1 : status === 'taken' ? 0 : 2
        ).run()
      }

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
              currency: curr.currency,
              register_url: curr.affiliate_link_template.replace('{domain}', domain)
            })
          }
          return acc
        }, [])
        .slice(0, 5) // Limit to top 5 registrars

      // Only add domains that have a TLD
      if (tld && tld.length > 0) {
        results.push({
          domain,
          tld,
          status,
          registrars: status === 'available' ? domainRegistrars : undefined,
          whois: status === 'taken' ? whoisData : undefined,
          cached: cached ? !isCacheExpired(cached.last_checked as string) : false
        })
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
 * Create pricing record
 */
app.post('/api/admin/pricing', async (c) => {
  try {
    const db = c.env.DB
    const data = await c.req.json()

    const result = await db.prepare(`
      INSERT INTO registrar_pricing (registrar_id, tld, currency, price, renewal_price)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      data.registrar_id,
      data.tld,
      data.currency || 'USD',
      data.price,
      data.renewal_price || null
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
      SET registrar_id = ?, tld = ?, currency = ?, price = ?, renewal_price = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      data.registrar_id,
      data.tld,
      data.currency,
      data.price,
      data.renewal_price,
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
        <title>Domain Search - Find Your Perfect Domain</title>
        <meta name="description" content="Search and check domain availability instantly. Find the perfect domain name for your project.">
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <style>
          :root {
            --bg-primary: #ffffff;
            --bg-secondary: #f9fafb;
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
        </style>
    </head>
    <body>
        <!-- Header -->
        <header style="background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color);" class="sticky top-0 z-50">
            <div class="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
                <div class="flex items-center space-x-2">
                    <i class="fas fa-globe text-blue-600 text-2xl"></i>
                    <h1 class="text-xl font-bold">Domain Search</h1>
                </div>
                <div class="flex items-center space-x-4">
                    <!-- Language Toggle -->
                    <button id="langToggle" class="px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                        <i class="fas fa-language mr-1"></i>
                        <span id="currentLang">EN</span>
                    </button>
                    <!-- Theme Toggle -->
                    <button id="themeToggle" class="px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                        <i class="fas fa-moon" id="themeIcon"></i>
                    </button>
                    <!-- Admin Link -->
                    <a href="/admin" class="px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                        <i class="fas fa-cog"></i>
                    </a>
                </div>
            </div>
        </header>

        <!-- Main Content -->
        <main class="max-w-7xl mx-auto px-4 py-8">
            <!-- Search Box -->
            <div class="max-w-3xl mx-auto mb-8">
                <div class="relative">
                    <input 
                        type="text" 
                        id="searchInput" 
                        class="w-full px-6 py-4 pr-12 text-lg rounded-lg search-box"
                        placeholder="Enter a domain or keyword..."
                        data-i18n-placeholder="search.placeholder"
                    >
                    <button 
                        id="clearBtn" 
                        class="absolute right-3 top-1/2 transform -translate-y-1/2 px-2 py-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition hidden"
                        title="Clear search"
                    >
                        <i class="fas fa-times-circle text-xl"></i>
                    </button>
                </div>
                <button 
                    id="searchBtn" 
                    class="hidden px-8 py-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
                    data-i18n="search.button"
                >
                    <i class="fas fa-search mr-2"></i>Search
                </button>
            </div>

            <!-- Loading State -->
            <div id="loadingState" class="hidden text-center py-12">
                <div class="loader mx-auto mb-4"></div>
                <p style="color: var(--text-secondary);" data-i18n="search.loading">Searching domains...</p>
            </div>

            <!-- Results -->
            <div id="resultsContainer" class="hidden">
                <div class="mb-6">
                    <h3 class="text-2xl font-bold" data-i18n="results.title">Search Results</h3>
                    <p style="color: var(--text-secondary);">
                        <span data-i18n="results.found">Found</span> <span id="resultCount">0</span> <span data-i18n="results.domains">domains</span>
                    </p>
                </div>
                
                <div id="resultsList" class="space-y-3">
                    <!-- Results will be inserted here -->
                </div>
            </div>
        </main>

        <!-- WHOIS Modal -->
        <div id="whoisModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div class="domain-card max-w-2xl w-full rounded-lg p-6 max-h-[80vh] overflow-y-auto">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold" data-i18n="whois.title">WHOIS Information</h3>
                    <button id="closeModal" class="text-2xl hover:opacity-70">&times;</button>
                </div>
                <div id="whoisContent" class="text-sm">
                    <div class="loader mx-auto"></div>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js?v=2"></script>
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
        <title>Admin Panel - Domain Search</title>
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
                    <h1 class="text-xl font-bold">Admin Panel</h1>
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
                                    <th class="text-left py-3 px-4">Name</th>
                                    <th class="text-left py-3 px-4">Website</th>
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
                    <button id="addPricingBtn" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                        <i class="fas fa-plus mr-2"></i>Add Pricing
                    </button>
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
                <div class="panel-card rounded-lg p-6">
                    <h2 class="text-xl font-bold mb-4">Manage API Keys</h2>
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
