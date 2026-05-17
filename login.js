// ===== 登录页逻辑 =====

document.addEventListener('DOMContentLoaded', function() {
  const loginSection = document.getElementById('loginSection');
  const registerSection = document.getElementById('registerSection');
  const profileSection = document.getElementById('profileSection');

  // 检查登录状态，决定显示哪个区域
  function checkState() {
    const user = Auth.getCurrentUser();
    if (user) {
      loginSection.style.display = 'none';
      registerSection.style.display = 'none';
      profileSection.style.display = 'block';
      renderProfile(user);
    } else {
      loginSection.style.display = 'block';
      registerSection.style.display = 'none';
      profileSection.style.display = 'none';
    }
  }

  // 渲染个人中心
  function renderProfile(user) {
    document.getElementById('profileAvatar').textContent = user.avatar || '🐣';
    document.getElementById('profileUsername').textContent = user.username;
    document.getElementById('profileCoins').textContent = user.coins || 0;

    // 渲染金币记录
    if (user.coinHistory && user.coinHistory.length > 0) {
      const coinTab = document.getElementById('tab-coins');
      let html = '<div style="font-size:14px;">';
      user.coinHistory.forEach(record => {
        const sign = record.type === 'earn' ? '+' : '-';
        const color = record.type === 'earn' ? '#06d6a0' : '#d63031';
        html += `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;">
          <span>${record.reason}</span>
          <span style="color:${color};font-weight:700;">${sign}${record.amount}</span>
        </div>`;
      });
      html += '</div>';
      coinTab.innerHTML = html;
    }
  }

  // 切换到注册
  document.getElementById('showRegister').addEventListener('click', function() {
    loginSection.style.display = 'none';
    registerSection.style.display = 'block';
  });

  // 切换到登录
  document.getElementById('showLogin').addEventListener('click', function() {
    registerSection.style.display = 'none';
    loginSection.style.display = 'block';
  });

  // 登录表单提交
  document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');

    const result = Auth.login(username, password);
    if (result.success) {
      errorEl.style.display = 'none';
      checkState();
      renderNavbar();
    } else {
      errorEl.textContent = result.message;
      errorEl.style.display = 'block';
    }
  });

  // 注册表单提交
  document.getElementById('registerForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regPasswordConfirm').value;
    const errorEl = document.getElementById('registerError');

    if (password !== confirm) {
      errorEl.textContent = '两次密码不一致';
      errorEl.style.display = 'block';
      return;
    }

    const result = Auth.register(username, password);
    if (result.success) {
      errorEl.style.display = 'none';
      checkState();
      renderNavbar();
    } else {
      errorEl.textContent = result.message;
      errorEl.style.display = 'block';
    }
  });

  // 退出登录
  document.getElementById('logoutBtn').addEventListener('click', function() {
    Auth.logout();
    checkState();
    renderNavbar();
  });

  // Tab 切换
  const tabBtns = document.querySelectorAll('.tab-nav button');
  const tabPanels = document.querySelectorAll('.tab-panel');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      this.classList.add('active');
      document.getElementById('tab-' + this.dataset.tab).classList.add('active');
    });
  });

  // 初始化
  checkState();
});
