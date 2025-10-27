// Main application JavaScript

// ============================================
// State Management
// ============================================
let currentLang = localStorage.getItem('lang') || 'en';
let currentTheme = localStorage.getItem('theme') || 'light';
let currentCurrency = localStorage.getItem('currency') || (currentLang === 'ja' ? 'JPY' : 'USD');
let searchTimeout = null;
let lastSearchResults = null;

// ============================================
// Tooltip Management
// ============================================
function createTooltip() {
  let tooltip = document.getElementById('customTooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'customTooltip';
    tooltip.style.cssText = `
      position: fixed;
      background-color: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 13px;
      line-height: 1.5;
      z-index: 10000;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
      max-width: 280px;
      white-space: pre-line;
    `;
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

function showTooltip(event, title, detail) {
  const tooltip = createTooltip();
  tooltip.innerHTML = `<strong>${title}</strong><br>${detail}`;
  tooltip.style.opacity = '1';
  
  const updatePosition = (e) => {
    const x = e.clientX;
    const y = e.clientY;
    const tooltipRect = tooltip.getBoundingClientRect();
    
    // Position tooltip to the right and below cursor
    let left = x + 10;
    let top = y + 10;
    
    // Adjust if tooltip goes off screen
    if (left + tooltipRect.width > window.innerWidth) {
      left = x - tooltipRect.width - 10;
    }
    if (top + tooltipRect.height > window.innerHeight) {
      top = y - tooltipRect.height - 10;
    }
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  };
  
  updatePosition(event);
  
  // Update position on mouse move
  const target = event.currentTarget;
  const moveHandler = (e) => updatePosition(e);
  target.addEventListener('mousemove', moveHandler);
  
  // Clean up on mouse leave
  target.addEventListener('mouseleave', () => {
    tooltip.style.opacity = '0';
    target.removeEventListener('mousemove', moveHandler);
  }, { once: true });
}

function hideTooltip() {
  const tooltip = document.getElementById('customTooltip');
  if (tooltip) {
    tooltip.style.opacity = '0';
  }
}

// Exchange rate (USD to JPY, fetched from API)
let USD_TO_JPY = 150; // Default fallback

// Fetch exchange rate on page load
async function fetchExchangeRate() {
  try {
    const response = await axios.get('/api/exchange-rate');
    if (response.data && response.data.rate) {
      USD_TO_JPY = response.data.rate;
      console.log('Exchange rate updated:', USD_TO_JPY, 'JPY per USD');
      
      // Re-render results if they exist
      if (lastSearchResults) {
        displayResults(lastSearchResults);
      }
    }
  } catch (error) {
    console.error('Failed to fetch exchange rate:', error);
    // Keep using default rate
  }
}

// ============================================
// i18n Translations
// ============================================
const translations = {
  en: {
    'tagline': 'Fetch Domain, Woof!',
    'hero.title': 'Find Your Perfect Domain',
    'hero.subtitle': 'Search millions of domains and check availability instantly',
    'search.placeholder': 'Enter a domain or keyword...',
    'search.button': 'Search',
    'search.example': 'Example:',
    'search.loading': 'Searching domains...',
    'results.title': 'Search Results',
    'results.found': 'Found',
    'results.domains': 'domains',
    'empty.message': 'Start searching for your perfect domain name',
    'domain.available': 'Available',
    'domain.taken': 'Taken',
    'domain.unknown': 'Unknown',
    'domain.register': 'Register at',
    'domain.whois': 'View WHOIS',
    'domain.details': 'View Details',
    'whois.title': 'WHOIS Information',
    'whois.loading': 'Loading WHOIS data...',
    'modal.registrars': 'Available Registrars',
    'modal.cheapest': 'Cheapest',
    'registrar.header': 'Registrar',
    'registrar.registration': 'Registration',
    'registrar.renewal': 'Renewal',
    'registrar.transfer': 'Transfer',
    'tooltip.registration': 'First-year cost',
    'tooltip.registration.detail': 'Cost for new domain registration.',
    'tooltip.renewal': 'Cost from second year',
    'tooltip.renewal.detail': 'Fee to extend your domain\'s ownership period.',
    'tooltip.transfer': 'Fee for moving your domain',
    'tooltip.transfer.detail': 'Includes a free 1-year renewal.',
    'whois.registration': 'Registration Information',
    'whois.dates': 'Important Dates',
    'whois.nameservers': 'Name Servers',
    'whois.status': 'Domain Status',
    'whois.contact': 'Contact Information',
    'whois.domain': 'Domain',
    'whois.registrar': 'Registrar',
    'whois.created': 'Created',
    'whois.expires': 'Expires',
    'whois.updated': 'Updated',
    'broker.button': 'Make an Offer',
    'error.search': 'Failed to search domains. Please try again.',
    'error.whois': 'Failed to load WHOIS data.'
  },
  ja: {
    'tagline': 'ドメインさがすワン',
    'hero.title': '完璧なドメインを見つけよう',
    'hero.subtitle': '何百万ものドメインを検索して、すぐに利用可能性を確認',
    'search.placeholder': 'ドメインまたはキーワードを入力...',
    'search.button': '検索',
    'search.example': '例:',
    'search.loading': 'ドメインを検索中...',
    'results.title': '検索結果',
    'results.found': '見つかった',
    'results.domains': 'ドメイン',
    'empty.message': '完璧なドメイン名を検索してください',
    'domain.available': '取得できます',
    'domain.taken': '取得できません',
    'domain.unknown': '不明',
    'domain.register': '登録先:',
    'domain.whois': 'WHOIS表示',
    'domain.details': '詳細表示',
    'whois.title': 'WHOIS情報',
    'whois.loading': 'WHOISデータを読み込み中...',
    'modal.registrars': '利用可能なレジストラ',
    'modal.cheapest': '最安値',
    'registrar.header': 'レジストラ',
    'registrar.registration': '登録料金',
    'registrar.renewal': '更新料金',
    'registrar.transfer': '移管料金',
    'tooltip.registration': '初年度の取得料金',
    'tooltip.registration.detail': 'ドメインを新規で登録する際の料金です。',
    'tooltip.renewal': '2年目以降の継続料金',
    'tooltip.renewal.detail': 'ドメインの保有期間を延長する際の料金です。',
    'tooltip.transfer': '他社からの転入料金',
    'tooltip.transfer.detail': 'この料金には、自動的に1年分の更新が含まれます。',
    'whois.registration': '登録情報',
    'whois.dates': '日付情報',
    'whois.nameservers': 'ネームサーバー',
    'whois.status': 'ドメインステータス',
    'whois.contact': '連絡先情報',
    'whois.domain': 'ドメイン',
    'whois.registrar': 'レジストラ',
    'whois.created': '作成日',
    'whois.expires': '有効期限',
    'whois.updated': '更新日',
    'broker.button': '購入の交渉をする',
    'error.search': 'ドメイン検索に失敗しました。もう一度お試しください。',
    'error.whois': 'WHOISデータの読み込みに失敗しました。'
  }
};

// ============================================
// Utility Functions
// ============================================
function t(key) {
  return translations[currentLang][key] || key;
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  
  try {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString(currentLang === 'ja' ? 'ja-JP' : 'en-US', options);
  } catch (e) {
    return dateString;
  }
}

function updateTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.className = theme;
  localStorage.setItem('theme', theme);
  
  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  }
}

function switchLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  document.getElementById('currentLang').textContent = lang.toUpperCase();
  updateTranslations();
}

function switchCurrency(currency) {
  currentCurrency = currency;
  localStorage.setItem('currency', currency);
  
  // Update icon
  const currencyIcon = document.getElementById('currencyIcon');
  if (currencyIcon) {
    currencyIcon.className = currency === 'USD' ? 'fas fa-dollar-sign' : 'fas fa-yen-sign';
  }
  
  // Re-render results with new currency
  if (lastSearchResults) {
    displayResults(lastSearchResults);
  }
}

function formatPrice(price, sourceCurrency = 'USD') {
  if (!price) return 'N/A';
  
  // If display currency matches source currency, no conversion needed
  if (currentCurrency === sourceCurrency) {
    if (currentCurrency === 'JPY') {
      return `${Math.round(price).toLocaleString()}円`;
    } else {
      return `$${price}`;
    }
  }
  
  // Convert if currencies don't match
  if (currentCurrency === 'JPY' && sourceCurrency === 'USD') {
    // USD to JPY
    const priceJPY = Math.round(price * USD_TO_JPY);
    return `${priceJPY.toLocaleString()}円`;
  } else if (currentCurrency === 'USD' && sourceCurrency === 'JPY') {
    // JPY to USD
    const priceUSD = (price / USD_TO_JPY).toFixed(2);
    return `$${priceUSD}`;
  }
  
  // Fallback
  return currentCurrency === 'JPY' ? `${Math.round(price).toLocaleString()}円` : `$${price}`;
}

