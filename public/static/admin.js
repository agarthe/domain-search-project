// Admin panel JavaScript

// ============================================
// State Management
// ============================================
let currentTheme = localStorage.getItem('theme') || 'light';
let registrarsData = [];
let pricingData = [];
let filteredPricingData = [];
let currentPage = 1;
let pageSize = 25;

// ============================================
// Theme Management
// ============================================
function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.className = theme;
  localStorage.setItem('theme', theme);
  
  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  }
}

// ============================================
// Tab Management
// ============================================
function switchTab(tabName) {
  // Update buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.style.borderBottom = '2px solid transparent';
    btn.style.color = 'var(--text-secondary)';
  });
  
  const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
  activeBtn.style.borderBottom = '2px solid #3b82f6';
  activeBtn.style.color = 'var(--text-primary)';

  // Update content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.add('hidden');
  });
  
  document.getElementById(`${tabName}Tab`).classList.remove('hidden');
}

// ============================================
// Registrars Management
// ============================================
async function loadRegistrars() {
  try {
    const response = await axios.get('/api/admin/registrars');
    registrarsData = response.data;
    renderRegistrars();
  } catch (error) {
    console.error('Failed to load registrars:', error);
    alert('Failed to load registrars');
  }
}

function renderRegistrars() {
  const tbody = document.querySelector('#registrarsTable tbody');
  tbody.innerHTML = '';

  registrarsData.forEach(reg => {
    const row = document.createElement('tr');
    row.style.borderBottom = '1px solid var(--border-color)';
    row.innerHTML = `
      <td class="py-3 px-4 font-mono text-sm text-gray-500">${reg.id}</td>
      <td class="py-3 px-4">${reg.name}</td>
      <td class="py-3 px-4">
        <a href="${reg.website}" target="_blank" class="text-blue-600 hover:underline text-sm">
          ${reg.website}
        </a>
      </td>
      <td class="py-3 px-4">
        <div class="text-xs" style="color: var(--text-secondary); max-width: 300px; overflow: hidden; text-overflow: ellipsis;">
          ${reg.affiliate_link_template}
        </div>
      </td>
      <td class="py-3 px-4">
        <span class="px-2 py-1 rounded text-xs ${reg.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
          ${reg.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td class="py-3 px-4">${reg.display_order}</td>
      <td class="py-3 px-4">
        <button onclick="editRegistrar(${reg.id})" class="text-blue-600 hover:underline mr-2">
          <i class="fas fa-edit"></i>
        </button>
        <button onclick="deleteRegistrar(${reg.id})" class="text-red-600 hover:underline">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

async function deleteRegistrar(id) {
  if (!confirm('Are you sure you want to delete this registrar?')) {
    return;
  }

  try {
    await axios.delete(`/api/admin/registrars/${id}`);
    alert('Registrar deleted successfully');
    loadRegistrars();
  } catch (error) {
    console.error('Failed to delete registrar:', error);
    alert('Failed to delete registrar');
  }
}

function editRegistrar(id) {
  const registrar = registrarsData.find(r => r.id === id);
  if (!registrar) return;

  const name = prompt('Name:', registrar.name);
  if (!name) return;

  const website = prompt('Website:', registrar.website);
  if (!website) return;

  const affiliateLink = prompt('Affiliate Link Template (use {domain}):', registrar.affiliate_link_template);
  if (!affiliateLink) return;

  const logoUrl = prompt('Logo URL:', registrar.logo_url || '');
  const isActive = confirm('Is active?');
  const displayOrder = parseInt(prompt('Display Order:', registrar.display_order) || '0');

  updateRegistrar(id, {
    name,
    website,
    affiliate_link_template: affiliateLink,
    logo_url: logoUrl,
    is_active: isActive ? 1 : 0,
    display_order: displayOrder
  });
}

async function updateRegistrar(id, data) {
  try {
    await axios.put(`/api/admin/registrars/${id}`, data);
    alert('Registrar updated successfully');
    loadRegistrars();
  } catch (error) {
    console.error('Failed to update registrar:', error);
    alert('Failed to update registrar');
  }
}

function addRegistrar() {
  const name = prompt('Registrar Name:');
  if (!name) return;

  const website = prompt('Website URL:');
  if (!website) return;

  const affiliateLink = prompt('Affiliate Link Template (use {domain}):');
  if (!affiliateLink) return;

  const logoUrl = prompt('Logo URL (optional):');
  const displayOrder = parseInt(prompt('Display Order:', '0') || '0');

  createRegistrar({
    name,
    website,
    affiliate_link_template: affiliateLink,
    logo_url: logoUrl || null,
    display_order: displayOrder
  });
}

async function createRegistrar(data) {
  try {
    await axios.post('/api/admin/registrars', data);
    alert('Registrar created successfully');
    loadRegistrars();
  } catch (error) {
    console.error('Failed to create registrar:', error);
    alert('Failed to create registrar');
  }
}

// ============================================
// Pricing Management
// ============================================
async function loadPricing() {
  try {
    const response = await axios.get('/api/admin/pricing');
    pricingData = response.data;
    filteredPricingData = [...pricingData];
    currentPage = 1;
    renderPricing();
  } catch (error) {
    console.error('Failed to load pricing:', error);
    alert('Failed to load pricing');
  }
}

function filterPricing(searchTerm) {
  const term = searchTerm.toLowerCase().trim();
  if (!term) {
    filteredPricingData = [...pricingData];
  } else {
    filteredPricingData = pricingData.filter(price => 
      price.tld.toLowerCase().includes(term) || 
      price.registrar_name.toLowerCase().includes(term) ||
      String(price.registrar_id).includes(term)
    );
  }
  currentPage = 1;
  renderPricing();
}

function renderPricing() {
  const tbody = document.querySelector('#pricingTable tbody');
  tbody.innerHTML = '';

  // Calculate pagination
  const totalItems = filteredPricingData.length;
  const itemsToShow = pageSize === 'all' ? totalItems : parseInt(pageSize);
  const totalPages = pageSize === 'all' ? 1 : Math.ceil(totalItems / itemsToShow);
  const startIndex = pageSize === 'all' ? 0 : (currentPage - 1) * itemsToShow;
  const endIndex = pageSize === 'all' ? totalItems : Math.min(startIndex + itemsToShow, totalItems);
  
  const itemsToDisplay = filteredPricingData.slice(startIndex, endIndex);

  // Render table rows
  itemsToDisplay.forEach(price => {
    const row = document.createElement('tr');
    row.style.borderBottom = '1px solid var(--border-color)';
    row.innerHTML = `
      <td class="py-3 px-4">${price.registrar_name}</td>
      <td class="py-3 px-4">${price.tld}</td>
      <td class="py-3 px-4">${price.currency}</td>
      <td class="py-3 px-4">${price.price}</td>
      <td class="py-3 px-4">${price.renewal_price || '-'}</td>
      <td class="py-3 px-4">${price.transfer_price || '-'}</td>
      <td class="py-3 px-4">
        <button onclick="editPricing(${price.id})" class="text-blue-600 hover:underline mr-2">
          <i class="fas fa-edit"></i>
        </button>
        <button onclick="deletePricing(${price.id})" class="text-red-600 hover:underline">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });

  // Update pagination info
  const resultInfo = document.getElementById('pricingResultInfo');
  if (resultInfo) {
    resultInfo.textContent = `Showing ${startIndex + 1}-${endIndex} of ${totalItems} entries`;
  }

  // Update pagination buttons
  const prevBtn = document.getElementById('pricingPrevBtn');
  const nextBtn = document.getElementById('pricingNextBtn');
  
  if (prevBtn) {
    prevBtn.disabled = currentPage <= 1 || pageSize === 'all';
  }
  
  if (nextBtn) {
    nextBtn.disabled = currentPage >= totalPages || pageSize === 'all';
  }
}

