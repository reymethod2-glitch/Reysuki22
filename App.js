// =============================================
// REY-AI — app.js (Main Logic)
// =============================================

// ---- AUTH ----
const ADMIN_USER = 'REYSUKI';
const ADMIN_PASS = 'REY12345678';

function isAdmin() { return localStorage.getItem('rey_admin') === '1'; }
function openLogin() {
  document.getElementById('loginOverlay')?.classList.remove('hidden');
  setTimeout(() => document.getElementById('adminPassword')?.focus(), 100);
}
function closeLogin() { document.getElementById('loginOverlay')?.classList.add('hidden'); }
function doAdminLogin() {
  const pw = document.getElementById('adminPassword')?.value || '';
  const err = document.getElementById('loginError');
  if (pw === ADMIN_PASS) {
    localStorage.setItem('rey_admin', '1');
    closeLogin();
    updateUserUI();
    // Reload to apply admin features
    window.location.reload();
  } else {
    err?.classList.remove('hidden');
    setTimeout(() => err?.classList.add('hidden'), 2000);
  }
}
function adminLogout() {
  localStorage.removeItem('rey_admin');
  updateUserUI();
  window.location.reload();
}
function handleUserBadgeClick() {
  if (isAdmin()) {
    if (confirm('Logout dari admin?')) adminLogout();
  } else {
    openLogin();
  }
}
function updateUserUI() {
  const admin = isAdmin();
  const nameEl = document.getElementById('userNameLabel');
  const roleEl = document.getElementById('userRoleLabel');
  const avatarEl = document.getElementById('userAvatarIcon');
  const adminBadge = document.getElementById('adminBadge');
  if (nameEl) nameEl.textContent = admin ? 'Admin' : 'Guest';
  if (roleEl) roleEl.textContent = admin ? 'Klik untuk logout' : 'Klik untuk login admin';
  if (avatarEl) avatarEl.textContent = admin ? '⚙️' : '👤';
  if (adminBadge) adminBadge.classList.toggle('hidden', !admin);
  // Show admin-only buttons
  document.querySelectorAll('.admin-only-btn').forEach(el => el.classList.toggle('hidden', !admin));
}

// ---- SIDEBAR ----
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const open = sidebar?.classList.contains('open');
  sidebar?.classList.toggle('open', !open);
  overlay?.classList.toggle('hidden', open);
}

// ---- CHAT HISTORY (per page, per user session — localStorage) ----
// Key: rey_history_<page>  (cleared on resetChat or page refresh if needed)
let currentPage = 'chatgpt';
let chatHistory = []; // [{role, content}]
let sessionId = null; // for ChatGPT sessions
let isLoading = false;

function getHistoryKey() { return `rey_history_${currentPage}`; }

function loadHistory() {
  try {
    const saved = localStorage.getItem(getHistoryKey());
    chatHistory = saved ? JSON.parse(saved) : [];
  } catch { chatHistory = []; }
}

function saveHistory() {
  try { localStorage.setItem(getHistoryKey(), JSON.stringify(chatHistory)); } catch {}
}

function resetChat() {
  if (!confirm('Reset chat? Semua percakapan akan dihapus.')) return;
  chatHistory = [];
  sessionId = null;
  saveHistory();
  const msgs = document.getElementById('messages');
  if (msgs) msgs.innerHTML = '';
  document.getElementById('welcomeScreen')?.classList.remove('hidden');
}

// ---- INIT ----
function initApp(page) {
  currentPage = page;
  updateUserUI();
  loadHistory();

  // Special page admin guard
  if (page === 'special') {
    const lockScreen = document.getElementById('adminLockScreen');
    if (!isAdmin() && lockScreen) {
      lockScreen.classList.remove('hidden');
      document.getElementById('appContainer').style.visibility = 'hidden';
      return;
    }
    loadSpecialSettings();
    document.getElementById('settingsBtn')?.classList.toggle('hidden', !isAdmin());
  }

  // Restore chat history
  if (chatHistory.length > 0) {
    document.getElementById('welcomeScreen')?.classList.add('hidden');
    chatHistory.forEach(msg => renderMessage(msg.role === 'user' ? 'user' : 'ai', msg.content, false));
  }

  // Listen Enter in login
  document.getElementById('adminPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doAdminLogin();
  });
}