// ============================================
// Search Functions
// ============================================
async function searchDomains(query) {
  console.log('searchDomains called with:', query);
  if (!query || query.trim().length === 0) {
    console.log('Empty query, returning');
    return;
  }

  // Show loading state
  console.log('Showing loading state');
  const emptyState = document.getElementById('emptyState');
  if (emptyState) emptyState.classList.add('hidden');
  document.getElementById('resultsContainer').classList.add('hidden');
  document.getElementById('loadingState').classList.remove('hidden');

  try {
    console.log('Calling API...');
    const response = await axios.post('/api/search', { query });
    const data = response.data;
    console.log('API response:', data);

    displayResults(data);
  } catch (error) {
    console.error('Search error:', error);
    alert(t('error.search'));
    document.getElementById('loadingState').classList.add('hidden');
    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.classList.remove('hidden');
  }
}

function displayResults(data) {
  console.log('Displaying results:', data.results.length);
  lastSearchResults = data; // Store for currency switching
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('resultsContainer').classList.remove('hidden');

  const resultsList = document.getElementById('resultsList');
  console.log('Results list element:', resultsList);
  resultsList.innerHTML = '';

  // Filter results: exclude unknown status and available domains without registrars
  const filteredResults = data.results.filter(result => {
    // Exclude unknown status
    if (result.status === 'unknown') {
      return false;
    }
    // Exclude available domains without registrars
    if (result.status === 'available' && (!result.registrars || result.registrars.length === 0)) {
      return false;
    }
    return true;
  });

  console.log('Filtered results:', filteredResults.length, 'from', data.results.length);

  filteredResults.forEach((result, index) => {
    const card = createDomainCard(result, index);
    console.log('Created card for:', result.domain);
    resultsList.appendChild(card);
  });
  console.log('All cards appended');
}

function createDomainCard(result, index) {
  const card = document.createElement('div');
  card.className = 'py-3 fade-in cursor-pointer transition';
  card.style.animationDelay = `${index * 0.05}s`;
  
  // Hover effect with light background
  card.addEventListener('mouseenter', () => {
    card.style.backgroundColor = document.documentElement.classList.contains('dark') ? '#1f2937' : '#fafafa';
  });
  card.addEventListener('mouseleave', () => {
    card.style.backgroundColor = 'transparent';
  });

  const statusClass = result.status === 'available' ? 'status-available' : 
                      result.status === 'taken' ? 'status-taken' : 
                      'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300';

  let content = `
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <h4 class="text-base font-semibold">${result.domain}</h4>
        <span class="px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}">
          ${t('domain.' + result.status)}
        </span>
      </div>
      <i class="fas fa-chevron-right text-gray-400 text-sm"></i>
    </div>
  `;

  card.innerHTML = content;
  
  // Store result data on the card
  card.dataset.result = JSON.stringify(result);
  
  // Click handler to show details
  card.addEventListener('click', () => {
    showDomainDetails(result);
  });
  
  return card;
}