async function deletePricing(id) {
  if (!confirm('Are you sure you want to delete this pricing?')) {
    return;
  }

  try {
    await axios.delete(`/api/admin/pricing/${id}`);
    alert('Pricing deleted successfully');
    loadPricing();
  } catch (error) {
    console.error('Failed to delete pricing:', error);
    alert('Failed to delete pricing');
  }
}

function editPricing(id) {
  const pricing = pricingData.find(p => p.id === id);
  if (!pricing) return;

  const tld = prompt('TLD:', pricing.tld);
  if (!tld) return;

  const price = parseFloat(prompt('Price:', pricing.price));
  if (isNaN(price)) return;

  const renewalPrice = prompt('Renewal Price (optional):', pricing.renewal_price || '');
  const transferPrice = prompt('Transfer Price (optional):', pricing.transfer_price || '');
  const currency = prompt('Currency:', pricing.currency);

  updatePricing(id, {
    registrar_id: pricing.registrar_id,
    tld,
    price,
    renewal_price: renewalPrice ? parseFloat(renewalPrice) : null,
    transfer_price: transferPrice ? parseFloat(transferPrice) : null,
    currency: currency || 'USD'
  });
}

async function updatePricing(id, data) {
  try {
    await axios.put(`/api/admin/pricing/${id}`, data);
    alert('Pricing updated successfully');
    loadPricing();
  } catch (error) {
    console.error('Failed to update pricing:', error);
    alert('Failed to update pricing');
  }
}

function addPricing() {
  // Show registrar selection
  const registrarId = prompt('Registrar ID (from registrars list):');
  if (!registrarId) return;

  const tld = prompt('TLD (e.g., .com):');
  if (!tld) return;

  const price = parseFloat(prompt('Price:'));
  if (isNaN(price)) return;

  const renewalPrice = prompt('Renewal Price (optional):');
  const transferPrice = prompt('Transfer Price (optional):');
  const currency = prompt('Currency:', 'USD');

  createPricing({
    registrar_id: parseInt(registrarId),
    tld,
    price,
    renewal_price: renewalPrice ? parseFloat(renewalPrice) : null,
    transfer_price: transferPrice ? parseFloat(transferPrice) : null,
    currency: currency || 'USD'
  });
}

async function createPricing(data) {
  try {
    await axios.post('/api/admin/pricing', data);
    alert('Pricing created successfully');
    loadPricing();
  } catch (error) {
    console.error('Failed to create pricing:', error);
    alert('Failed to create pricing');
  }
}

// ============================================
// CSV Import Management
// ============================================
function showBulkImportPanel() {
  document.getElementById('bulkImportPanel').classList.remove('hidden');
  document.getElementById('addPricingBtn').disabled = true;
  document.getElementById('bulkImportBtn').disabled = true;
  document.getElementById('exportPricingBtn').disabled = true;
}

function hideBulkImportPanel() {
  document.getElementById('bulkImportPanel').classList.add('hidden');
  document.getElementById('bulkImportData').value = '';
  const fileInput = document.getElementById('pricingCsvFile');
  if (fileInput) fileInput.value = '';
  document.getElementById('addPricingBtn').disabled = false;
  document.getElementById('bulkImportBtn').disabled = false;
  document.getElementById('exportPricingBtn').disabled = false;
}

