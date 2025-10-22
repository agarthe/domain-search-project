// Main application JavaScript

// ============================================
// State Management
// ============================================
let currentLang = localStorage.getItem('lang') || 'en';
let currentTheme = localStorage.getItem('theme') || 'light';
let currentCurrency = localStorage.getItem('currency') || (currentLang === 'ja' ? 'JPY' : 'USD');
let searchTimeout = null;
let lastSearchResults = null;

// Exchange rate (USD to JPY, can be updated manually)
const USD_TO_JPY = 150;

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
    'domain.available': '利用可能',
    'domain.taken': '取得済み',
    'domain.unknown': '不明',
    'domain.register': '登録先:',
    'domain.whois': 'WHOIS表示',
    'domain.details': '詳細表示',
    'whois.title': 'WHOIS情報',
    'whois.loading': 'WHOISデータを読み込み中...',
    'modal.registrars': '利用可能なレジストラ',
    'modal.cheapest': '最安値',
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

function formatPrice(priceUSD) {
  if (!priceUSD) return 'N/A';
  
  if (currentCurrency === 'JPY') {
    const priceJPY = Math.round(priceUSD * USD_TO_JPY);
    return `${priceJPY.toLocaleString()}円`;
  } else {
    return `$${priceUSD}`;
  }
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

  data.results.forEach((result, index) => {
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
  
  modalTitle.textContent = result.domain;
  modal.classList.remove('hidden');

  if (result.status === 'available' && result.registrars) {
    // Show registrars for available domains
    content.innerHTML = `
      <div class="space-y-4">
        <div>
          <h4 class="font-semibold mb-3 text-lg">${t('modal.registrars')}</h4>
          <p class="text-sm mb-4" style="color: var(--text-secondary);">
            ${result.registrars.length} registrar(s) available • Sorted by price
          </p>
        </div>
        <div class="space-y-3">
          ${result.registrars.map((reg, idx) => `
            <a href="${reg.register_url}" 
               target="_blank" 
               rel="noopener noreferrer"
               class="registrar-card flex items-center justify-between p-4 border rounded-lg transition"
               style="border-color: var(--border-color);"
               onmouseenter="this.style.backgroundColor=document.documentElement.classList.contains('dark')?'#1f2937':'#fafafa'"
               onmouseleave="this.style.backgroundColor='transparent'">
              <div class="flex items-center space-x-3">
                ${reg.logo_url ? `<img src="${reg.logo_url}" alt="${reg.name}" class="w-8 h-8">` : ''}
                <div>
                  <div class="font-semibold">${reg.name}</div>
                  ${reg.renewal_price ? `<div class="text-xs" style="color: var(--text-secondary);">Renewal: ${formatPrice(reg.renewal_price)}</div>` : ''}
                </div>
              </div>
              <div class="text-right">
                <div class="text-lg font-bold text-blue-600">
                  ${formatPrice(reg.price)}
                </div>
                ${idx === 0 && reg.price ? `<div class="text-xs text-green-600">${t('modal.cheapest')}</div>` : ''}
              </div>
            </a>
          `).join('')}
        </div>
      </div>
    `;
  } else if (result.status === 'taken') {
    // Show WHOIS for taken domains
    content.innerHTML = '<div class="loader mx-auto"></div><p class="text-center mt-4">' + t('whois.loading') + '</p>';
    
    fetchWhoisData(result.domain).then(data => {
      content.innerHTML = `
        <div class="space-y-3">
          <div>
            <h4 class="font-semibold mb-1">Domain</h4>
            <p style="color: var(--text-secondary);">${data.domain}</p>
          </div>
          <div>
            <h4 class="font-semibold mb-1">WHOIS Data</h4>
            <pre class="p-4 rounded overflow-x-auto text-xs" style="background-color: var(--bg-secondary);">${JSON.stringify(data.whois, null, 2)}</pre>
          </div>
        </div>
      `;
    }).catch(error => {
      console.error('WHOIS error:', error);
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
