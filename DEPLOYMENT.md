# Deployment Guide

This guide walks you through deploying the Domain Search app to Cloudflare Pages.

## Prerequisites

1. **Cloudflare Account** - Sign up at https://cloudflare.com
2. **Cloudflare API Token** - Get from Cloudflare Dashboard > My Profile > API Tokens
3. **GitHub Account** (optional) - For continuous deployment

## Step 1: Create Production D1 Database

```bash
# Create production database
npx wrangler d1 create webapp-production

# Copy the database_id from output
# Example output:
# ✅ Successfully created DB 'webapp-production'!
# 
# [[d1_databases]]
# binding = "DB"
# database_name = "webapp-production"
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

## Step 2: Update Configuration

1. Open `wrangler.jsonc`
2. Replace `placeholder-will-be-replaced-after-creation` with your actual `database_id`

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "webapp-production",
      "database_id": "YOUR-ACTUAL-DATABASE-ID-HERE"
    }
  ]
}
```

## Step 3: Apply Migrations to Production

```bash
# Apply database migrations
npm run db:migrate:prod

# Seed the production database with sample data
npx wrangler d1 execute webapp-production --file=./seed.sql
```

## Step 4: Build the Project

```bash
# Build the project
npm run build

# This creates the dist/ directory with:
# - _worker.js (compiled Hono app)
# - _routes.json (routing config)
# - static assets from public/
```

## Step 5: Deploy to Cloudflare Pages

### Option A: Using Wrangler CLI (Direct Deployment)

```bash
# First deployment - create project
npx wrangler pages project create webapp --production-branch main

# Deploy
npm run deploy:prod

# You'll get URLs like:
# Production: https://webapp.pages.dev
# Branch: https://main.webapp.pages.dev
```

### Option B: Using Cloudflare Dashboard (Manual Upload)

1. Go to Cloudflare Dashboard > Workers & Pages
2. Click "Create application" > "Pages" > "Upload assets"
3. Select the `dist/` folder
4. Click "Deploy"

### Option C: Using GitHub (Continuous Deployment)

1. Push code to GitHub:
```bash
git remote add origin https://github.com/YOUR-USERNAME/webapp.git
git push -u origin main
```

2. In Cloudflare Dashboard:
   - Go to Workers & Pages > Create application
   - Select "Connect to Git"
   - Authorize GitHub and select your repository
   - Configure build settings:
     - Build command: `npm run build`
     - Build output directory: `dist`
   - Click "Save and Deploy"

## Step 6: Configure Environment Variables (Optional)

If you want to use WHOIS API:

```bash
# Add API keys as secrets
npx wrangler pages secret put WHOIS_API_KEY --project-name webapp

# List all secrets
npx wrangler pages secret list --project-name webapp
```

Or via Dashboard:
1. Go to your Pages project
2. Settings > Environment variables
3. Add your secrets

## Step 7: Update API Keys in Database

After deployment, visit your production site's admin panel:

```
https://webapp.pages.dev/admin
```

1. Go to "API Keys" tab
2. Update the WHOIS API key with your actual key
3. Set "Is Active" to true

## Step 8: Custom Domain (Optional)

### Using Cloudflare Dashboard

1. Go to your Pages project > Custom domains
2. Click "Set up a custom domain"
3. Enter your domain (e.g., domains.example.com)
4. Follow DNS configuration instructions

### Using Wrangler CLI

```bash
npx wrangler pages domain add example.com --project-name webapp
```

## Verification Checklist

After deployment, verify:

- [ ] Homepage loads at https://webapp.pages.dev
- [ ] Search functionality works
- [ ] Domain results display correctly
- [ ] Admin panel accessible at /admin
- [ ] Database queries work (check registrars list)
- [ ] Theme toggle works (light/dark mode)
- [ ] Language toggle works (EN/JP)
- [ ] WHOIS modal opens for taken domains
- [ ] Mobile responsive design works

## Testing Production

```bash
# Test production deployment
curl https://webapp.pages.dev

# Test API endpoint
curl -X POST https://webapp.pages.dev/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}'

# Test registrars endpoint
curl https://webapp.pages.dev/api/registrars
```

## Common Issues & Solutions

### Issue: Database not found

**Solution**: Make sure you've:
1. Created the production D1 database
2. Updated the database_id in wrangler.jsonc
3. Applied migrations with `npm run db:migrate:prod`

### Issue: Static files not loading

**Solution**: 
- Check that files are in `public/static/` directory
- Verify build output includes static files
- Check browser console for 404 errors

### Issue: CORS errors

**Solution**: 
- CORS is already configured in the app
- If issues persist, check Cloudflare Page Rules

### Issue: 500 Internal Server Error

**Solution**:
- Check Cloudflare Pages logs in the Dashboard
- Verify database binding is correct
- Test API endpoints individually

## Rollback

If you need to rollback:

```bash
# List deployments
npx wrangler pages deployments list --project-name webapp

# Rollback to previous deployment
npx wrangler pages deployment rollback --project-name webapp
```

Or via Dashboard:
1. Go to your Pages project > Deployments
2. Click on previous successful deployment
3. Click "Rollback to this deployment"

## Monitoring

1. **Cloudflare Analytics**
   - Go to your Pages project > Analytics
   - Monitor requests, errors, and performance

2. **Real-time Logs**
   ```bash
   npx wrangler pages deployment tail --project-name webapp
   ```

3. **Error Tracking**
   - Check Dashboard > Workers & Pages > Your Project > Logs

## Updating the Application

When you make changes:

```bash
# 1. Test locally first
npm run build
pm2 restart webapp

# 2. Commit changes
git add .
git commit -m "Your changes"
git push

# 3. Deploy to production
npm run deploy:prod
```

## Performance Optimization

1. **Enable Caching**
   - Cloudflare automatically caches static assets
   - Consider using KV for API response caching

2. **Optimize Images**
   - Use Cloudflare Images or optimize before uploading
   - Use appropriate image formats (WebP, AVIF)

3. **Database Optimization**
   - Regularly check slow queries
   - Add indexes as needed
   - Clean up old cache entries

## Security Best Practices

1. **API Keys**
   - Never commit API keys to git
   - Use Cloudflare Secrets for sensitive data
   - Rotate keys regularly

2. **Admin Panel**
   - Consider adding authentication
   - Implement rate limiting for admin endpoints
   - Use HTTPS only (Cloudflare provides this by default)

3. **Input Validation**
   - Already implemented in the app
   - Consider adding additional validation as needed

## Cost Estimation

Cloudflare Pages Free Tier includes:
- Unlimited requests
- Unlimited bandwidth
- 500 builds per month
- D1: 5GB storage, 5M rows read/day
- Workers: 100,000 requests/day

For most domain search apps, this is sufficient. Upgrade to paid plans if needed.

## Support & Resources

- **Cloudflare Docs**: https://developers.cloudflare.com/pages/
- **Hono Docs**: https://hono.dev/
- **D1 Docs**: https://developers.cloudflare.com/d1/
- **Wrangler Docs**: https://developers.cloudflare.com/workers/wrangler/

---

**Need Help?** Check the main README.md for more information about the application architecture and features.
