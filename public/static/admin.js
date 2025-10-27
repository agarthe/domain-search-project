// Admin panel JavaScript

// ============================================
// State Management
// ============================================
let currentTheme = localStorage.getItem('theme') || 'light';
let registrarsData = [];
let pricingData = [];

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
    renderPricing();
  } catch (error) {
    console.error('Failed to load pricing:', error);
    alert('Failed to load pricing');
  }
}

function renderPricing() {
  const tbody = document.querySelector('#pricingTable tbody');
  tbody.innerHTML = '';

  pricingData.forEach(price => {
    const row = document.createElement('tr');
    row.style.borderBottom = '1px solid var(--border-color)';
    row.innerHTML = `
      <td class="py-3 px-4">${price.registrar_name}</td>
      <td class="py-3 px-4">${price.tld}</td>
      <td class="py-3 px-4">${price.price}</td>
      <td class="py-3 px-4">${price.renewal_price || 'N/A'}</td>
      <td class="py-3 px-4">${price.transfer_price || 'N/A'}</td>
      <td class="py-3 px-4">${price.currency}</td>
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
// Bulk Import Management
// ============================================
function showBulkImportPanel() {
  document.getElementById('bulkImportPanel').classList.remove('hidden');
  document.getElementById('addPricingBtn').disabled = true;
  document.getElementById('bulkImportBtn').disabled = true;
}

function hideBulkImportPanel() {
  document.getElementById('bulkImportPanel').classList.add('hidden');
  document.getElementById('bulkImportData').value = '';
  document.getElementById('addPricingBtn').disabled = false;
  document.getElementById('bulkImportBtn').disabled = false;
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
// Event Listeners
// ============================================
document.addEventListener('DOMContentLoaded', () => {
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
      }
    });
  });

  // Add buttons
  document.getElementById('addRegistrarBtn').addEventListener('click', addRegistrar);
  document.getElementById('addPricingBtn').addEventListener('click', addPricing);
  
  // Settings buttons
  const saveBrokerLinkBtn = document.getElementById('saveBrokerLinkBtn');
  if (saveBrokerLinkBtn) {
    saveBrokerLinkBtn.addEventListener('click', saveBrokerLink);
  }
  
  // Bulk import buttons
  document.getElementById('bulkImportBtn').addEventListener('click', showBulkImportPanel);
  document.getElementById('importExecuteBtn').addEventListener('click', executeBulkImport);
  document.getElementById('importCancelBtn').addEventListener('click', hideBulkImportPanel);

  // Load initial data
  loadRegistrars();
});

// Make functions available globally
window.editRegistrar = editRegistrar;
window.deleteRegistrar = deleteRegistrar;
window.editPricing = editPricing;
window.deletePricing = deletePricing;
window.editApiKey = editApiKey;