function showDomainDetails(result) {
  const modal = document.getElementById('domainModal');
  const modalTitle = document.getElementById('modalTitle');
  const content = document.getElementById('modalContent');
  
  // Set title with external link
  modalTitle.innerHTML = `
    <a href="https://${result.domain}" target="_blank" rel="noopener noreferrer" 
       class="hover:text-blue-600 transition flex items-center gap-2">
      <span>${result.domain}</span>
      <i class="fas fa-external-link-alt text-sm"></i>
    </a>
  `;
  modal.classList.remove('hidden');

  if (result.status === 'available' && result.registrars) {
    // Store registrars data for sorting
    let sortedRegistrars = [...result.registrars];
    let currentSortBy = 'price';
    
    function renderRegistrars() {
      content.innerHTML = `
        <div class="space-y-4">
          <!-- Header with sort buttons -->
          <div class="flex items-center justify-between px-3 py-2" style="border-bottom: 2px solid var(--border-color);">
            <div class="font-semibold" style="flex: 1;">${t('registrar.header')}</div>
            <div class="flex" style="gap: 2rem;">
              <button class="sort-btn text-sm font-semibold ${currentSortBy === 'price' ? 'text-blue-600' : ''}" 
                      data-sort="price" 
                      data-tooltip-title="${t('tooltip.registration')}"
                      data-tooltip-detail="${t('tooltip.registration.detail')}"
                      style="min-width: 80px; text-align: right; cursor: help;">
                ${t('registrar.registration')} <i class="fas fa-sort ml-1"></i>
              </button>
              <button class="sort-btn text-sm font-semibold ${currentSortBy === 'renewal_price' ? 'text-blue-600' : ''}" 
                      data-sort="renewal_price"
                      data-tooltip-title="${t('tooltip.renewal')}"
                      data-tooltip-detail="${t('tooltip.renewal.detail')}"
                      style="min-width: 80px; text-align: right; cursor: help;">
                ${t('registrar.renewal')} <i class="fas fa-sort ml-1"></i>
              </button>
              <button class="sort-btn text-sm font-semibold ${currentSortBy === 'transfer_price' ? 'text-blue-600' : ''}" 
                      data-sort="transfer_price"
                      data-tooltip-title="${t('tooltip.transfer')}"
                      data-tooltip-detail="${t('tooltip.transfer.detail')}"
                      style="min-width: 80px; text-align: right; cursor: help;">
                ${t('registrar.transfer')} <i class="fas fa-sort ml-1"></i>
              </button>
            </div>
          </div>
          
          <!-- Registrar list -->
          <div class="divide-y" style="border-color: var(--border-color);">
            ${sortedRegistrars.map((reg, idx) => `
              <a href="${reg.register_url}" 
                 target="_blank" 
                 rel="noopener noreferrer"
                 class="registrar-item flex items-center justify-between px-3 py-3 transition"
                 onmouseenter="this.style.backgroundColor=document.documentElement.classList.contains('dark')?'#1f2937':'#fafafa'"
                 onmouseleave="this.style.backgroundColor='transparent'">
                <div class="flex items-center" style="gap: 0.75rem; flex: 1;">
                  ${reg.logo_url ? `<img src="${reg.logo_url}" alt="${reg.name}" class="w-6 h-6">` : '<i class="fas fa-globe text-gray-400"></i>'}
                  <div class="font-medium">${reg.name}</div>
                </div>
                <div class="flex" style="gap: 2rem;">
                  <div class="text-right" style="min-width: 80px;">
                    <div class="font-semibold ${idx === 0 && currentSortBy === 'price' ? 'text-green-600' : ''}">
                      ${formatPrice(reg.price, reg.currency)}
                    </div>
                  </div>
                  <div class="text-right" style="min-width: 80px;">
                    <div class="${idx === 0 && currentSortBy === 'renewal_price' ? 'text-green-600 font-semibold' : ''}" style="color: ${!reg.renewal_price ? 'var(--text-secondary)' : ''}">
                      ${reg.renewal_price ? formatPrice(reg.renewal_price, reg.currency) : 'N/A'}
                    </div>
                  </div>
                  <div class="text-right" style="min-width: 80px;">
                    <div class="${idx === 0 && currentSortBy === 'transfer_price' ? 'text-green-600 font-semibold' : ''}" style="color: ${!reg.transfer_price ? 'var(--text-secondary)' : ''}">
                      ${reg.transfer_price ? formatPrice(reg.transfer_price, reg.currency) : 'N/A'}
                    </div>
                  </div>
                </div>
              </a>
            `).join('')}
          </div>
        </div>
      `;
      
      // Add sort event listeners
      content.querySelectorAll('.sort-btn').forEach(btn => {
        // Click handler for sorting
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const sortBy = btn.dataset.sort;
          currentSortBy = sortBy;
          
          // Sort registrars (normalize to USD for comparison)
          sortedRegistrars.sort((a, b) => {
            let aPrice = a[sortBy] || Infinity;
            let bPrice = b[sortBy] || Infinity;
            
            // Convert to USD for fair comparison
            if (a.currency === 'JPY' && aPrice !== Infinity) {
              aPrice = aPrice / USD_TO_JPY;
            }
            if (b.currency === 'JPY' && bPrice !== Infinity) {
              bPrice = bPrice / USD_TO_JPY;
            }
            
            return aPrice - bPrice;
          });
          
          renderRegistrars();
        });
        
        // Tooltip handlers
        btn.addEventListener('mouseenter', (e) => {
          const title = btn.dataset.tooltipTitle;
          const detail = btn.dataset.tooltipDetail;
          if (title && detail) {
            showTooltip(e, title, detail);
          }
        });
        
        btn.addEventListener('mouseleave', () => {
          hideTooltip();
        });
      });
    }
    
    // Initial sort by registration price (normalize to USD for comparison)
    sortedRegistrars.sort((a, b) => {
      let aPrice = a.price || Infinity;
      let bPrice = b.price || Infinity;
      
      if (a.currency === 'JPY' && aPrice !== Infinity) {
        aPrice = aPrice / USD_TO_JPY;
      }
      if (b.currency === 'JPY' && bPrice !== Infinity) {
        bPrice = bPrice / USD_TO_JPY;
      }
      
      return aPrice - bPrice;
    });
    renderRegistrars();
    
  } else if (result.status === 'taken') {
    // Show WHOIS for taken domains
    content.innerHTML = '<div class="loader mx-auto"></div><p class="text-center mt-4">' + t('whois.loading') + '</p>';
    
    // Fetch broker link and WHOIS data
    Promise.all([
      fetch('/api/settings/broker-link').then(r => r.json()),
      fetchWhoisData(result.domain)
    ]).then(([brokerData, whoisResponse]) => {
      const whois = whoisResponse.whois;
      const brokerLink = brokerData.broker_link;
      
      // Check if we have parsed data from Whois55 API
      if (whois.parsed) {
        const parsed = whois.parsed;
        
        // Build modern card-based layout
        let cardsHtml = '';
        
        // Registration Info Card
        if (parsed['Domain Name'] || parsed['Registry Domain ID'] || parsed['Registrar']) {
          cardsHtml += `
            <div class="pb-4 mb-4" style="border-bottom: 1px solid var(--border-color);">
              <h4 class="font-semibold mb-3 text-sm" style="color: var(--text-secondary);">${t('whois.registration')}</h4>
              <div class="space-y-2">
                ${parsed['Domain Name'] ? `<div class="flex justify-between"><span style="color: var(--text-secondary); font-size: 0.875rem;">${t('whois.domain')}</span><span class="font-medium">${parsed['Domain Name']}</span></div>` : ''}
                ${parsed['Registrar'] ? `<div class="flex justify-between"><span style="color: var(--text-secondary); font-size: 0.875rem;">${t('whois.registrar')}</span><span class="font-medium">${parsed['Registrar']}</span></div>` : ''}
                ${parsed['Registry Domain ID'] ? `<div class="flex justify-between"><span style="color: var(--text-secondary); font-size: 0.875rem;">Registry ID</span><span class="font-mono text-sm">${parsed['Registry Domain ID']}</span></div>` : ''}
              </div>
            </div>
          `;
        }
        
        // Dates Card
        if (parsed['Created Date'] || parsed['Expiry Date'] || parsed['Updated Date']) {
          cardsHtml += `
            <div class="pb-4 mb-4" style="border-bottom: 1px solid var(--border-color);">
              <h4 class="font-semibold mb-3 text-sm" style="color: var(--text-secondary);">${t('whois.dates')}</h4>
              <div class="space-y-2">
                ${parsed['Created Date'] ? `<div class="flex justify-between"><span style="color: var(--text-secondary); font-size: 0.875rem;">${t('whois.created')}</span><span class="font-medium">${formatDate(parsed['Created Date'])}</span></div>` : ''}
                ${parsed['Expiry Date'] ? `<div class="flex justify-between"><span style="color: var(--text-secondary); font-size: 0.875rem;">${t('whois.expires')}</span><span class="font-medium">${formatDate(parsed['Expiry Date'])}</span></div>` : ''}
                ${parsed['Updated Date'] ? `<div class="flex justify-between"><span style="color: var(--text-secondary); font-size: 0.875rem;">${t('whois.updated')}</span><span class="font-medium">${formatDate(parsed['Updated Date'])}</span></div>` : ''}
              </div>
            </div>
          `;
        }
        
        // Name Servers Card
        if (parsed['Name Server'] && Array.isArray(parsed['Name Server']) && parsed['Name Server'].length > 0) {
          cardsHtml += `
            <div class="pb-4 mb-4" style="border-bottom: 1px solid var(--border-color);">
              <h4 class="font-semibold mb-3 text-sm" style="color: var(--text-secondary);">${t('whois.nameservers')}</h4>
              <div class="space-y-1">
                ${parsed['Name Server'].map(ns => `<div class="font-mono text-sm">${ns}</div>`).join('')}
              </div>
            </div>
          `;
        }
        
        // Domain Status Card
        if (parsed['Domain Status'] && Array.isArray(parsed['Domain Status']) && parsed['Domain Status'].length > 0) {
          cardsHtml += `
            <div class="pb-4 mb-4" style="border-bottom: 1px solid var(--border-color);">
              <h4 class="font-semibold mb-3 text-sm" style="color: var(--text-secondary);">${t('whois.status')}</h4>
              <div class="space-y-1">
                ${parsed['Domain Status'].map(status => {
                  const statusText = status.split(' ')[0];
                  return `<div class="text-sm font-mono">${statusText}</div>`;
                }).join('')}
              </div>
            </div>
          `;
        }
        
        // Contact Info Card
        if (parsed['Registrar Abuse Contact Email'] || parsed['Registrar Abuse Contact Phone']) {
          cardsHtml += `
            <div class="pb-4">
              <h4 class="font-semibold mb-3 text-sm" style="color: var(--text-secondary);">${t('whois.contact')}</h4>
              <div class="space-y-2">
                ${parsed['Registrar Abuse Contact Email'] ? `<div class="flex items-center gap-2"><i class="fas fa-envelope text-xs" style="color: var(--text-secondary);"></i><a href="mailto:${parsed['Registrar Abuse Contact Email']}" class="text-blue-600 hover:underline text-sm">${parsed['Registrar Abuse Contact Email']}</a></div>` : ''}
                ${parsed['Registrar Abuse Contact Phone'] ? `<div class="flex items-center gap-2"><i class="fas fa-phone text-xs" style="color: var(--text-secondary);"></i><span class="text-sm">${parsed['Registrar Abuse Contact Phone']}</span></div>` : ''}
              </div>
            </div>
          `;
        }
        
        // Build broker button if link is configured
        let brokerButtonHtml = '';
        if (brokerLink) {
          const finalBrokerUrl = brokerLink.replace(/\{\{\s*domain\s*\}\}/g, result.domain);
          brokerButtonHtml = `
            <div class="mb-4 pb-4" style="border-bottom: 1px solid var(--border-color);">
              <button 
                onclick="window.open('${finalBrokerUrl}', '_blank', 'noopener,noreferrer'); return false;" 
                class="w-full px-4 py-2 bg-blue-600 text-white border border-blue-600 rounded hover:bg-transparent hover:text-blue-600 transition font-medium text-sm"
                style="cursor: pointer;">
                ${t('broker.button')}
              </button>
            </div>
          `;
        }
        
        content.innerHTML = `
          ${brokerButtonHtml}
          <div class="space-y-0">
            ${cardsHtml}
          </div>
        `;
      } else {
        // Fallback to JSON display if no parsed data
        content.innerHTML = `
          <div class="p-4 rounded-lg" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color);">
            <pre class="overflow-x-auto text-xs" style="color: var(--text-primary);">${JSON.stringify(whois, null, 2)}</pre>
          </div>
        `;
      }
    }).catch(error => {
      console.error('Error loading data:', error);
      content.innerHTML = `<p class="text-red-600">${t('error.whois')}</p>`;
    });
  } else {
    // Unknown status
    content.innerHTML = `
      <div class="text-center py-8" style="color: var(--text-secondary);">
        <i class="fas fa-question-circle text-4xl mb-3"></i>
        <p>Status information unavailable</p>
      </div>
    `;
  }
}