// ---- SEND MESSAGE ----
async function sendMessage() {
  const input = document.getElementById('userInput');
  const text = input?.value.trim();
  if (!text || isLoading) return;
  input.value = '';
  autoResize(input);
  doSend(text);
}

function sendSuggestion(text) {
  const input = document.getElementById('userInput');
  if (input) input.value = text;
  sendMessage();
}

async function doSend(text) {
  if (isLoading) return;
  isLoading = true;
  document.getElementById('welcomeScreen')?.classList.add('hidden');
  renderMessage('user', text, true);
  chatHistory.push({ role: 'user', content: text });
  saveHistory();

  const typingId = showTyping();
  setSendDisabled(true);

  try {
    let aiResponse = '';
    if (currentPage === 'chatgpt') aiResponse = await fetchChatGPT(text);
    else if (currentPage === 'gemini') aiResponse = await fetchGemini(text);
    else if (currentPage === 'special') aiResponse = await fetchSpecial(text);
    else aiResponse = 'Halaman ini tidak punya AI chat.';

    removeTyping(typingId);
    renderMessage('ai', aiResponse, true);
    chatHistory.push({ role: 'assistant', content: aiResponse });
    saveHistory();
  } catch(e) {
    removeTyping(typingId);
    renderMessage('ai', `❌ Terjadi kesalahan: ${e.message || 'Coba lagi'}`, true);
  }
  isLoading = false;
  setSendDisabled(false);
  document.getElementById('userInput')?.focus();
}

