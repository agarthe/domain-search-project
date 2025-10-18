# Domain Search App

A modern, Domainr.com-inspired domain search and availability checker built with Hono and Cloudflare Pages.

## 🎯 Project Overview

**Name**: Domain Search App  
**Goal**: Provide instant domain availability checking with registrar suggestions and pricing  
**Features**: 
- Real-time domain search with suggestions
- Domain availability checking via DNS lookup
- WHOIS information for registered domains
- Multiple registrar options with pricing
- Admin panel for managing registrars and settings
- Light/Dark mode toggle
- English/Japanese language support
- PWA-ready architecture

## 🌐 URLs

- **Sandbox Demo**: https://3000-iv1vxn8zmieucln7qg72m-18e660f9.sandbox.novita.ai
- **Admin Panel**: https://3000-iv1vxn8zmieucln7qg72m-18e660f9.sandbox.novita.ai/admin
- **API Endpoint**: https://3000-iv1vxn8zmieucln7qg72m-18e660f9.sandbox.novita.ai/api/search
- **Project Backup**: https://page.gensparksite.com/project_backups/domain-search-app-v1.tar.gz
- **Production**: (Ready to deploy to Cloudflare Pages)
- **GitHub**: (Ready for GitHub integration)

## 📊 Data Architecture

### Data Models

1. **Registrars** - Domain registrar information
   - id, name, website, affiliate_link_template, logo_url, is_active, display_order

2. **Registrar Pricing** - TLD pricing for each registrar
   - id, registrar_id, tld, currency, price, renewal_price

3. **API Keys** - External API credentials
   - id, service_name, api_key, api_secret, base_url, is_active

4. **Domain Cache** - Cached availability results
   - id, domain, is_available, whois_data, last_checked

### Storage Services

- **Cloudflare D1 Database**: SQLite-based relational database for all persistent data
- **Local Development**: Uses `--local` flag for local SQLite database
- **Production**: Cloudflare D1 database synced via migrations

### Data Flow

1. User searches for domain → API checks cache
2. If not cached or expired → DNS lookup via Cloudflare DNS
3. Results stored in cache (24h expiry)
4. Available domains → fetch registrar pricing from D1
5. Taken domains → WHOIS lookup on demand

## 🚀 Features

### Currently Completed Features

✅ **Search Functionality**
- Real-time domain search with debouncing (500ms)
- Automatic domain variations generation
- DNS-based availability checking
- 24-hour result caching

✅ **Domain Information**
- Domain availability status (Available/Taken/Unknown)
- Multiple TLD support (.com, .net, .org, .io, .jp, etc.)
- WHOIS lookup for registered domains

✅ **Registrar Integration**
- Multiple registrar support (Namecheap, GoDaddy, Google Domains, Cloudflare, Name.com)
- Affiliate link templates with dynamic domain substitution
- Price display with currency support
- Renewal price information

✅ **Admin Panel** (`/admin`)
- Registrar management (CRUD operations)
- Pricing management for different TLDs
- API key configuration
- Clean, intuitive interface

✅ **UI/UX Features**
- Minimalist, Domainr-inspired design
- Responsive mobile-friendly layout
- Light/Dark mode toggle (persistent via localStorage)
- English/Japanese language switching (persistent via localStorage)
- Smooth animations and transitions
- Modal WHOIS display

✅ **PWA Ready**
- Responsive design
- localStorage for preferences
- Optimized for mobile and desktop

### Functional Entry URIs

#### Public API Routes

1. **POST /api/search**
   - Search for domains and check availability
   - Body: `{ "query": "keyword or domain" }`
   - Returns: Domain results with availability status and registrar info

2. **GET /api/whois/:domain**
   - Get WHOIS information for a specific domain
   - Returns: WHOIS data and domain details

3. **GET /api/registrars**
   - Get all active registrars
   - Returns: List of registrars with details

#### Admin API Routes

4. **GET /api/admin/registrars**
   - Get all registrars (including inactive)

5. **POST /api/admin/registrars**
   - Create new registrar
   - Body: `{ name, website, affiliate_link_template, logo_url, display_order }`

6. **PUT /api/admin/registrars/:id**
   - Update registrar
   - Body: Same as POST plus `is_active`

7. **DELETE /api/admin/registrars/:id**
   - Delete registrar

8. **GET /api/admin/pricing**
   - Get all pricing records

9. **POST /api/admin/pricing**
   - Create pricing record
   - Body: `{ registrar_id, tld, currency, price, renewal_price }`

10. **PUT /api/admin/pricing/:id**
    - Update pricing record

11. **DELETE /api/admin/pricing/:id**
    - Delete pricing record

12. **GET /api/admin/apikeys**
    - Get all API keys (masked)

13. **PUT /api/admin/apikeys/:id**
    - Update API key
    - Body: `{ api_key, api_secret, base_url, is_active }`

#### Page Routes