function showImportRegistrarsPanel() {
  document.getElementById('importRegistrarsPanel').classList.remove('hidden');
  document.getElementById('addRegistrarBtn').disabled = true;
  document.getElementById('importRegistrarsBtn').disabled = true;
  document.getElementById('exportRegistrarsBtn').disabled = true;
}

function hideImportRegistrarsPanel() {
  document.getElementById('importRegistrarsPanel').classList.add('hidden');
  document.getElementById('importRegistrarsData').value = '';
  document.getElementById('addRegistrarBtn').disabled = false;
  document.getElementById('importRegistrarsBtn').disabled = false;
  document.getElementById('exportRegistrarsBtn').disabled = false;
}

function loadCsvFile() {
  const fileInput = document.getElementById('pricingCsvFile');
  const file = fileInput.files[0];
  
  if (!file) {
    alert('Please select a CSV file');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const content = e.target.result;
    document.getElementById('bulkImportData').value = content;
  };
  reader.readAsText(file);
}

async function executeBulkImport() {
  const data = document.getElementById('bulkImportData').value.trim();
  if (!data) {
    alert('Please enter pricing data');
    return;
  }

  const lines = data.split('\n').filter(line => line.trim());
  const pricingItems = [];
  const errors = [];

  lines.forEach((line, index) => {
    const parts = line.split(',').map(p => p.trim());
    if (parts.length < 4) {
      errors.push(`Line ${index + 1}: Invalid format (need at least 4 fields)`);
      return;
    }

    const [registrarId, tld, currency, price, renewalPrice, transferPrice] = parts;
    
    if (!registrarId || !tld || !currency || !price) {
      errors.push(`Line ${index + 1}: Missing required fields`);
      return;
    }

    pricingItems.push({
      registrar_id: parseInt(registrarId),
      tld,
      currency,
      price: parseFloat(price),
      renewal_price: renewalPrice ? parseFloat(renewalPrice) : null,
      transfer_price: transferPrice ? parseFloat(transferPrice) : null
    });
  });

  if (errors.length > 0) {
    alert('Errors found:\n' + errors.join('\n'));
    return;
  }

  if (!confirm(`Import ${pricingItems.length} pricing records?`)) {
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const item of pricingItems) {
    try {
      await axios.post('/api/admin/pricing', item);
      successCount++;
    } catch (error) {
      console.error('Failed to import item:', item, error);
      failCount++;
    }
  }

  alert(`Import completed:\nSuccess: ${successCount}\nFailed: ${failCount}`);
  hideBulkImportPanel();
  loadPricing();
}

async function executeImportRegistrars() {
  const data = document.getElementById('importRegistrarsData').value.trim();
  if (!data) {
    alert('Please enter registrar data');
    return;
  }

  const lines = data.split('\n').filter(line => line.trim());
  const registrarItems = [];
  const errors = [];

  lines.forEach((line, index) => {
    const parts = line.split(',').map(p => p.trim());
    if (parts.length < 2) {
      errors.push(`Line ${index + 1}: Invalid format (need at least name and website)`);
      return;
    }

    const [name, website, affiliateLink, logoUrl, isActive, displayOrder] = parts;
    
    if (!name || !website) {
      errors.push(`Line ${index + 1}: Missing required fields (name, website)`);
      return;
    }

    registrarItems.push({
      name,
      website,
      affiliate_link_template: affiliateLink || website,
      logo_url: logoUrl || '',
      is_active: isActive ? parseInt(isActive) : 1,
      display_order: displayOrder ? parseInt(displayOrder) : 0
    });
  });

  if (errors.length > 0) {
    alert('Errors found:\n' + errors.join('\n'));
    return;
  }

  if (!confirm(`Import ${registrarItems.length} registrar records?`)) {
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const item of registrarItems) {
    try {
      await axios.post('/api/admin/registrars', item);
      successCount++;
    } catch (error) {
      console.error('Failed to import registrar:', item, error);
      failCount++;
    }
  }

  alert(`Import completed:\nSuccess: ${successCount}\nFailed: ${failCount}`);
  hideImportRegistrarsPanel();
  loadRegistrars();
}

// ============================================
// API Keys Management
// ============================================
async function loadApiKeys() {
  try {
    const response = await axios.get('/api/admin/apikeys');
    renderApiKeys(response.data);
  } catch (error) {
    console.error('Failed to load API keys:', error);
    alert('Failed to load API keys');
  }
}

