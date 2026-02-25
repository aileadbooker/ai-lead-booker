// Authentication Check
fetch('/api/me').then(res => {
    if (res.status === 401) window.location.href = '/';
}).catch(() => { });

// Global Functions for HTML onclicks
window.handleLogout = async function () {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        console.error('Logout failed:', error);
    }
};

window.openAddLeadModal = function () {
    document.getElementById('add-lead-modal').style.display = 'flex';
};

window.closeAddLeadModal = function () {
    document.getElementById('add-lead-modal').style.display = 'none';
};

window.submitNewLead = async function () {
    const name = document.getElementById('new-lead-name').value;
    const email = document.getElementById('new-lead-email').value;
    const company = document.getElementById('new-lead-company').value;

    if (!email) {
        alert('Email is required');
        return;
    }

    try {
        const res = await fetch('/api/leads', { // Changed from /api/leads/manual
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, company })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to create');
        }

        alert('Lead added successfully!');
        window.closeAddLeadModal();
        loadLeads(); // Refresh list

        // Clear form
        document.getElementById('new-lead-name').value = '';
        document.getElementById('new-lead-email').value = '';
        document.getElementById('new-lead-company').value = '';

    } catch (error) {
        alert(error.message);
    }
};

// Tab Switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;

        // Update active states
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(`${tab}-tab`).classList.add('active');

        // Load tab data
        loadTabData(tab);
    });
});

// Load data for specific tab
function loadTabData(tab) {
    switch (tab) {
        case 'leads':
            loadLeads();
            break;
        case 'analytics':
            loadAnalytics();
            break;
        case 'summary':
            loadSummary();
            break;
        case 'campaigns':
            loadCampaigns();
            break;
    }
}

// LEADS TAB
async function loadLeads() {
    try {
        const search = document.getElementById('lead-search').value;
        const status = document.getElementById('lead-status-filter').value;
        const sort = document.getElementById('lead-sort').value;

        const params = new URLSearchParams({ search, status, sort });
        const res = await fetch(`/api/leads?${params.toString()}`);
        const leads = await res.json();

        document.getElementById('leads-spinner').style.display = 'none';
        document.getElementById('leads-container').style.display = 'block';

        const tbody = document.getElementById('leads-tbody');
        tbody.innerHTML = '';

        leads.forEach(lead => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${lead.email}</td>
                <td>${lead.name || '—'}</td>
                <td>${getStatusBadge(lead.status)}</td>
                <td>${formatDate(lead.last_contact_at)}</td>
                <td><button class="btn-secondary btn" onclick="viewLead('${lead.id}')">View</button></td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Failed to load leads:', error);
    }
}

function getStatusBadge(status) {
    const badges = {
        'new': '<span class="badge badge-info">New</span>',
        'qualifying': '<span class="badge badge-info">Qualifying</span>',
        'ready_to_book': '<span class="badge badge-success">Ready to Book</span>',
        'booked': '<span class="badge badge-success">Booked</span>',
        'closed': '<span class="badge badge-warning">Closed</span>',
        'disqualified': '<span class="badge badge-danger">Disqualified</span>'
    };
    return badges[status] || status;
}

function formatDate(isoString) {
    if (!isoString) return '—';
    const date = new Date(isoString);
    return date.toLocaleString();
}

function viewLead(id) {
    window.location.href = `/lead.html?id=${id}`;
}

// ANALYTICS TAB
let funnelChart = null;
let timelineChart = null;

async function loadAnalytics() {
    try {
        // Fetch Today and All stats in parallel
        const [resToday, resAll] = await Promise.all([
            fetch('/api/analytics?period=today'),
            fetch('/api/analytics?period=all')
        ]);

        const dataToday = await resToday.json();
        const dataAll = await resAll.json();

        // Update metrics (Today / Total)
        document.getElementById('metric-sent').textContent =
            `${dataToday.summary.email_sent || 0} / ${dataAll.summary.email_sent || 0}`;

        document.getElementById('metric-replies').textContent = dataAll.summary.reply_received || 0;

        document.getElementById('metric-interested').textContent = dataAll.summary.interested || 0;

        document.getElementById('metric-booked').textContent = dataAll.summary.booked || 0;

        // Render charts using "All Time" data for context
        renderFunnelChart(dataAll.funnel);
        renderTimelineChart(dataAll.timeline);

    } catch (error) {
        console.error('Failed to load analytics:', error);
    }
}

function renderFunnelChart(funnel) {
    const ctx = document.getElementById('funnel-chart').getContext('2d');

    if (funnelChart) {
        funnelChart.destroy();
    }

    funnelChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Sent', 'Replied', 'Interested', 'Booked'],
            datasets: [{
                label: 'Conversion Funnel',
                data: [funnel.sent, funnel.replied, funnel.interested, funnel.booked],
                backgroundColor: [
                    'rgba(99, 102, 241, 0.8)',
                    'rgba(139, 92, 246, 0.8)',
                    'rgba(16, 185, 129, 0.8)',
                    'rgba(245, 158, 11, 0.8)'
                ],
                borderColor: [
                    'rgba(99, 102, 241, 1)',
                    'rgba(139, 92, 246, 1)',
                    'rgba(16, 185, 129, 1)',
                    'rgba(245, 158, 11, 1)'
                ],
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#cbd5e1' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                x: {
                    ticks: { color: '#cbd5e1' },
                    grid: { display: false }
                }
            }
        }
    });
}