// ---- API CALLS ----
async function fetchChatGPT(prompt) {
  // Build context prompt with history
  let fullPrompt = prompt;
  if (chatHistory.length > 1) {
    const ctx = chatHistory.slice(-8, -1).map(m =>
      `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n');
    fullPrompt = `Riwayat percakapan:\n${ctx}\n\nUser: ${prompt}`;
  }
  const url = `https://v2.api-varhad.my.id/ai/chatgpt?prompt=${encodeURIComponent(fullPrompt)}`;
  const res = await fetch(url);
  const data = await res.json();
  // Parse various response formats
  const text = data?.result?.text || data?.result || data?.text || data?.message || data?.response;
  if (!text) throw new Error('Respons kosong dari API');
  return typeof text === 'string' ? text : JSON.stringify(text);
}

async function fetchGemini(prompt) {
  let fullPrompt = prompt;
  if (chatHistory.length > 1) {
    const ctx = chatHistory.slice(-8, -1).map(m =>
      `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n');
    fullPrompt = `Riwayat percakapan:\n${ctx}\n\nUser: ${prompt}`;
  }
  const url = `https://v2.api-varhad.my.id/ai/gemini?prompt=${encodeURIComponent(fullPrompt)}`;
  const res = await fetch(url);
  const data = await res.json();
  // Fix [object Object] issue — properly extract text
  let text = data?.result?.text
    || data?.result?.candidates?.[0]?.content?.parts?.[0]?.text
    || data?.result?.candidates?.[0]?.content?.text
    || data?.result
    || data?.text
    || data?.candidates?.[0]?.content?.parts?.[0]?.text
    || data?.response
    || data?.message;
  if (text === null || text === undefined) throw new Error('Respons kosong dari Gemini API');
  // If it's an object, serialize it
  if (typeof text === 'object') text = JSON.stringify(text, null, 2);
  return String(text);
}

async function fetchSpecial(prompt) {
  const settings = getSpecialSettings();
  let systemCtx = settings.systemPrompt
    ? `[Instruksi AI: ${settings.systemPrompt}]\n\n`
    : '';
  let fullPrompt = systemCtx;
  if (chatHistory.length > 1) {
    const ctx = chatHistory.slice(-8, -1).map(m =>
      `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n');
    fullPrompt += `Riwayat:\n${ctx}\n\n`;
  }
  fullPrompt += `User: ${prompt}`;
  const url = `https://v2.api-varhad.my.id/ai/gemini?prompt=${encodeURIComponent(fullPrompt)}`;
  const res = await fetch(url);
  const data = await res.json();
  let text = data?.result?.text
    || data?.result?.candidates?.[0]?.content?.parts?.[0]?.text
    || data?.result
    || data?.text
    || data?.response;
  if (text === null || text === undefined) throw new Error('Respons kosong dari API');
  if (typeof text === 'object') text = JSON.stringify(text, null, 2);
  return String(text);
}

// ---- RENDER MESSAGE ----
function renderMessage(role, content, animate) {
  const msgs = document.getElementById('messages');
  if (!msgs) return;
  const wrap = document.createElement('div');
  wrap.className = `msg-wrap ${role}${animate ? ' msg-in' : ''}`;

  const bubble = document.createElement('div');
  bubble.className = `bubble ${role}`;

  // Format content — markdown-ish
  bubble.innerHTML = formatMessage(content);

  if (role === 'ai') {
    // Add copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.title = 'Salin';
    copyBtn.innerHTML = '⎘';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(content).then(() => {
        copyBtn.innerHTML = '✓';
        setTimeout(() => copyBtn.innerHTML = '⎘', 1500);
      });
    };
    wrap.appendChild(copyBtn);
  }

  wrap.appendChild(bubble);
  msgs.appendChild(wrap);
  scrollToBottom();

  // Highlight code blocks
  wrap.querySelectorAll('pre code').forEach(el => highlightCode(el));
}

function formatMessage(text) {
  if (!text) return '';
  // Escape HTML
  let s = text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // Code blocks
  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<pre class="code-block"><div class="code-header"><span class="code-lang">${lang||'code'}</span><button class="code-copy" onclick="copyCode(this)">Salin</button></div><code>${code.trim()}</code></pre>`);
  // Inline code
  s = s.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  // Bold
  s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic
  s = s.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Headers
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^## (.+)$/gm, '<h2>$2</h2>'.replace('$2','$1'));
  s = s.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // Lists
  s = s.replace(/^[*\-] (.+)$/gm, '<li>$1</li>');
  s = s.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
  // Numbered lists
  s = s.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  // Newlines to <br> but not inside pre
  s = s.split(/<pre[\s\S]*?<\/pre>/).map((part, i, arr) => {
    if (i < arr.length - 1) {
      const pre = s.match(/<pre[\s\S]*?<\/pre>/g)?.[i] || '';
      return part.replace(/\n/g,'<br>') + pre;
    }
    return part.replace(/\n/g,'<br>');
  }).join('');
  return s;
}

function highlightCode(el) {
  // Simple keyword highlighting
  const keywords = ['function','return','const','let','var','if','else','for','while','class','import','export','from','async','await','def','print','true','false','null','undefined'];
  let html = el.innerHTML;
  keywords.forEach(kw => {
    html = html.replace(new RegExp(`\\b(${kw})\\b`, 'g'), `<span class="kw">${kw}</span>`);
  });
  // Strings
  html = html.replace(/(&quot;|&#39;)(.*?)(\1)/g, '<span class="str">$1$2$3</span>');
  // Comments
  html = html.replace(/(\/\/[^\n]*)/g, '<span class="cmt">$1</span>');
  el.innerHTML = html;
}

function copyCode(btn) {
  const code = btn.closest('pre')?.querySelector('code')?.innerText || '';
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = '✓ Disalin';
    setTimeout(() => btn.textContent = 'Salin', 2000);
  });
}

// ---- TYPING INDICATOR ----
let typingCounter = 0;
function showTyping() {
  const id = `typing-${++typingCounter}`;
  const msgs = document.getElementById('messages');
  if (!msgs) return id;
  const wrap = document.createElement('div');
  wrap.className = 'msg-wrap ai msg-in';
  wrap.id = id;
  wrap.innerHTML = `<div class="bubble ai typing-bubble"><span></span><span></span><span></span></div>`;
  msgs.appendChild(wrap);
  scrollToBottom();
  return id;
}
function removeTyping(id) {
  document.getElementById(id)?.remove();
}

// ---- HELPERS ----
function scrollToBottom() {
  const area = document.getElementById('chatArea');
  if (area) area.scrollTop = area.scrollHeight;
}
function setSendDisabled(v) {
  const btn = document.getElementById('sendBtn');
  const inp = document.getElementById('userInput');
  if (btn) btn.disabled = v;
  if (inp) inp.disabled = v;
}
function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

// ---- SPECIAL AI SETTINGS ----
function getSpecialSettings() {
  try {
    return JSON.parse(localStorage.getItem('rey_special_settings') || '{}');
  } catch { return {}; }
}
function saveSpecialSettingsData(data) {
  localStorage.setItem('rey_special_settings', JSON.stringify(data));
}

function loadSpecialSettings() {
  const s = getSpecialSettings();
  if (s.aiName) {
    const el = document.getElementById('topbarAiName');
    if (el) el.innerHTML = `${s.aiName} <span class="model-badge special-badge">Custom</span>`;
    const wel = document.getElementById('welcomeAiName');
    if (wel) wel.textContent = s.aiName;
  }
  if (s.avatar) {
    const top = document.getElementById('topbarAvatar');
    if (top) { top.innerHTML = `<img src="${s.avatar}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`; }
    const welAvt = document.getElementById('welcomeAvatarText');
    if (welAvt) { welAvt.innerHTML = `<img src="${s.avatar}" alt="" style="width:60px;height:60px;object-fit:cover;border-radius:50%">`; }
  }
  if (s.themeColor) {
    document.documentElement.style.setProperty('--special-color', s.themeColor);
    document.documentElement.style.setProperty('--special-light', s.themeLight || '#EDE9FE');
  }
  applyBg(s.bg, s.bgImage);
}

function openSettings() {
  const s = getSpecialSettings();
  if (document.getElementById('aiNameInput')) document.getElementById('aiNameInput').value = s.aiName || 'REY Special';
  if (document.getElementById('systemPromptInput')) document.getElementById('systemPromptInput').value = s.systemPrompt || '';
  if (s.avatar && document.getElementById('aiAvatarPreview')) {
    document.getElementById('aiAvatarPreview').src = s.avatar;
    document.getElementById('aiAvatarPreview').classList.remove('hidden');
    document.getElementById('uploadPlaceholder')?.classList.add('hidden');
  }
  document.getElementById('settingsPanel')?.classList.remove('hidden');
  document.getElementById('settingsOverlay')?.classList.remove('hidden');
}
function closeSettings() {
  document.getElementById('settingsPanel')?.classList.add('hidden');
  document.getElementById('settingsOverlay')?.classList.add('hidden');
}

function handleAvatarUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const preview = document.getElementById('aiAvatarPreview');
    if (preview) { preview.src = ev.target.result; preview.classList.remove('hidden'); }
    document.getElementById('uploadPlaceholder')?.classList.add('hidden');
  };
  reader.readAsDataURL(file);
}

function handleBgUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const s = getSpecialSettings();
    s.bgImage = ev.target.result;
    s.bg = 'custom';
    saveSpecialSettingsData(s);
    applyBg('custom', ev.target.result);
  };
  reader.readAsDataURL(file);
}