function renderApiKeys(apiKeys) {
  const container = document.getElementById('apiKeysList');
  container.innerHTML = '';

  apiKeys.forEach(key => {
    const card = document.createElement('div');
    card.className = 'panel-card rounded-lg p-4';
    card.innerHTML = `
      <div class="flex justify-between items-start">
        <div class="flex-1">
          <h3 class="font-semibold mb-2">${key.service_name}</h3>
          <p class="text-sm mb-1" style="color: var(--text-secondary);">
            API Key: ${key.api_key_masked}
          </p>
          ${key.base_url ? `<p class="text-sm mb-1" style="color: var(--text-secondary);">Base URL: ${key.base_url}</p>` : ''}
          <span class="inline-block px-2 py-1 rounded text-xs ${key.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
            ${key.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <button onclick="editApiKey(${key.id}, '${key.service_name}')" class="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
          <i class="fas fa-edit mr-1"></i>Edit
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

function editApiKey(id, serviceName) {
  const apiKey = prompt(`API Key for ${serviceName}:`, '');
  if (!apiKey) return;

  const apiSecret = prompt('API Secret (optional):', '');
  const baseUrl = prompt('Base URL (optional):', '');
  const isActive = confirm('Is active?');

  updateApiKey(id, {
    api_key: apiKey,
    api_secret: apiSecret || null,
    base_url: baseUrl || null,
    is_active: isActive ? 1 : 0
  });
}

async function updateApiKey(id, data) {
  try {
    await axios.put(`/api/admin/apikeys/${id}`, data);
    alert('API Key updated successfully');
    loadApiKeys();
  } catch (error) {
    console.error('Failed to update API key:', error);
    alert('Failed to update API key');
  }
}

// ============================================
// Settings Management
// ============================================
async function loadSettings() {
  try {
    const response = await axios.get('/api/admin/settings');
    const settings = response.data;
    
    // Find TinyMCE API key setting
    const tinymceKeySetting = settings.find(s => s.setting_key === 'tinymce_api_key');
    if (tinymceKeySetting) {
      document.getElementById('tinymceApiKeyInput').value = tinymceKeySetting.setting_value || 'no-api-key';
    }
    
    // Find broker link setting
    const brokerLinkSetting = settings.find(s => s.setting_key === 'domain_broker_link');
    if (brokerLinkSetting) {
      document.getElementById('brokerLinkInput').value = brokerLinkSetting.setting_value || '';
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
    alert('Failed to load settings');
  }
}

async function saveTinymceKey() {
  const input = document.getElementById('tinymceApiKeyInput');
  const statusDiv = document.getElementById('tinymceKeyStatus');
  const value = input.value.trim();
  
  if (!value) {
    statusDiv.textContent = '✗ API key cannot be empty';
    statusDiv.className = 'text-sm text-red-600';
    statusDiv.classList.remove('hidden');
    return;
  }
  
  try {
    await axios.put('/api/admin/settings/tinymce_api_key', { value });
    
    statusDiv.textContent = '✓ API key saved successfully! Please reload the page to apply changes.';
    statusDiv.className = 'text-sm text-green-600';
    statusDiv.classList.remove('hidden');
    
    setTimeout(() => {
      statusDiv.classList.add('hidden');
    }, 5000);
  } catch (error) {
    console.error('Failed to save TinyMCE API key:', error);
    statusDiv.textContent = '✗ Failed to save API key';
    statusDiv.className = 'text-sm text-red-600';
    statusDiv.classList.remove('hidden');
  }
}

async function saveBrokerLink() {
  const input = document.getElementById('brokerLinkInput');
  const statusDiv = document.getElementById('brokerLinkStatus');
  const value = input.value.trim();
  
  try {
    await axios.put('/api/admin/settings/domain_broker_link', { value });
    
    statusDiv.textContent = '✓ Settings saved successfully!';
    statusDiv.className = 'text-sm text-green-600';
    statusDiv.classList.remove('hidden');
    
    setTimeout(() => {
      statusDiv.classList.add('hidden');
    }, 3000);
  } catch (error) {
    console.error('Failed to save settings:', error);
    statusDiv.textContent = '✗ Failed to save settings';
    statusDiv.className = 'text-sm text-red-600';
    statusDiv.classList.remove('hidden');
  }
}

// ============================================
// History Management
// ============================================
async function loadHistory() {
  try {
    // Load recent history
    const recentResponse = await axios.get('/api/admin/history/recent');
    renderRecentHistory(recentResponse.data);
    
    // Load available months
    const monthsResponse = await axios.get('/api/admin/history/months');
    renderMonthlyExport(monthsResponse.data);
  } catch (error) {
    console.error('Failed to load history:', error);
    alert('Failed to load search history');
  }
}

function renderRecentHistory(history) {
  const tbody = document.querySelector('#historyTable tbody');
  tbody.innerHTML = '';

  history.forEach(record => {
    const row = document.createElement('tr');
    row.style.borderBottom = '1px solid var(--border-color)';
    
    // searched_at is already in JST format from backend (YYYY-MM-DD HH:mm:ss)
    const formattedDate = record.searched_at;
    
    const statusColors = {
      'available': 'text-green-600 dark:text-green-400',
      'taken': 'text-red-600 dark:text-red-400',
      'unknown': 'text-gray-600 dark:text-gray-400'
    };
    
    row.innerHTML = `
      <td class="py-3 px-4">${formattedDate}</td>
      <td class="py-3 px-4 font-mono text-sm">${record.domain}</td>
      <td class="py-3 px-4">${record.tld || '-'}</td>
      <td class="py-3 px-4 ${statusColors[record.status] || ''}">${record.status}</td>
      <td class="py-3 px-4">${record.language === 'ja' ? '🇯🇵 JA' : '🇺🇸 EN'}</td>
    `;
    tbody.appendChild(row);
  });
}

function renderMonthlyExport(months) {
  const container = document.getElementById('monthlyExportList');
  container.innerHTML = '';

  if (months.length === 0) {
    container.innerHTML = '<p class="text-sm" style="color: var(--text-secondary);">No search history available yet.</p>';
    return;
  }

  months.forEach(month => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between p-3 rounded border';
    row.style.borderColor = 'var(--border-color)';
    
    const monthDate = new Date(month.month + '-01');
    const monthName = monthDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    
    row.innerHTML = `
      <div>
        <span class="font-semibold">${monthName}</span>
        <span class="text-sm ml-2" style="color: var(--text-secondary);">(${month.count} searches)</span>
      </div>
      <button 
        onclick="downloadMonthlyCSV('${month.month}')"
        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
        <i class="fas fa-download mr-2"></i>Download CSV
      </button>
    `;
    container.appendChild(row);
  });
}

function downloadMonthlyCSV(month) {
  window.location.href = `/api/admin/history/export/${month}`;
}

// ============================================
// CSV Export Functions
// ============================================
function exportToCSV(data, filename, headers) {
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }
  
  // Create CSV header
  const csvRows = [];
  csvRows.push(headers.join(','));
  
  // Add data rows
  data.forEach(item => {
    const values = headers.map(header => {
      const key = header.toLowerCase().replace(/ /g, '_');
      let value = item[key];
      
      // Handle null/undefined
      if (value === null || value === undefined) {
        value = '';
      }
      
      // Escape quotes and wrap in quotes if contains comma, quote or newline
      value = String(value);
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        value = '"' + value.replace(/"/g, '""') + '"';
      }
      
      return value;
    });
    csvRows.push(values.join(','));
  });
  
  // Create blob and download
  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportRegistrars() {
  const headers = ['id', 'name', 'website', 'affiliate_link_template', 'logo_url', 'is_active', 'display_order'];
  const filename = `registrars_${new Date().toISOString().split('T')[0]}.csv`;
  exportToCSV(registrarsData, filename, headers);
}

function exportPricing() {
  const headers = ['id', 'registrar_id', 'registrar_name', 'tld', 'currency', 'price', 'renewal_price', 'transfer_price'];
  const filename = `pricing_${new Date().toISOString().split('T')[0]}.csv`;
  exportToCSV(pricingData, filename, headers);
}

// ============================================
// Event Listeners
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  // Set current year in footer
  const yearElement = document.getElementById('currentYear');
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }
  
  // Apply theme
  applyTheme(currentTheme);

  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', () => {
    applyTheme(currentTheme === 'light' ? 'dark' : 'light');
  });

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
      
      // Load data for the active tab
      if (btn.dataset.tab === 'registrars') {
        loadRegistrars();
      } else if (btn.dataset.tab === 'pricing') {
        loadPricing();
      } else if (btn.dataset.tab === 'apikeys') {
        loadApiKeys();
      } else if (btn.dataset.tab === 'settings') {
        loadSettings();
      } else if (btn.dataset.tab === 'history') {
        loadHistory();
      } else if (btn.dataset.tab === 'content') {
        loadContentPages();
      }
    });
  });

  // Add buttons
  document.getElementById('addRegistrarBtn').addEventListener('click', addRegistrar);
  document.getElementById('addPricingBtn').addEventListener('click', addPricing);
  
  // Export buttons
  document.getElementById('exportRegistrarsBtn').addEventListener('click', exportRegistrars);
  document.getElementById('exportPricingBtn').addEventListener('click', exportPricing);
  
  // Settings buttons
  const saveTinymceKeyBtn = document.getElementById('saveTinymceKeyBtn');
  if (saveTinymceKeyBtn) {
    saveTinymceKeyBtn.addEventListener('click', saveTinymceKey);
  }
  
  const saveBrokerLinkBtn = document.getElementById('saveBrokerLinkBtn');
  if (saveBrokerLinkBtn) {
    saveBrokerLinkBtn.addEventListener('click', saveBrokerLink);
  }
  
  // CSV import buttons for Pricing
  document.getElementById('bulkImportBtn').addEventListener('click', showBulkImportPanel);
  document.getElementById('importExecuteBtn').addEventListener('click', executeBulkImport);
  document.getElementById('importCancelBtn').addEventListener('click', hideBulkImportPanel);
  
  // CSV file loader for Pricing
  const loadCsvBtn = document.getElementById('loadCsvBtn');
  if (loadCsvBtn) {
    loadCsvBtn.addEventListener('click', loadCsvFile);
  }
  
  // CSV import buttons for Registrars
  const importRegistrarsBtn = document.getElementById('importRegistrarsBtn');
  if (importRegistrarsBtn) {
    importRegistrarsBtn.addEventListener('click', showImportRegistrarsPanel);
  }
  
  const importRegistrarsExecuteBtn = document.getElementById('importRegistrarsExecuteBtn');
  if (importRegistrarsExecuteBtn) {
    importRegistrarsExecuteBtn.addEventListener('click', executeImportRegistrars);
  }
  
  const importRegistrarsCancelBtn = document.getElementById('importRegistrarsCancelBtn');
  if (importRegistrarsCancelBtn) {
    importRegistrarsCancelBtn.addEventListener('click', hideImportRegistrarsPanel);
  }

  // Pricing pagination and filtering
  const pricingSearchInput = document.getElementById('pricingSearchInput');
  if (pricingSearchInput) {
    pricingSearchInput.addEventListener('input', (e) => {
      filterPricing(e.target.value);
    });
  }
  
  const pricingPageSize = document.getElementById('pricingPageSize');
  if (pricingPageSize) {
    pricingPageSize.addEventListener('change', (e) => {
      pageSize = e.target.value;
      currentPage = 1;
      renderPricing();
    });
  }
  
  const pricingPrevBtn = document.getElementById('pricingPrevBtn');
  if (pricingPrevBtn) {
    pricingPrevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderPricing();
      }
    });
  }
  
  const pricingNextBtn = document.getElementById('pricingNextBtn');
  if (pricingNextBtn) {
    pricingNextBtn.addEventListener('click', () => {
      const totalItems = filteredPricingData.length;
      const itemsPerPage = parseInt(pageSize);
      const totalPages = Math.ceil(totalItems / itemsPerPage);
      if (currentPage < totalPages) {
        currentPage++;
        renderPricing();
      }
    });
  }

  // Load initial data
  loadRegistrars();
});

// ============================================
// Content Pages Management
// ============================================
let contentPagesData = [];
let currentEditingContentId = null;
let tinyMCEInitialized = false;
let currentEditorMode = 'visual'; // 'visual' or 'html'
let currentPreviewLang = 'en';

async function loadContentPages() {
  try {
    const response = await axios.get('/api/admin/content');
    contentPagesData = response.data;
    renderContentPages();
  } catch (error) {
    console.error('Failed to load content pages:', error);
    alert('Failed to load content pages');
  }
}

function renderContentPages() {
  const tbody = document.querySelector('#contentTable tbody');
  tbody.innerHTML = '';

  contentPagesData.forEach(page => {
    const row = document.createElement('tr');
    row.style.borderBottom = '1px solid var(--border-color)';
    
    const pageKeyLabels = {
      'how_to_use': 'How to Use',
      'company': 'Company',
      'terms': 'Terms of Service',
      'privacy': 'Privacy Policy'
    };
    
    row.innerHTML = `
      <td class="py-3 px-4 font-medium">${pageKeyLabels[page.page_key] || page.page_key}</td>
      <td class="py-3 px-4">${page.title_en}</td>
      <td class="py-3 px-4">${page.title_ja}</td>
      <td class="py-3 px-4 text-sm" style="color: var(--text-secondary);">
        ${page.updated_at ? new Date(page.updated_at).toLocaleString() : '-'}
      </td>
      <td class="py-3 px-4">
        <button onclick="editContentPage(${page.id})" 
                class="text-blue-600 hover:text-blue-800 mr-3">
          <i class="fas fa-edit"></i> Edit
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

async function editContentPage(id) {
  try {
    const response = await axios.get(`/api/admin/content/${id}`);
    const page = response.data;
    
    currentEditingContentId = id;
    
    document.getElementById('titleEn').value = page.title_en || '';
    document.getElementById('contentEn').value = page.content_en || '';
    document.getElementById('titleJa').value = page.title_ja || '';
    document.getElementById('contentJa').value = page.content_ja || '';
    
    document.getElementById('contentEditModal').classList.remove('hidden');
    
    // Check if TinyMCE is loaded
    if (typeof tinymce === 'undefined') {
      alert('TinyMCE is not loaded. Please check your TinyMCE API key in Settings tab and reload the page.');
      return;
    }
    
    // Initialize TinyMCE if not already done
    if (!tinyMCEInitialized) {
      initializeTinyMCE();
    }
    
    // Switch to English tab by default
    switchEditorTab('english');
    
    // Load version history
    loadVersionHistory(id);
  } catch (error) {
    console.error('Failed to load content page:', error);
    alert('Failed to load content page');
  }
}

async function saveContentPage() {
  if (!currentEditingContentId) return;
  
  // Get content from TinyMCE if in visual mode
  let contentEn, contentJa;
  if (tinymce.get('contentEn')) {
    contentEn = tinymce.get('contentEn').getContent();
  } else {
    contentEn = document.getElementById('contentEn').value;
  }
  
  if (tinymce.get('contentJa')) {
    contentJa = tinymce.get('contentJa').getContent();
  } else {
    contentJa = document.getElementById('contentJa').value;
  }
  
  const data = {
    title_en: document.getElementById('titleEn').value,
    content_en: contentEn,
    title_ja: document.getElementById('titleJa').value,
    content_ja: contentJa,
    is_active: 1
  };
  
  try {
    await axios.put(`/api/admin/content/${currentEditingContentId}`, data);
    document.getElementById('contentEditModal').classList.add('hidden');
    
    // Destroy TinyMCE instances
    if (tinymce.get('contentEn')) tinymce.get('contentEn').remove();
    if (tinymce.get('contentJa')) tinymce.get('contentJa').remove();
    tinyMCEInitialized = false;
    
    loadContentPages();
    alert('Content page updated successfully');
  } catch (error) {
    console.error('Failed to save content page:', error);
    alert('Failed to save content page');
  }
}

// ============================================
// TinyMCE Initialization
// ============================================
function initializeTinyMCE() {
  tinymce.init({
    selector: '#contentEn, #contentJa',
    height: 500,
    menubar: true,
    plugins: [
      'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
      'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
      'insertdatetime', 'media', 'table', 'help', 'wordcount'
    ],
    toolbar: 'undo redo | formatselect | bold italic underline strikethrough | ' +
             'alignleft aligncenter alignright alignjustify | ' +
             'bullist numlist outdent indent | link image | ' +
             'forecolor backcolor | removeformat | code | help',
    content_style: 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; line-height: 1.6; }',
    branding: false,
    promotion: false,
    setup: function(editor) {
      editor.on('init', function() {
        console.log('TinyMCE initialized for: ' + editor.id);
      });
    }
  });
  tinyMCEInitialized = true;
}

// ============================================
// Editor Tab Switching
// ============================================
function switchEditorTab(tabName) {
  // Update tab buttons
  document.getElementById('tabEnglish').classList.remove('bg-blue-600', 'text-white');
  document.getElementById('tabEnglish').classList.add('bg-gray-200');
  document.getElementById('tabJapanese').classList.remove('bg-blue-600', 'text-white');
  document.getElementById('tabJapanese').classList.add('bg-gray-200');
  document.getElementById('tabPreview').classList.remove('bg-blue-600', 'text-white');
  document.getElementById('tabPreview').classList.add('bg-gray-200');
  
  // Update tab content visibility
  document.getElementById('englishContent').classList.add('hidden');
  document.getElementById('japaneseContent').classList.add('hidden');
  document.getElementById('previewContent').classList.add('hidden');
  
  if (tabName === 'english') {
    document.getElementById('tabEnglish').classList.remove('bg-gray-200');
    document.getElementById('tabEnglish').classList.add('bg-blue-600', 'text-white');
    document.getElementById('englishContent').classList.remove('hidden');
  } else if (tabName === 'japanese') {
    document.getElementById('tabJapanese').classList.remove('bg-gray-200');
    document.getElementById('tabJapanese').classList.add('bg-blue-600', 'text-white');
    document.getElementById('japaneseContent').classList.remove('hidden');
  } else if (tabName === 'preview') {
    document.getElementById('tabPreview').classList.remove('bg-gray-200');
    document.getElementById('tabPreview').classList.add('bg-blue-600', 'text-white');
    document.getElementById('previewContent').classList.remove('hidden');
    updatePreview();
  }
}

// ============================================
// HTML/Visual Mode Toggle
// ============================================
function toggleEditorMode(editorId) {
  const editor = tinymce.get(editorId);
  if (!editor) return;
  
  const button = document.getElementById(`switchToHtml${editorId === 'contentEn' ? 'En' : 'Ja'}`);
  
  if (currentEditorMode === 'visual') {
    // Switch to HTML mode
    const content = editor.getContent();
    editor.remove();
    document.getElementById(editorId).value = content;
    button.innerHTML = '<i class="fas fa-eye"></i> Visual';
    currentEditorMode = 'html';
  } else {
    // Switch to Visual mode
    const content = document.getElementById(editorId).value;
    
    tinymce.init({
      selector: `#${editorId}`,
      height: 500,
      menubar: true,
      plugins: [
        'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
        'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
        'insertdatetime', 'media', 'table', 'help', 'wordcount'
      ],
      toolbar: 'undo redo | formatselect | bold italic underline strikethrough | ' +
               'alignleft aligncenter alignright alignjustify | ' +
               'bullist numlist outdent indent | link image | ' +
               'forecolor backcolor | removeformat | code | help',
      content_style: 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; line-height: 1.6; }',
      branding: false,
      promotion: false,
      init_instance_callback: function(editor) {
        editor.setContent(content);
      }
    });
    button.innerHTML = '<i class="fas fa-code"></i> HTML';
    currentEditorMode = 'visual';
  }
}

// ============================================
// Preview Functionality
// ============================================
function updatePreview() {
  const titleEn = document.getElementById('titleEn').value;
  const titleJa = document.getElementById('titleJa').value;
  
  let contentEn, contentJa;
  if (tinymce.get('contentEn')) {
    contentEn = tinymce.get('contentEn').getContent();
  } else {
    contentEn = document.getElementById('contentEn').value;
  }
  
  if (tinymce.get('contentJa')) {
    contentJa = tinymce.get('contentJa').getContent();
  } else {
    contentJa = document.getElementById('contentJa').value;
  }
  
  const previewTitle = document.getElementById('previewTitle');
  const previewBody = document.getElementById('previewBody');
  
  if (currentPreviewLang === 'en') {
    previewTitle.textContent = titleEn || 'No title';
    previewBody.innerHTML = contentEn || '<p>No content available.</p>';
  } else {
    previewTitle.textContent = titleJa || 'タイトルなし';
    previewBody.innerHTML = contentJa || '<p>コンテンツがありません。</p>';
  }
}

function switchPreviewLang(lang) {
  currentPreviewLang = lang;
  
  document.getElementById('previewLangEn').classList.remove('bg-blue-600', 'text-white');
  document.getElementById('previewLangEn').classList.add('bg-gray-200');
  document.getElementById('previewLangJa').classList.remove('bg-blue-600', 'text-white');
  document.getElementById('previewLangJa').classList.add('bg-gray-200');
  
  if (lang === 'en') {
    document.getElementById('previewLangEn').classList.remove('bg-gray-200');
    document.getElementById('previewLangEn').classList.add('bg-blue-600', 'text-white');
  } else {
    document.getElementById('previewLangJa').classList.remove('bg-gray-200');
    document.getElementById('previewLangJa').classList.add('bg-blue-600', 'text-white');
  }
  
  updatePreview();
}

// ============================================
// Version History
// ============================================
async function loadVersionHistory(contentId) {
  try {
    const response = await axios.get(`/api/admin/content/${contentId}/versions`);
    const versions = response.data;
    renderVersionHistory(versions);
  } catch (error) {
    console.error('Failed to load version history:', error);
    // Don't show alert if table doesn't exist yet
    if (error.response && error.response.status !== 500) {
      alert('Failed to load version history');
    }
  }
}

function renderVersionHistory(versions) {
  const tbody = document.querySelector('#versionHistoryTable tbody');
  tbody.innerHTML = '';
  
  if (!versions || versions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="py-4 px-4 text-center" style="color: var(--text-secondary);">No version history available yet.</td></tr>';
    return;
  }
  
  versions.forEach(version => {
    const row = document.createElement('tr');
    row.style.borderBottom = '1px solid var(--border-color)';
    row.innerHTML = `
      <td class="py-3 px-4">v${version.version_number}</td>
      <td class="py-3 px-4 text-sm" style="color: var(--text-secondary);">
        ${new Date(version.created_at).toLocaleString()}
      </td>
      <td class="py-3 px-4 text-sm">${version.edited_by}</td>
      <td class="py-3 px-4">
        <button onclick="viewVersion(${version.id})" class="text-blue-600 hover:underline mr-3">
          <i class="fas fa-eye"></i> View
        </button>
        <button onclick="restoreVersion(${version.id})" class="text-green-600 hover:underline">
          <i class="fas fa-undo"></i> Restore
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function showVersionHistory() {
  document.getElementById('versionHistoryModal').classList.remove('hidden');
}

function closeVersionHistory() {
  document.getElementById('versionHistoryModal').classList.add('hidden');
}

async function viewVersion(versionId) {
  try {
    const response = await axios.get(`/api/admin/content/version/${versionId}`);
    const version = response.data;
    
    alert(`Version ${version.version_number}\n\n` +
          `EN Title: ${version.title_en}\n` +
          `JA Title: ${version.title_ja}\n\n` +
          `Created: ${new Date(version.created_at).toLocaleString()}`);
  } catch (error) {
    console.error('Failed to view version:', error);
    alert('Failed to load version details');
  }
}

async function restoreVersion(versionId) {
  if (!confirm('Are you sure you want to restore this version? Current content will be saved as a new version.')) {
    return;
  }
  
  try {
    const response = await axios.get(`/api/admin/content/version/${versionId}`);
    const version = response.data;
    
    // Update form fields
    document.getElementById('titleEn').value = version.title_en;
    document.getElementById('titleJa').value = version.title_ja;
    
    if (tinymce.get('contentEn')) {
      tinymce.get('contentEn').setContent(version.content_en || '');
    } else {
      document.getElementById('contentEn').value = version.content_en || '';
    }
    
    if (tinymce.get('contentJa')) {
      tinymce.get('contentJa').setContent(version.content_ja || '');
    } else {
      document.getElementById('contentJa').value = version.content_ja || '';
    }
    
    closeVersionHistory();
    alert('Version restored. Please save to apply changes.');
  } catch (error) {
    console.error('Failed to restore version:', error);
    alert('Failed to restore version');
  }
}

// ============================================
// Image Upload
// ============================================
function showImageUpload() {
  document.getElementById('imageUploadModal').classList.remove('hidden');
  document.getElementById('imageUrlInput').value = '';
}

function closeImageUpload() {
  document.getElementById('imageUploadModal').classList.add('hidden');
}

function insertImageUrl() {
  const url = document.getElementById('imageUrlInput').value.trim();
  if (!url) {
    alert('Please enter an image URL');
    return;
  }
  
  // Determine which editor is currently active
  const englishTab = !document.getElementById('englishContent').classList.contains('hidden');
  const editorId = englishTab ? 'contentEn' : 'contentJa';
  
  const editor = tinymce.get(editorId);
  if (editor) {
    editor.insertContent(`<img src="${url}" alt="Image" style="max-width: 100%; height: auto;" />`);
  }
  
  closeImageUpload();
}

// Content edit modal listeners
document.addEventListener('DOMContentLoaded', () => {
  // Modal close handlers
  document.getElementById('closeContentEdit')?.addEventListener('click', () => {
    if (tinymce.get('contentEn')) tinymce.get('contentEn').remove();
    if (tinymce.get('contentJa')) tinymce.get('contentJa').remove();
    tinyMCEInitialized = false;
    document.getElementById('contentEditModal').classList.add('hidden');
  });

  document.getElementById('cancelContentEdit')?.addEventListener('click', () => {
    if (tinymce.get('contentEn')) tinymce.get('contentEn').remove();
    if (tinymce.get('contentJa')) tinymce.get('contentJa').remove();
    tinyMCEInitialized = false;
    document.getElementById('contentEditModal').classList.add('hidden');
  });

  document.getElementById('saveContentEdit')?.addEventListener('click', saveContentPage);

  document.getElementById('contentEditModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'contentEditModal') {
      if (tinymce.get('contentEn')) tinymce.get('contentEn').remove();
      if (tinymce.get('contentJa')) tinymce.get('contentJa').remove();
      tinyMCEInitialized = false;
      document.getElementById('contentEditModal').classList.add('hidden');
    }
  });
  
  // Tab switching
  document.getElementById('tabEnglish')?.addEventListener('click', () => switchEditorTab('english'));
  document.getElementById('tabJapanese')?.addEventListener('click', () => switchEditorTab('japanese'));
  document.getElementById('tabPreview')?.addEventListener('click', () => switchEditorTab('preview'));
  
  // HTML/Visual toggle
  document.getElementById('switchToHtmlEn')?.addEventListener('click', () => toggleEditorMode('contentEn'));
  document.getElementById('switchToHtmlJa')?.addEventListener('click', () => toggleEditorMode('contentJa'));
  
  // Preview language switch
  document.getElementById('previewLangEn')?.addEventListener('click', () => switchPreviewLang('en'));
  document.getElementById('previewLangJa')?.addEventListener('click', () => switchPreviewLang('ja'));
  
  // Version history
  document.getElementById('showVersionHistory')?.addEventListener('click', showVersionHistory);
  document.getElementById('closeVersionHistory')?.addEventListener('click', closeVersionHistory);
  
  // Image upload
  document.getElementById('uploadImageEn')?.addEventListener('click', showImageUpload);
  document.getElementById('uploadImageJa')?.addEventListener('click', showImageUpload);
  document.getElementById('closeImageUpload')?.addEventListener('click', closeImageUpload);
  document.getElementById('insertImageUrl')?.addEventListener('click', insertImageUrl);
});

// Make functions available globally
window.editRegistrar = editRegistrar;
window.deleteRegistrar = deleteRegistrar;
window.editPricing = editPricing;
window.deletePricing = deletePricing;
window.editApiKey = editApiKey;
window.downloadMonthlyCSV = downloadMonthlyCSV;
window.editContentPage = editContentPage;
window.viewVersion = viewVersion;
window.restoreVersion = restoreVersion;