14. **GET /**
    - Main search page

15. **GET /admin**
    - Admin panel

### Features Not Yet Implemented

⏳ **Advanced Domain Features**
- Domain history tracking
- Price trend analysis
- Domain expiration monitoring
- Bulk domain checking

⏳ **External API Integration**
- Real WHOIS API integration (requires API key)
- Domain suggestion API
- Real-time registrar pricing updates

⏳ **User Features**
- User authentication
- Favorite domains list
- Search history
- Email alerts for domain availability

⏳ **Performance Optimization**
- Server-side caching with KV
- Rate limiting
- CDN optimization

⏳ **Analytics**
- Search analytics
- Popular domains tracking
- User behavior insights

## 📋 User Guide

### For End Users

1. **Search for Domains**
   - Enter a keyword or domain name in the search box
   - Results appear automatically as you type (after 500ms)
   - Or click the "Search" button

2. **View Results**
   - Green badge = Domain is available
   - Red badge = Domain is taken
   - Gray badge = Status unknown

3. **Register Available Domains**
   - Click on any registrar button to visit their registration page
   - Prices are displayed next to each registrar
   - Links open in new tabs

4. **Check WHOIS for Taken Domains**
   - Click "View WHOIS" button on taken domains
   - Modal displays detailed WHOIS information

5. **Customize Interface**
   - Click moon/sun icon to toggle dark/light mode
   - Click language button to switch between EN/JP
   - Settings are saved automatically

### For Administrators

1. **Access Admin Panel**
   - Navigate to `/admin`
   - Three tabs: Registrars, Pricing, API Keys

2. **Manage Registrars**
   - Add new registrars with affiliate links
   - Edit existing registrar details
   - Toggle active/inactive status
   - Set display order

3. **Manage Pricing**
   - Add pricing for specific TLDs
   - Update prices and renewal fees
   - Link pricing to registrars

4. **Configure API Keys**
   - Update WHOIS API credentials
   - Enable/disable API services
   - Set base URLs for external APIs

## 🛠️ Technology Stack

- **Backend**: Hono v4 (Cloudflare Workers)
- **Database**: Cloudflare D1 (SQLite)
- **Frontend**: Vanilla JavaScript + TailwindCSS
- **Icons**: Font Awesome 6.4.0
- **HTTP Client**: Axios 1.6.0
- **Deployment**: Cloudflare Pages
- **Dev Server**: Wrangler + PM2

## 📦 Development

### Prerequisites

- Node.js 18+
- npm or pnpm
- Wrangler CLI

### Local Setup

```bash
# Install dependencies
npm install

# Create local D1 database and run migrations
npm run db:migrate:local

# Seed the database with sample data
npm run db:seed

# Build the project
npm run build

# Start development server (sandbox)
pm2 start ecosystem.config.cjs

# Or for local development
npm run dev
```

### Database Commands

```bash
# Apply migrations (local)
npm run db:migrate:local

# Apply migrations (production)
npm run db:migrate:prod

# Seed local database
npm run db:seed

# Reset local database
npm run db:reset

# Open local database console
npm run db:console:local

# Open production database console
npm run db:console:prod
```

### Testing

```bash
# Test local server
npm run test

# Or
curl http://localhost:3000
```

## 🚀 Deployment

### Production Deployment to Cloudflare Pages

1. **Create D1 Database**
```bash
npx wrangler d1 create webapp-production
```

2. **Update wrangler.jsonc with database ID**

3. **Apply Migrations**
```bash
npm run db:migrate:prod
```

4. **Seed Production Database**
```bash
npx wrangler d1 execute webapp-production --file=./seed.sql
```

5. **Build and Deploy**
```bash
npm run deploy:prod
```

## 📈 Deployment Status

- **Platform**: Cloudflare Pages
- **Status**: ✅ Development complete, tested and ready for production
- **Sandbox**: ✅ Running at https://3000-iv1vxn8zmieucln7qg72m-18e660f9.sandbox.novita.ai
- **Tech Stack**: Hono + TypeScript + TailwindCSS + D1 Database
- **Backup**: ✅ Available at https://page.gensparksite.com/project_backups/domain-search-app-v1.tar.gz
- **Last Updated**: 2025-10-18

## 🎯 Recommended Next Steps

1. **Configure External APIs**
   - Sign up for WhoisXML API
   - Add API key in admin panel
   - Test WHOIS lookups with real data

2. **Deploy to Production**
   - Create D1 production database
   - Run migrations
   - Deploy to Cloudflare Pages
   - Test all functionality

3. **Enhance Features**
   - Add user authentication
   - Implement favorites system
   - Add email notifications
   - Create domain comparison tool

4. **Optimize Performance**
   - Implement KV caching
   - Add rate limiting
   - Optimize domain variation generation
   - Add CDN for static assets

5. **Marketing & SEO**
   - Add meta tags and OpenGraph
   - Create landing page content
   - Implement sitemap
   - Add analytics tracking

## 📝 License

MIT License

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

Built with ❤️ using Hono and Cloudflare Pages