function setThemeColor(color, light) {
  document.documentElement.style.setProperty('--special-color', color);
  document.documentElement.style.setProperty('--special-light', light);
  const s = getSpecialSettings(); s.themeColor = color; s.themeLight = light;
  saveSpecialSettingsData(s);
}

function setBg(type) {
  document.querySelectorAll('.bg-opt').forEach(el => el.classList.remove('active'));
  event?.target?.classList.add('active');
  const s = getSpecialSettings(); s.bg = type;
  saveSpecialSettingsData(s);
  applyBg(type, s.bgImage);
}

function applyBg(type, bgImage) {
  const area = document.getElementById('chatArea');
  if (!area) return;
  area.style.backgroundImage = '';
  area.className = area.className.replace(/\bbg-\w+\b/g, '').trim();
  if (type === 'custom' && bgImage) {
    area.style.backgroundImage = `url(${bgImage})`;
    area.style.backgroundSize = 'cover';
    area.style.backgroundPosition = 'center';
  } else if (type && type !== 'default') {
    area.classList.add(`bg-${type}`);
  }
}

function saveSettings() {
  const aiName = document.getElementById('aiNameInput')?.value.trim() || 'REY Special';
  const systemPrompt = document.getElementById('systemPromptInput')?.value.trim() || '';
  const avatarSrc = document.getElementById('aiAvatarPreview')?.src || '';
  const s = getSpecialSettings();
  s.aiName = aiName;
  s.systemPrompt = systemPrompt;
  if (avatarSrc && !avatarSrc.endsWith('undefined')) s.avatar = avatarSrc;
  saveSpecialSettingsData(s);
  closeSettings();
  loadSpecialSettings();
  // Show toast
  showToast('✅ Pengaturan disimpan!');
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
}

// Enter in password field
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('adminPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doAdminLogin();
  });
});