async function fetchWhoisData(domain) {
  const response = await axios.get(`/api/whois/${domain}`);
  return response.data;
}

// ============================================
// Event Listeners
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  // Fetch current exchange rate
  fetchExchangeRate();
  
  // Apply saved theme
  applyTheme(currentTheme);
  
  // Apply saved language
  switchLanguage(currentLang);
  
  // Apply saved currency
  switchCurrency(currentCurrency);

  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', () => {
    applyTheme(currentTheme === 'light' ? 'dark' : 'light');
  });

  // Language toggle
  document.getElementById('langToggle').addEventListener('click', () => {
    const newLang = currentLang === 'en' ? 'ja' : 'en';
    switchLanguage(newLang);
    const newCurrency = newLang === 'ja' ? 'JPY' : 'USD';
    switchCurrency(newCurrency);
  });
  
  // Currency toggle
  const currencyToggle = document.getElementById('currencyToggle');
  if (currencyToggle) {
    currencyToggle.addEventListener('click', () => {
      switchCurrency(currentCurrency === 'USD' ? 'JPY' : 'USD');
    });
  }

  // Search button (optional - only if exists)
  const searchBtn = document.getElementById('searchBtn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      const query = document.getElementById('searchInput').value;
      searchDomains(query);
    });
  }

  // Get search elements
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearBtn');
  
  if (!searchInput || !clearBtn) {
    console.error('Search input or clear button not found');
    return;
  }

  // Search on Enter key
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const query = e.target.value;
      searchDomains(query);
    }
  });

  // Real-time search (debounced)
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value;
    
    // Show/hide clear button
    if (query.length > 0) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }
    
    if (query.length >= 3) {
      searchTimeout = setTimeout(() => {
        searchDomains(query);
      }, 500);
    } else if (query.length === 0) {
      // Hide results when search is cleared
      document.getElementById('loadingState').classList.add('hidden');
      document.getElementById('resultsContainer').classList.add('hidden');
      const emptyState = document.getElementById('emptyState');
      if (emptyState) emptyState.classList.remove('hidden');
    }
  });

  // Clear button
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.classList.add('hidden');
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('resultsContainer').classList.add('hidden');
    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.classList.remove('hidden');
    searchInput.focus();
  });

  // Close modal
  document.getElementById('closeModal').addEventListener('click', () => {
    document.getElementById('domainModal').classList.add('hidden');
  });

  // Close modal on outside click
  document.getElementById('domainModal').addEventListener('click', (e) => {
    if (e.target.id === 'domainModal') {
      document.getElementById('domainModal').classList.add('hidden');
    }
  });
});
