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

  async function checkAuth() {
    return api('/api/auth/me');
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

    checkAuth().then(() => { window.location.href = '/dashboard.html'; }).catch(() => {});

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

    checkAuth()
      .then((user) => {
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

  return {
    initLoginPage,
    initVerifyEmailPage,
    initSetupAuthPage,
    initMfaPage,
    initDashboardPage,
    api,
    checkAuth,
  };
})();