function renderTimelineChart(timeline) {
    const ctx = document.getElementById('timeline-chart').getContext('2d');

    if (timelineChart) {
        timelineChart.destroy();
    }

    // Convert timeline object to arrays
    const dates = Object.keys(timeline).sort();
    const sentData = dates.map(d => timeline[d].email_sent || 0);
    const repliesData = dates.map(d => timeline[d].reply_received || 0);

    timelineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(d => new Date(d).toLocaleDateString()),
            datasets: [
                {
                    label: 'Emails Sent',
                    data: sentData,
                    borderColor: 'rgba(99, 102, 241, 1)',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Replies',
                    data: repliesData,
                    borderColor: 'rgba(16, 185, 129, 1)',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#cbd5e1' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#cbd5e1' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                x: {
                    ticks: { color: '#cbd5e1' },
                    grid: { display: false }
                }
            }
        }
    });
}

// SUMMARY TAB
async function loadSummary() {
    try {
        const res = await fetch('/api/summary?period=today');
        const data = await res.json();

        // Update summary metrics
        document.getElementById('summary-sent').textContent = data.summary.email_sent || 0;
        document.getElementById('summary-replies').textContent = data.summary.reply_received || 0;
        document.getElementById('summary-rate').textContent = `${data.summary.response_rate || 0}%`;
        document.getElementById('summary-booked').textContent = data.summary.booked || 0;

        // Update hot leads table
        const tbody = document.getElementById('hot-leads-tbody');
        tbody.innerHTML = '';

        if (data.hotLeads && data.hotLeads.length > 0) {
            data.hotLeads.forEach(lead => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${lead.email}</td>
                    <td>${lead.name || '—'}</td>
                    <td>${getStatusBadge(lead.status)}</td>
                    <td><span class="badge badge-success">${lead.event_count} events</span></td>
                `;
                tbody.appendChild(row);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">No hot leads yet</td></tr>';
        }

    } catch (error) {
        console.error('Failed to load summary:', error);
    }
}

// SETTINGS TAB - PITCH EDITOR
async function loadPitch() {
    try {
        const res = await fetch('/api/pitch');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const pitch = await res.json();

        document.getElementById('pitch-initial').value = pitch.initial_pitch;
        document.getElementById('pitch-yes').value = pitch.yes_response;
        document.getElementById('pitch-no').value = pitch.no_response;
    } catch (error) {
        console.error('Failed to load pitch:', error);
    }
}


function showPitchStatus(msg, type) {
    const status = document.getElementById('pitch-status');
    status.textContent = msg;
    status.className = `status-message ${type}`;
    status.style.display = 'block';
    setTimeout(() => {
        status.style.display = 'none';
    }, 3000);
}

// CAMPAIGNS TAB
let campaignInterval = null;
let isCampaignRunning = false;

async function loadCampaigns() {
    try {
        const res = await fetch('/api/campaigns/stats');
        const stats = await res.json();
        updateCampaignUI(stats);
    } catch (error) {
        console.error('Failed to load campaign stats:', error);
    }
}

function updateCampaignUI(stats) {
    document.getElementById('camp-sent').textContent = stats.sentToday || 0;
    document.getElementById('camp-generated').textContent = stats.generatedCount || 0;

    isCampaignRunning = stats.active;
    const btn = document.getElementById('campaign-btn');
    const status = document.getElementById('campaign-status');
    const statusVal = document.getElementById('camp-status');

    if (isCampaignRunning) {
        btn.innerHTML = '⏹️ STOP CAMPAIGN';
        btn.style.background = '#ef4444'; // Red
        status.textContent = 'Running';
        status.style.color = '#4ade80';
        statusVal.textContent = 'Active';

        // Disable inputs
        document.getElementById('campaign-niche').disabled = true;
        document.getElementById('campaign-limit').disabled = true;

        if (!campaignInterval) {
            logConsole('Reconnected to active campaign session...');
            startPollingStats();
        }
    } else {
        btn.innerHTML = '▶️ START CAMPAIGN';
        btn.style.background = 'var(--primary)';
        status.textContent = 'Stopped';
        status.style.color = 'var(--text-muted)';
        statusVal.textContent = 'Idle';

        // Enable inputs
        document.getElementById('campaign-niche').disabled = false;
        document.getElementById('campaign-limit').disabled = false;

        stopPollingStats();
    }
}

document.getElementById('campaign-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('campaign-btn');

    if (isCampaignRunning) {
        // STOP
        try {
            const res = await fetch('/api/campaigns/stop', { method: 'POST' });
            const data = await res.json();

            logConsole('🛑 Campaign stopped by user.');
            updateCampaignUI(data.stats);
        } catch (error) {
            logConsole('❌ Error stopping campaign: ' + error.message);
        }
    } else {
        // START
        const niche = document.getElementById('campaign-niche').value;
        const limit = document.getElementById('campaign-limit').value;

        if (!niche) {
            alert('Please enter a target niche');
            return;
        }

        try {
            btn.innerHTML = '⏳ Starting...';
            logConsole(`🚀 Initializing campaign for "${niche}"...`);

            const res = await fetch('/api/campaigns/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ niche, dailyLimit: limit })
            });

            if (!res.ok) throw new Error('Failed to start');

            const data = await res.json();
            logConsole('✅ Campaign started successfully!');
            logConsole(`🎯 Target: ${niche}`);
            logConsole(`📊 Daily Limit: ${limit}`);

            updateCampaignUI(data.stats);
            startPollingStats();

        } catch (error) {
            console.error(error);
            logConsole('❌ Failed to start campaign: ' + error.message);
            btn.innerHTML = '▶️ START CAMPAIGN';
        }
    }
});

function logConsole(msg) {
    const consoleDiv = document.getElementById('campaign-console');
    const time = new Date().toLocaleTimeString();
    consoleDiv.innerHTML += `<div><span style="opacity:0.5">[${time}]</span> ${msg}</div>`;
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
}

function startPollingStats() {
    if (campaignInterval) clearInterval(campaignInterval);
    campaignInterval = setInterval(loadCampaigns, 5000);
}

function stopPollingStats() {
    if (campaignInterval) {
        clearInterval(campaignInterval);
        campaignInterval = null;
    }
}

async function resetPitch() {
    if (!confirm('Reset to AI-recommended defaults? Your custom pitch will be replaced.')) {
        return;
    }

    try {
        const res = await fetch('/api/pitch/reset', { method: 'POST' });

        if (res.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`HTTP ${res.status}: ${txt}`);
        }

        const data = await res.json();

        // Update form fields
        document.getElementById('pitch-initial').value = data.pitch.initial_pitch;
        document.getElementById('pitch-yes').value = data.pitch.yes_response;
        document.getElementById('pitch-no').value = data.pitch.no_response;

        showPitchStatus('✅ Reset to AI-recommended defaults!', 'success');
    } catch (error) {
        console.error('Failed to reset pitch:', error);
        showPitchStatus('❌ Failed to reset pitch. Please try again.', 'error');
    }
}

function showPitchStatus(message, type) {
    const statusEl = document.getElementById('pitch-status');
    statusEl.textContent = message;
    statusEl.style.display = 'block';
    statusEl.style.background = type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
    statusEl.style.color = type === 'success' ? '#10b981' : '#ef4444';

    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 5000);
}

function exportData() {
    alert('Export feature coming soon! 📥');
    // TODO: Implement CSV export
}

function clearData() {
    if (confirm('Are you sure you want to clear old leads? This cannot be undone.')) {
        alert('Clear data feature coming soon! 🗑️');
        // TODO: Implement data clearing
    }
}



// Add CSS for pulsing animation
const style = document.createElement('style');
style.innerHTML = `
@keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
}
.pulsing {
    animation: pulse 2s infinite;
}
`;
document.head.appendChild(style);

// Initial load
loadLeads();
setInterval(loadLeads, 30000); // Auto-refresh leads every 30s
loadPitch();
loadEmailConfig();

async function savePitch() {
    const initial_pitch = document.getElementById('pitch-initial').value;
    const yes_response = document.getElementById('pitch-yes').value;
    const no_response = document.getElementById('pitch-no').value;

    try {
        const res = await fetch('/api/pitch', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                initial_pitch,
                yes_response,
                no_response,
            })
        });

        if (res.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        if (!res.ok) {
            const txt = await res.text();
            throw new Error(txt);
        }

        showPitchStatus('✅ Pitch settings saved!', 'success');
    } catch (error) {
        console.error('Failed to save pitch:', error);
        showPitchStatus('❌ Failed to save. ' + error.message, 'error');
    }
}

// EMAIL CONFIGURATION
async function loadEmailConfig() {
    try {
        const res = await fetch('/api/settings/email-config');
        const data = await res.json();
        updateEmailConfigUI(data.configured);
    } catch (error) {
        console.error('Failed to load email config:', error);
    }
}

async function saveEmailConfig() {
    const btn = document.querySelector('button[onclick="saveEmailConfig()"]');
    const originalText = btn.innerText;

    // Explicitly pair the App Password with the EXACT Google email
    const email = document.getElementById('google-email').value;
    const password = document.getElementById('app-password').value;

    if (!email || !email.includes('@')) {
        alert('Please enter your Google Account Email');
        return;
    }
    if (!password) {
        alert('Please enter your 16-letter App Password');
        return;
    }

    try {
        btn.innerText = 'Connecting...';
        btn.disabled = true;

        const res = await fetch('/api/settings/email-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                googleEmail: email.trim(),
                appPassword: password.replace(/\s+/g, '') // Strip spaces automatically
            })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Failed to save');
        }

        document.getElementById('app-password').value = '';
        updateEmailConfigUI(true);
        alert('✅ Email connected successfully!');

    } catch (error) {
        console.error(error);
        alert(`❌ ${error.message}`);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

function updateEmailConfigUI(isConfigured) {
    const statusEl = document.getElementById('email-config-status');
    if (isConfigured) {
        statusEl.innerHTML = '✅ Status: <span style="color: #4ade80">Connected</span>';
    } else {
        statusEl.innerHTML = '⚠️ Status: <span style="color: #fbbf24">Not Connected</span>';
    }
}

// Lead Filter Listeners
document.getElementById('lead-search').addEventListener('input', debounce(loadLeads, 300));
document.getElementById('lead-status-filter').addEventListener('change', loadLeads);
document.getElementById('lead-sort').addEventListener('change', loadLeads);

// Utility: Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}



// Translations
const translations = {
    en: {
        app_title: "🤖 AI Lead Booker",
        app_subtitle: "Intelligent lead qualification and booking automation",
        sign_out: "Sign Out 🚪",
        settings_title: "⚙️ App Settings",
        language_label: "Language 🌐",
        billing_label: "Subscription 💳",
        manage_billing: "Manage Plan",
        billing_desc: "Manage your subscription, payment methods, and invoices.",
        help_label: "Help & Support 🎓",
        rewatch_onboarding: "Re-watch Onboarding",
        pitch_config_title: "📧 Pitch Configuration",
        pitch_config_desc: "Customize your sales pitch flow. Use {{name}} for lead's name.",
        pitch_initial_label: "1. Initial Pitch (First email)",
        pitch_yes_label: "✅ Yes Response",
        pitch_no_label: "❌ No Response (Reconvince)",
        pitch_yes2_label: "✅ Yes 2 Response",
        pitch_no2_label: "❌ No 2 Response (Close)",
        save_pitch: "💾 Save Custom Pitch",
        reset_pitch: "🔄 Reset to AI Recommended"
    },
    zh: {
        app_title: "🤖 AI 销售助手",
        app_subtitle: "智能潜在客户资格和预约自动化",
        sign_out: "退出 🚪",
        settings_title: "⚙️ 应用设置",
        language_label: "语言 🌐",
        billing_label: "订阅 💳",
        manage_billing: "管理计划",
        billing_desc: "管理您的订阅、付款方式和发票。",
        help_label: "帮助与支持 🎓",
        rewatch_onboarding: "重看入职视频",
        pitch_config_title: "📧 话术配置",
        pitch_config_desc: "自定义您的销售话术流程。使用 {{name}} 代表客户姓名。",
        pitch_initial_label: "1. 初始邮件 (第一封)",
        pitch_yes_label: "✅ 肯定回复",
        pitch_no_label: "❌ 否定回复 (挽回)",
        pitch_yes2_label: "✅ 二次肯定",
        pitch_no2_label: "❌ 二次否定 (关闭)",
        save_pitch: "💾 保存自定义话术",
        reset_pitch: "🔄 重置为 AI 推荐"
    },
    es: {
        app_title: "🤖 AI Lead Booker",
        app_subtitle: "Automatización inteligente de reservas y calificación de leads",
        sign_out: "Cerrar Sesión 🚪",
        settings_title: "⚙️ Configuración",
        language_label: "Idioma 🌐",
        billing_label: "Suscripción 💳",
        manage_billing: "Gestionar Plan",
        billing_desc: "Gestione su suscripción y métodos de pago.",
        help_label: "Ayuda y Soporte 🎓",
        rewatch_onboarding: "Ver Tutorial de Nuevo",
        pitch_config_title: "📧 Configuración de Pitch",
        pitch_config_desc: "Personalice su flujo de ventas. Use {{name}} para el nombre.",
        pitch_initial_label: "1. Pitch Inicial",
        pitch_yes_label: "✅ Respuesta Sí",
        pitch_no_label: "❌ Respuesta No (Convencer)",
        pitch_yes2_label: "✅ Respuesta Sí 2",
        pitch_no2_label: "❌ Respuesta No 2 (Cerrar)",
        save_pitch: "💾 Guardar Pitch",
        reset_pitch: "🔄 Restablecer a AI"
    },
    hi: {
        app_title: "🤖 AI लीड बुकर",
        app_subtitle: "बुद्धिमान लीड योग्यता और बुकिंग स्वचालन",
        sign_out: "साइन आउट 🚪",
        settings_title: "⚙️ ऐप सेटिंग्स",
        language_label: "भाषा 🌐",
        billing_label: "सदस्यता 💳",
        manage_billing: "योजना प्रबंधित करें",
        billing_desc: "अपनी सदस्यता और भुगतान विधियों का प्रबंधन करें।",
        help_label: "सहायता और समर्थन 🎓",
        rewatch_onboarding: "ऑनबोर्डिंग फिर से देखें",
        pitch_config_title: "📧 पिच कॉन्फ़िगरेशन",
        pitch_config_desc: "अपने बिक्री पिच प्रवाह को अनुकूलित करें। नाम के लिए {{name}} का उपयोग करें।",
        pitch_initial_label: "1. प्रारंभिक पिच",
        pitch_yes_label: "✅ हां प्रतिक्रिया",
        pitch_no_label: "❌ नहीं प्रतिक्रिया",
        pitch_yes2_label: "✅ हां 2 प्रतिक्रिया",
        pitch_no2_label: "❌ नहीं 2 प्रतिक्रिया",
        save_pitch: "💾 पिच सहेजें",
        reset_pitch: "🔄 AI को रीसेट करें"
    },
    fr: {
        app_title: "🤖 AI Lead Booker",
        app_subtitle: "Automatisation intelligente de la qualification des prospects",
        sign_out: "Déconnexion 🚪",
        settings_title: "⚙️ Paramètres",
        language_label: "Langue 🌐",
        billing_label: "Abonnement 💳",
        manage_billing: "Gérer le plan",
        billing_desc: "Gérez votre abonnement et vos factures.",
        help_label: "Aide & Support 🎓",
        rewatch_onboarding: "Revoir l'intégration",
        pitch_config_title: "📧 Configuration du Pitch",
        pitch_config_desc: "Personnalisez votre argumentaire. Utilisez {{name}} pour le nom.",
        pitch_initial_label: "1. Pitch Initial",
        pitch_yes_label: "✅ Réponse Oui",
        pitch_no_label: "❌ Réponse Non",
        pitch_yes2_label: "✅ Réponse Oui 2",
        pitch_no2_label: "❌ Réponse Non 2",
        save_pitch: "💾 Enregistrer",
        reset_pitch: "🔄 Réinitialiser (IA)"
    },
    ar: {
        app_title: "🤖 حجز العملاء بالذكاء الاصطناعي",
        app_subtitle: "أتمتة تأهيل العملاء والحجوزات بذكاء",
        sign_out: "خروج 🚪",
        settings_title: "⚙️ إعدادات التطبيق",
        language_label: "اللغة 🌐",
        billing_label: "الاشتراك 💳",
        manage_billing: "إدارة الخطة",
        billing_desc: "إدارة اشتراكك وطرق الدفع.",
        help_label: "المساعدة والدعم 🎓",
        rewatch_onboarding: "مشاهدة المقدمة مجدداً",
        pitch_config_title: "📧 إعدادات الخطاب",
        pitch_config_desc: "تخصيص تدفق خطاب المبيعات. استخدم {{name}} لاسم العميل.",
        pitch_initial_label: "1. الخطاب الأولي",
        pitch_yes_label: "✅ رد نعم",
        pitch_no_label: "❌ رد لا (إقناع)",
        pitch_yes2_label: "✅ رد نعم 2",
        pitch_no2_label: "❌ رد لا 2 (إغلاق)",
        save_pitch: "💾 حفظ الخطاب",
        reset_pitch: "🔄 إعادة تعيين للذكاء الاصطناعي"
    },
    pt: {
        app_title: "🤖 AI Lead Booker",
        app_subtitle: "Qualificação inteligente de leads e automação de reservas",
        sign_out: "Sair 🚪",
        settings_title: "⚙️ Configurações",
        language_label: "Idioma 🌐",
        billing_label: "Assinatura 💳",
        manage_billing: "Gerenciar Plano",
        billing_desc: "Gerencie sua assinatura e métodos de pagamento.",
        help_label: "Ajuda e Suporte 🎓",
        rewatch_onboarding: "Rever Onboarding",
        pitch_config_title: "📧 Configuração do Pitch",
        pitch_config_desc: "Personalize seu fluxo de vendas. Use {{name}} para o nome.",
        pitch_initial_label: "1. Pitch Inicial",
        pitch_yes_label: "✅ Resposta Sim",
        pitch_no_label: "❌ Resposta Não",
        pitch_yes2_label: "✅ Resposta Sim 2",
        pitch_no2_label: "❌ Resposta Não 2",
        save_pitch: "💾 Salvar Pitch",
        reset_pitch: "🔄 Resetar para IA"
    },
    ru: {
        app_title: "🤖 AI Lead Booker",
        app_subtitle: "Интеллектуальная квалификация лидов и автоматизация бронирования",
        sign_out: "Выйти 🚪",
        settings_title: "⚙️ Настройки",
        language_label: "Язык 🌐",
        billing_label: "Подписка 💳",
        manage_billing: "Управление планом",
        billing_desc: "Управляйте подпиской и способами оплаты.",
        help_label: "Помощь и поддержка 🎓",
        rewatch_onboarding: "Посмотреть обучение",
        pitch_config_title: "📧 Настройка питча",
        pitch_config_desc: "Настройте поток продаж. Используйте {{name}} для имени.",
        pitch_initial_label: "1. Начальный питч",
        pitch_yes_label: "✅ Ответ Да",
        pitch_no_label: "❌ Ответ Нет",
        pitch_yes2_label: "✅ Ответ Да 2",
        pitch_no2_label: "❌ Ответ Нет 2",
        save_pitch: "💾 Сохранить",
        reset_pitch: "🔄 Сброс (ИИ)"
    },
    ja: {
        app_title: "🤖 AI Lead Booker",
        app_subtitle: "インテリジェントなリード資格確認と予約の自動化",
        sign_out: "ログアウト 🚪",
        settings_title: "⚙️ 設定",
        language_label: "言語 🌐",
        billing_label: "サブスクリプション 💳",
        manage_billing: "プラン管理",
        billing_desc: "サブスクリプションと支払い方法を管理します。",
        help_label: "ヘルプとサポート 🎓",
        rewatch_onboarding: "オンボーディングを再確認",
        pitch_config_title: "📧 ピッチ設定",
        pitch_config_desc: "セールスピッチフローをカスタマイズします。名前に{{name}}を使用。",
        pitch_initial_label: "1. 初期ピッチ",
        pitch_yes_label: "✅ はいの反応",
        pitch_no_label: "❌ いいえの反応",
        pitch_yes2_label: "✅ はい 2",
        pitch_no2_label: "❌ いいえ 2",
        save_pitch: "💾 保存",
        reset_pitch: "🔄 AIリセット"
    },
    ur: {
        app_title: "🤖 اے آئی لیڈ بکر",
        app_subtitle: "ذہین لیڈ کی اہلیت اور بکنگ آٹومیشن",
        sign_out: "لاگ آؤٹ 🚪",
        settings_title: "⚙️ ترتیبات",
        language_label: "زبان 🌐",
        billing_label: "سبسکرپشن 💳",
        manage_billing: "منصوبے کا انتظام",
        billing_desc: "اپنی سبسکرپشن اور ادائیگی کے طریقوں کا نظم کریں۔",
        help_label: "مدد اور تعاون 🎓",
        rewatch_onboarding: "دوبارہ دیکھیں",
        pitch_config_title: "📧 پچ ترتیب",
        pitch_config_desc: "اپنی سیلز پچ کے بہاؤ کو حسب ضرورت بنائیں۔ نام کے لیے {{name}} استعمال کریں۔",
        pitch_initial_label: "1. ابتدائی پچ",
        pitch_yes_label: "✅ ہاں جواب",
        pitch_no_label: "❌ نہیں جواب",
        pitch_yes2_label: "✅ ہاں 2 جواب",
        pitch_no2_label: "❌ نہیں 2 جواب",
        save_pitch: "💾 پچ محفوظ کریں",
        reset_pitch: "🔄 AI کو دوبارہ ترتیب دیں"
    }
};

function changeLanguage(lang) {
    const t = translations[lang] || translations['en'];

    // Update Direction for Right-to-Left languages
    document.body.dir = (lang === 'ar' || lang === 'ur') ? 'rtl' : 'ltr';

    // Update Text Content
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) {
            el.textContent = t[key];
        }
    });

    // Persist preference
    localStorage.setItem('preferredLanguage', lang);
}

// Load saved language on start
const savedLang = localStorage.getItem('preferredLanguage');
if (savedLang) {
    const langSelect = document.getElementById('app-language');
    if (langSelect) {
        langSelect.value = savedLang;
        changeLanguage(savedLang);
    }
}
