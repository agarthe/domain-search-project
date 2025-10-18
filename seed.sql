-- Seed data for registrars
INSERT OR IGNORE INTO registrars (id, name, website, affiliate_link_template, logo_url, display_order) VALUES 
  (1, 'Namecheap', 'https://www.namecheap.com', 'https://www.namecheap.com/domains/registration/results/?domain={domain}', 'https://www.namecheap.com/assets/img/nc-icon.svg', 1),
  (2, 'GoDaddy', 'https://www.godaddy.com', 'https://www.godaddy.com/domainsearch/find?domainToCheck={domain}', 'https://img6.wsimg.com/ux/favicon/favicon-96x96.png', 2),
  (3, 'Google Domains', 'https://domains.google', 'https://domains.google/registrar/search?searchTerm={domain}', 'https://www.gstatic.com/images/branding/product/1x/domains_48dp.png', 3),
  (4, 'Cloudflare', 'https://www.cloudflare.com', 'https://www.cloudflare.com/products/registrar/?domain={domain}', 'https://www.cloudflare.com/favicon.ico', 4),
  (5, 'Name.com', 'https://www.name.com', 'https://www.name.com/domain/search/{domain}', 'https://www.name.com/favicon.ico', 5);

-- Seed data for registrar pricing (sample data)
INSERT OR IGNORE INTO registrar_pricing (registrar_id, tld, currency, price, renewal_price) VALUES 
  -- Namecheap
  (1, '.com', 'USD', 10.98, 14.98),
  (1, '.net', 'USD', 12.98, 15.98),
  (1, '.org', 'USD', 12.98, 15.98),
  (1, '.io', 'USD', 39.98, 49.98),
  (1, '.dev', 'USD', 14.98, 17.98),
  (1, '.app', 'USD', 14.98, 17.98),
  (1, '.jp', 'USD', 49.98, 49.98),
  
  -- GoDaddy
  (2, '.com', 'USD', 11.99, 19.99),
  (2, '.net', 'USD', 13.99, 19.99),
  (2, '.org', 'USD', 13.99, 19.99),
  (2, '.io', 'USD', 49.99, 59.99),
  (2, '.dev', 'USD', 15.99, 19.99),
  (2, '.app', 'USD', 15.99, 19.99),
  (2, '.jp', 'USD', 59.99, 59.99),
  
  -- Google Domains
  (3, '.com', 'USD', 12.00, 12.00),
  (3, '.net', 'USD', 12.00, 12.00),
  (3, '.org', 'USD', 12.00, 12.00),
  (3, '.io', 'USD', 60.00, 60.00),
  (3, '.dev', 'USD', 12.00, 12.00),
  (3, '.app', 'USD', 12.00, 12.00),
  (3, '.jp', 'USD', 60.00, 60.00),
  
  -- Cloudflare
  (4, '.com', 'USD', 9.77, 9.77),
  (4, '.net', 'USD', 11.55, 11.55),
  (4, '.org', 'USD', 10.88, 10.88),
  (4, '.io', 'USD', 38.00, 38.00),
  (4, '.dev', 'USD', 13.00, 13.00),
  (4, '.app', 'USD', 13.00, 13.00),
  
  -- Name.com
  (5, '.com', 'USD', 10.99, 10.99),
  (5, '.net', 'USD', 12.99, 12.99),
  (5, '.org', 'USD', 12.99, 12.99),
  (5, '.io', 'USD', 39.99, 39.99),
  (5, '.dev', 'USD', 14.99, 14.99),
  (5, '.app', 'USD', 14.99, 14.99),
  (5, '.jp', 'USD', 49.99, 49.99);

-- Seed data for API keys (placeholders)
INSERT OR IGNORE INTO api_keys (id, service_name, api_key, base_url, is_active) VALUES 
  (1, 'whois_xml_api', 'YOUR_WHOIS_API_KEY', 'https://www.whoisxmlapi.com/whoisserver/WhoisService', 0),
  (2, 'domain_check_api', 'YOUR_DOMAIN_API_KEY', 'https://api.domainsdb.info/v1', 1);
