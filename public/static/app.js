// Main application JavaScript

// ============================================
// State Management
// ============================================
let currentLang = localStorage.getItem('lang') || 'en';
let currentTheme = localStorage.getItem('theme') || 'light';
let searchTimeout = null;

// ============================================
// i18n Translations
// ============================================
const translations = {
  en: {
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
    'whois.title': 'WHOIS Information',
    'whois.loading': 'Loading WHOIS data...',
    'error.search': 'Failed to search domains. Please try again.',
    'error.whois': 'Failed to load WHOIS data.'
  },
  ja: {
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
    'whois.title': 'WHOIS情報',
    'whois.loading': 'WHOISデータを読み込み中...',
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

// ============================================
// Search Functions
// ============================================
async function searchDomains(query) {
  if (!query || query.trim().length === 0) {
    return;
  }

  // Show loading state
  const emptyState = document.getElementById('emptyState');
  if (emptyState) emptyState.classList.add('hidden');
  document.getElementById('resultsContainer').classList.add('hidden');
  document.getElementById('loadingState').classList.remove('hidden');

  try {
    const response = await axios.post('/api/search', { query });
    const data = response.data;

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
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('resultsContainer').classList.remove('hidden');
  document.getElementById('resultCount').textContent = data.results.length;

  const resultsList = document.getElementById('resultsList');
  resultsList.innerHTML = '';

  data.results.forEach((result, index) => {
    const card = createDomainCard(result, index);
    resultsList.appendChild(card);
  });
}

function createDomainCard(result, index) {
  const card = document.createElement('div');
  card.className = 'domain-card rounded-lg p-4 fade-in';
  card.style.animationDelay = `${index * 0.05}s`;

  const statusClass = result.status === 'available' ? 'status-available' : 
                      result.status === 'taken' ? 'status-taken' : 
                      'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300';

  let content = `
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center space-x-3">
        <h4 class="text-lg font-semibold">${result.domain}</h4>
        <span class="px-3 py-1 rounded-full text-sm font-medium ${statusClass}">
          ${t('domain.' + result.status)}
        </span>
      </div>
    </div>
  `;

  if (result.status === 'available' && result.registrars) {
    content += `
      <div class="mt-3">
        <p class="text-sm mb-2" style="color: var(--text-secondary);">${t('domain.register')}</p>
        <div class="flex flex-wrap gap-2">
          ${result.registrars.map(reg => `
            <a href="${reg.register_url}" 
               target="_blank" 
               rel="noopener noreferrer"
               class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm">
              ${reg.logo_url ? `<img src="${reg.logo_url}" alt="${reg.name}" class="w-4 h-4 mr-2">` : ''}
              ${reg.name}
              ${reg.price ? ` - $${reg.price}` : ''}
            </a>
          `).join('')}
        </div>
      </div>
    `;
  } else if (result.status === 'taken') {
    content += `
      <div class="mt-3">
        <button onclick="showWhois('${result.domain}')" 
                class="px-4 py-2 border rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition text-sm"
                style="border-color: var(--border-color);">
          <i class="fas fa-info-circle mr-2"></i>${t('domain.whois')}
        </button>
      </div>
    `;
  }

  card.innerHTML = content;
  return card;
}

async function showWhois(domain) {
  const modal = document.getElementById('whoisModal');
  const content = document.getElementById('whoisContent');
  
  modal.classList.remove('hidden');
  content.innerHTML = '<div class="loader mx-auto"></div><p class="text-center mt-4">' + t('whois.loading') + '</p>';

  try {
    const response = await axios.get(`/api/whois/${domain}`);
    const data = response.data;

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
  } catch (error) {
    console.error('WHOIS error:', error);
    content.innerHTML = `<p class="text-red-600">${t('error.whois')}</p>`;
  }
}

// ============================================
// Event Listeners
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  // Apply saved theme
  applyTheme(currentTheme);
  
  // Apply saved language
  switchLanguage(currentLang);

  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', () => {
    applyTheme(currentTheme === 'light' ? 'dark' : 'light');
  });

  // Language toggle
  document.getElementById('langToggle').addEventListener('click', () => {
    switchLanguage(currentLang === 'en' ? 'ja' : 'en');
  });

  // Search button
  document.getElementById('searchBtn').addEventListener('click', () => {
    const query = document.getElementById('searchInput').value;
    searchDomains(query);
  });

  // Search on Enter key
  document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const query = e.target.value;
      searchDomains(query);
    }
  });

  // Real-time search (debounced)
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearBtn');
  
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
    document.getElementById('whoisModal').classList.add('hidden');
  });

  // Close modal on outside click
  document.getElementById('whoisModal').addEventListener('click', (e) => {
    if (e.target.id === 'whoisModal') {
      document.getElementById('whoisModal').classList.add('hidden');
    }
  });
});

// Make showWhois available globally
window.showWhois = showWhois;
