/**
 * Shared frontend API helpers and page controllers
 */
const App = (function () {
  const API = '';

  function showMessage(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = `message show ${type || 'info'}`;
  }

  function hideMessage(el) {
    if (!el) el = document.getElementById('message');
    if (el) { el.className = 'message'; el.textContent = ''; }
  }

  async function api(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(`${API}${path}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...options.headers },
        signal: controller.signal,
        ...options,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || res.statusText || 'Request failed');
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Request timed out. Try again.');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function checkAuth(expectedRole) {
    const user = await api('/api/auth/me');
    if (expectedRole && user.role !== expectedRole) {
      const err = new Error('Wrong portal for this account.');
      err.status = 403;
      err.user = user;
      throw err;
    }
    return user;
  }

  function redirectByRole(user) {
    if (user.role === 'admin') window.location.href = '/admin-dashboard.html';
    else window.location.href = '/dashboard.html';
  }

  function bindOtpInput(id) {
    document.getElementById(id)?.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    });
  }

  function startCountdown(timerEl, seconds) {
    let left = seconds;
    const id = setInterval(() => {
      const m = Math.floor(left / 60);
      const s = left % 60;
      timerEl.textContent = `Code expires in ${m}:${String(s).padStart(2, '0')}`;
      if (left <= 0) {
        clearInterval(id);
        timerEl.textContent = 'Code expired. Resend or sign up again.';
        timerEl.style.color = '#dc3545';
      }
      left -= 1;
    }, 1000);
  }

  function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const panels = { login: document.getElementById('loginPanel'), signup: document.getElementById('signupPanel') };
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        Object.values(panels).forEach((p) => p?.classList.remove('active'));
        panels[tab.dataset.tab]?.classList.add('active');
        hideMessage();
      });
    });
  }

  function initLoginPage() {
    const msg = document.getElementById('message');
    initTabs();

    checkAuth('user').then(redirectByRole).catch(() => {});

    document.getElementById('loginResetBtn')?.addEventListener('click', () => {
      document.getElementById('loginEmail').value = '';
      document.getElementById('loginPassword').value = '';
      hideMessage(msg);
    });

    document.getElementById('signupResetBtn')?.addEventListener('click', () => {
      ['userName', 'userEmail', 'userPassword'].forEach((id) => { document.getElementById(id).value = ''; });
      hideMessage(msg);
    });

    document.getElementById('signupPanel')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('signupBtn');
      btn.disabled = true;
      hideMessage(msg);
      try {
        const data = await api('/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify({
            fullName: document.getElementById('userName').value.trim(),
            email: document.getElementById('userEmail').value.trim(),
            password: document.getElementById('userPassword').value,
          }),
        });
        if (data.devOtp) showMessage(msg, `Dev mode: email OTP is ${data.devOtp}`, 'info');
        else showMessage(msg, data.message, 'success');
        setTimeout(() => { window.location.href = data.redirect || '/verify-email.html'; }, data.devOtp ? 1500 : 600);
      } catch (err) {
        showMessage(msg, err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('loginPanel')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('loginBtn');
      btn.disabled = true;
      hideMessage(msg);
      try {
        const data = await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: document.getElementById('loginEmail').value.trim(),
            password: document.getElementById('loginPassword').value,
          }),
        });
        showMessage(msg, data.message, 'success');
        setTimeout(() => {
          window.location.href = data.redirect || '/dashboard.html';
        }, 600);
      } catch (err) {
        if (err.data?.redirect) {
          showMessage(msg, err.message, 'info');
          setTimeout(() => { window.location.href = err.data.redirect; }, 800);
        } else {
          showMessage(msg, err.message, 'error');
        }
      } finally {
        btn.disabled = false;
      }
    });
  }

  function initForgotPasswordPage() {
    const msg = document.getElementById('message');
    const form = document.getElementById('forgotPasswordForm');

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('forgotPasswordBtn');
      btn.disabled = true;
      hideMessage(msg);
      const email = document.getElementById('forgotEmail').value.trim();
      try {
        const data = await api('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        if (data.devOtp) showMessage(msg, `Dev mode: reset OTP is ${data.devOtp}`, 'info');
        else showMessage(msg, data.message, 'success');
        setTimeout(() => {
          window.location.href = `${data.redirect || '/reset-password.html'}?email=${encodeURIComponent(email)}`;
        }, 900);
      } catch (err) {
        showMessage(msg, err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function initResetPasswordPage() {
    const msg = document.getElementById('message');
    bindOtpInput('resetCode');

    const params = new URLSearchParams(window.location.search);
    const emailFromQuery = params.get('email');
    if (emailFromQuery) {
      document.getElementById('resetEmail').value = emailFromQuery;
    }

    document.getElementById('resetPasswordForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('resetPasswordBtn');
      btn.disabled = true;
      hideMessage(msg);

      const email = document.getElementById('resetEmail').value.trim();
      const code = document.getElementById('resetCode').value.trim();
      const newPassword = document.getElementById('resetNewPassword').value;
      const confirm = document.getElementById('resetConfirmPassword').value;
      if (newPassword !== confirm) {
        showMessage(msg, 'Passwords do not match.', 'error');
        btn.disabled = false;
        return;
      }

      try {
        const data = await api('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ email, code, newPassword }),
        });
        showMessage(msg, data.message, 'success');
        setTimeout(() => { window.location.href = data.redirect || '/login.html'; }, 900);
      } catch (err) {
        showMessage(msg, err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function initChangePasswordPage() {
    const msg = document.getElementById('message');
    checkAuth().catch(() => { window.location.href = '/login.html'; });

    document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('changePasswordBtn');
      btn.disabled = true;
      hideMessage(msg);

      const currentPassword = document.getElementById('currentPassword').value;
      const newPassword = document.getElementById('newPassword').value;
      const confirm = document.getElementById('confirmNewPassword').value;

      if (newPassword !== confirm) {
        showMessage(msg, 'Passwords do not match.', 'error');
        btn.disabled = false;
        return;
      }

      try {
        const data = await api('/api/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        showMessage(msg, data.message, 'success');
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmNewPassword').value = '';
      } catch (err) {
        showMessage(msg, err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function initVerifyEmailPage() {
    const msg = document.getElementById('message');
    const timerEl = document.getElementById('timer');
    bindOtpInput('emailOtp');
    if (timerEl) startCountdown(timerEl, 5 * 60);

    document.getElementById('verifyEmailForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('verifyEmailBtn');
      btn.disabled = true;
      hideMessage(msg);
      try {
        const data = await api('/api/auth/verify-email', {
          method: 'POST',
          body: JSON.stringify({ code: document.getElementById('emailOtp').value.trim() }),
        });
        if (data.qrCodeDataUrl) {
          sessionStorage.setItem('mfaQrCode', data.qrCodeDataUrl);
        }
        showMessage(msg, data.message, 'success');
        window.location.href = data.redirect || '/setup-auth.html';
      } catch (err) {
        showMessage(msg, err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('resendEmailBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('resendEmailBtn');
      btn.disabled = true;
      hideMessage(msg);
      try {
        const data = await api('/api/auth/resend-email-otp', { method: 'POST', body: '{}' });
        if (data.devOtp) showMessage(msg, `Dev mode: new OTP is ${data.devOtp}`, 'info');
        else showMessage(msg, data.message, 'success');
      } catch (err) {
        showMessage(msg, err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function initSetupAuthPage() {
    const msg = document.getElementById('message');
    const qrImg = document.getElementById('qrCode');
    bindOtpInput('setupCode');

    const cachedQr = sessionStorage.getItem('mfaQrCode');
    if (cachedQr && qrImg) {
      qrImg.src = cachedQr;
    } else {
      api('/api/otp/setup-info')
        .then((data) => {
          if (qrImg && data.qrCodeDataUrl) qrImg.src = data.qrCodeDataUrl;
        })
        .catch((err) => showMessage(msg, err.message, 'error'));
    }

    document.getElementById('setupAuthForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('enableSetupBtn');
      btn.disabled = true;
      hideMessage(msg);
      try {
        const data = await api('/api/otp/enable-setup', {
          method: 'POST',
          body: JSON.stringify({ code: document.getElementById('setupCode').value.trim() }),
        });
        sessionStorage.removeItem('mfaQrCode');
        showMessage(msg, data.message, 'success');
        setTimeout(() => { window.location.href = data.redirect || '/login.html'; }, 600);
      } catch (err) {
        showMessage(msg, err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function initMfaPage() {
    const msg = document.getElementById('message');
    bindOtpInput('otp');

    document.getElementById('mfaForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('verifyBtn');
      btn.disabled = true;
      hideMessage(msg);
      try {
        const data = await api('/api/otp/verify', {
          method: 'POST',
          body: JSON.stringify({ code: document.getElementById('otp').value.trim() }),
        });
        showMessage(msg, data.message, 'success');
        window.location.href = data.redirect || '/dashboard.html';
      } catch (err) {
        showMessage(msg, err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function initDashboardPage() {
    const msg = document.getElementById('message');
    const setupSection = document.getElementById('mfaSetupSection');
    const setupBtn = document.getElementById('setupMfaBtn');

    checkAuth('user')
      .then((user) => {
        if (user.role === 'admin') {
          window.location.href = '/admin-dashboard.html';
          return;
        }
        document.getElementById('welcomeMsg').textContent = `Welcome back, ${user.fullName}!`;
        document.getElementById('userName').textContent = user.fullName;
        document.getElementById('userEmail').textContent = user.email;
        document.getElementById('emailStatus').textContent = user.isEmailVerified ? 'Yes' : 'No';
        document.getElementById('mfaStatus').textContent =
          user.mfaEnabled ? 'Enabled (Google Authenticator)' : 'Not enabled';
        if (user.isEmailVerified && !user.mfaEnabled) setupBtn.style.display = 'block';
      })
      .catch(() => { window.location.href = '/login.html'; });

    setupBtn?.addEventListener('click', async () => {
      setupBtn.disabled = true;
      hideMessage(msg);
      try {
        const data = await api('/api/otp/setup', { method: 'POST', body: '{}' });
        document.getElementById('qrCode').src = data.qrCodeDataUrl;
        setupSection.style.display = 'block';
        setupBtn.style.display = 'none';
        showMessage(msg, data.message, 'info');
      } catch (err) {
        showMessage(msg, err.message, 'error');
      } finally {
        setupBtn.disabled = false;
      }
    });

    document.getElementById('cancelSetupBtn')?.addEventListener('click', () => {
      setupSection.style.display = 'none';
      setupBtn.style.display = 'block';
      document.getElementById('setupCode').value = '';
      hideMessage(msg);
    });

    bindOtpInput('setupCode');

    document.getElementById('enableMfaBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('enableMfaBtn');
      btn.disabled = true;
      hideMessage(msg);
      try {
        const data = await api('/api/otp/enable', {
          method: 'POST',
          body: JSON.stringify({ code: document.getElementById('setupCode').value.trim() }),
        });
        showMessage(msg, data.message, 'success');
        setupSection.style.display = 'none';
        setupBtn.style.display = 'none';
        document.getElementById('mfaStatus').textContent = 'Enabled (Google Authenticator)';
      } catch (err) {
        showMessage(msg, err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* ok */ }
      window.location.href = '/login.html';
    });
  }

  function initAdminLoginPage() {
    const msg = document.getElementById('message');
    checkAuth('admin').then(redirectByRole).catch(() => {});

    document.getElementById('adminLoginForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('adminLoginBtn');
      btn.disabled = true;
      hideMessage(msg);
      try {
        const data = await api('/api/auth/admin/login', {
          method: 'POST',
          body: JSON.stringify({
            email: document.getElementById('adminEmail').value.trim(),
            password: document.getElementById('adminPassword').value,
          }),
        });
        showMessage(msg, data.message, 'success');
        setTimeout(() => {
          window.location.href = data.redirect || '/admin-mfa.html';
        }, 600);
      } catch (err) {
        if (err.data?.redirect) {
          showMessage(msg, err.message, 'info');
          setTimeout(() => { window.location.href = err.data.redirect; }, 800);
        } else {
          showMessage(msg, err.message, 'error');
        }
      } finally {
        btn.disabled = false;
      }
    });
  }

  function initAdminMfaPage() {
    const msg = document.getElementById('message');
    bindOtpInput('adminOtp');

    document.getElementById('adminMfaForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('adminVerifyBtn');
      btn.disabled = true;
      hideMessage(msg);
      try {
        const data = await api('/api/otp/verify', {
          method: 'POST',
          body: JSON.stringify({ code: document.getElementById('adminOtp').value.trim() }),
        });
        showMessage(msg, data.message, 'success');
        window.location.href = data.redirect || '/admin-dashboard.html';
      } catch (err) {
        showMessage(msg, err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }

  function initAdminDashboardPage() {
    const msg = document.getElementById('message');

    checkAuth('admin')
      .then((admin) => {
        document.getElementById('adminWelcome').textContent = `Welcome, ${admin.fullName}`;
        document.getElementById('adminName').textContent = admin.fullName;
        document.getElementById('adminEmail').textContent = admin.email;
        loadAdminUsers();
        loadAdminActivity();
      })
      .catch((err) => {
        if (err.user?.role === 'user') window.location.href = '/dashboard.html';
        else window.location.href = '/admin-login.html';
      });

    async function loadAdminUsers() {
      const tbody = document.getElementById('usersTableBody');
      try {
        const data = await api('/api/admin/users');
        const users = data.users || [];
        if (!users.length) {
          tbody.innerHTML = '<tr><td colspan="6">No users found.</td></tr>';
          return;
        }
        tbody.innerHTML = users.map((u) => {
          const status = u.isDisabled
            ? '<span class="badge badge-disabled">Disabled</span>'
            : '<span class="badge badge-active">Active</span>';
          const roleBadge = u.role === 'admin'
            ? '<span class="badge badge-admin">admin</span>'
            : '<span class="badge badge-user">user</span>';
          const mfa = u.mfaEnabled ? 'Yes' : 'No';
          let action = '—';
          if (u.role !== 'admin') {
            action = u.isDisabled
              ? `<button type="button" class="btn-sm btn-ok" data-enable="${u._id}">Enable</button>`
              : `<button type="button" class="btn-sm btn-warn" data-disable="${u._id}">Disable</button>`;
          }
          return `<tr>
            <td>${u.fullName}</td>
            <td>${u.email}</td>
            <td>${roleBadge}</td>
            <td>${status}</td>
            <td>${mfa}</td>
            <td>${action}</td>
          </tr>`;
        }).join('');

        tbody.querySelectorAll('[data-disable]').forEach((btn) => {
          btn.addEventListener('click', () => toggleUser(btn.dataset.disable, 'disable', msg));
        });
        tbody.querySelectorAll('[data-enable]').forEach((btn) => {
          btn.addEventListener('click', () => toggleUser(btn.dataset.enable, 'enable', msg));
        });
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6">${err.message}</td></tr>`;
      }
    }

    async function loadAdminActivity() {
      const tbody = document.getElementById('activityTableBody');
      try {
        const data = await api('/api/admin/activity');
        const rows = data.activity || [];
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="4">No activity yet.</td></tr>';
          return;
        }
        tbody.innerHTML = rows.map((a) => `<tr>
          <td>${formatDate(a.createdAt)}</td>
          <td>${a.email || '—'}</td>
          <td>${a.action}</td>
          <td>${a.role || '—'}</td>
        </tr>`).join('');
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4">${err.message}</td></tr>`;
      }
    }

    async function toggleUser(id, action, msgEl) {
      hideMessage(msgEl);
      try {
        const data = await api(`/api/admin/users/${id}/${action}`, { method: 'POST', body: '{}' });
        showMessage(msgEl, data.message, 'success');
        loadAdminUsers();
        loadAdminActivity();
      } catch (err) {
        showMessage(msgEl, err.message, 'error');
      }
    }

    document.getElementById('adminLogoutBtn')?.addEventListener('click', async () => {
      try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* ok */ }
      window.location.href = '/admin-login.html';
    });
  }

  return {
    initLoginPage,
    initAdminLoginPage,
    initAdminMfaPage,
    initAdminDashboardPage,
    initForgotPasswordPage,
    initResetPasswordPage,
    initChangePasswordPage,
    initVerifyEmailPage,
    initSetupAuthPage,
    initMfaPage,
    initDashboardPage,
    api,
    checkAuth,
  };
})();
