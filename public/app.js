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
    if (el) {
      el.className = 'message';
      el.textContent = '';
    }
  }

  async function api(path, options = {}) {
    const res = await fetch(`${API}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options.headers },
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
  }

  async function checkAuth() {
    return api('/api/auth/me');
  }

  function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const panels = {
      login: document.getElementById('loginPanel'),
      signup: document.getElementById('signupPanel'),
    };
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

    checkAuth()
      .then(() => { window.location.href = '/dashboard.html'; })
      .catch(() => {});

    document.getElementById('loginResetBtn')?.addEventListener('click', () => {
      document.getElementById('loginEmail').value = '';
      document.getElementById('loginPassword').value = '';
      hideMessage(msg);
    });

    document.getElementById('signupResetBtn')?.addEventListener('click', () => {
      ['userName', 'userEmail', 'userPassword'].forEach((id) => {
        document.getElementById(id).value = '';
      });
      hideMessage(msg);
    });

    document.getElementById('signupPanel')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('signupBtn');
      btn.disabled = true;
      hideMessage(msg);
      try {
        const body = {
          fullName: document.getElementById('userName').value.trim(),
          email: document.getElementById('userEmail').value.trim(),
          password: document.getElementById('userPassword').value,
        };
        const data = await api('/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        showMessage(msg, data.message, 'success');
        document.querySelector('.tab[data-tab="login"]')?.click();
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
        if (data.devOtp) {
          showMessage(msg, `Dev mode: your OTP is ${data.devOtp}`, 'info');
          setTimeout(() => { window.location.href = data.redirect || '/mfa.html'; }, 1500);
        } else {
          showMessage(msg, data.message, 'success');
          setTimeout(() => { window.location.href = data.redirect || '/mfa.html'; }, 600);
        }
      } catch (err) {
        showMessage(msg, err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function initMfaPage() {
    const msg = document.getElementById('message');
    const timerEl = document.getElementById('timer');
    let secondsLeft = 5 * 60;
    let timerId;

    function updateTimer() {
      const m = Math.floor(secondsLeft / 60);
      const s = secondsLeft % 60;
      timerEl.textContent = `Code expires in ${m}:${String(s).padStart(2, '0')}`;
      if (secondsLeft <= 0) {
        clearInterval(timerId);
        timerEl.textContent = 'Code expired. Request a new code or log in again.';
        timerEl.style.color = '#dc3545';
      }
      secondsLeft -= 1;
    }

    timerId = setInterval(updateTimer, 1000);
    updateTimer();

    document.getElementById('otp')?.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    });

    document.getElementById('mfaForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('verifyBtn');
      btn.disabled = true;
      hideMessage(msg);
      try {
        const data = await api('/api/otp/verify', {
          method: 'POST',
          body: JSON.stringify({ otp: document.getElementById('otp').value.trim() }),
        });
        showMessage(msg, data.message, 'success');
        window.location.href = data.redirect || '/dashboard.html';
      } catch (err) {
        showMessage(msg, err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('resendBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('resendBtn');
      btn.disabled = true;
      hideMessage(msg);
      try {
        const data = await api('/api/otp/resend', { method: 'POST', body: '{}' });
        secondsLeft = 5 * 60;
        timerEl.style.color = '#666';
        if (data.devOtp) {
          showMessage(msg, `Dev mode: new OTP is ${data.devOtp}`, 'info');
        } else {
          showMessage(msg, data.message, 'success');
        }
      } catch (err) {
        showMessage(msg, err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function initDashboardPage() {
    const msg = document.getElementById('message');

    checkAuth()
      .then((user) => {
        document.getElementById('welcomeMsg').textContent =
          `Welcome back, ${user.fullName}!`;
        document.getElementById('userName').textContent = user.fullName;
        document.getElementById('userEmail').textContent = user.email;
      })
      .catch(() => {
        window.location.href = '/login.html';
      });

    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      try {
        await api('/api/auth/logout', { method: 'POST', body: '{}' });
      } catch {
        /* still redirect */
      }
      window.location.href = '/login.html';
    });
  }

  return {
    initLoginPage,
    initMfaPage,
    initDashboardPage,
    api,
    checkAuth,
  };
})();
