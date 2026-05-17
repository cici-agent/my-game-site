// ===== 小菜鸟 - 认证模块 =====
// 使用 localStorage 模拟用户系统

const Auth = {
  // 获取所有用户
  getUsers() {
    return JSON.parse(localStorage.getItem('xcn_users') || '[]');
  },

  // 保存用户列表
  saveUsers(users) {
    localStorage.setItem('xcn_users', JSON.stringify(users));
  },

  // 注册
  register(username, password) {
    const users = this.getUsers();
    if (users.find(u => u.username === username)) {
      return { success: false, message: '该账号已被注册' };
    }
    const newUser = {
      id: Date.now().toString(),
      username,
      password,
      avatar: '🐣',
      coins: 100,
      role: username === 'admin' ? 'admin' : 'user',
      createdAt: new Date().toISOString(),
      gamesPublished: [],
      gamesPlayed: [],
      coinHistory: [
        { type: 'earn', amount: 100, reason: '注册奖励', time: new Date().toISOString() }
      ]
    };
    users.push(newUser);
    this.saveUsers(users);
    this.setCurrentUser(newUser);
    return { success: true, user: newUser };
  },

  // 登录
  login(username, password) {
    const users = this.getUsers();
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) {
      return { success: false, message: '账号或密码错误' };
    }
    this.setCurrentUser(user);
    return { success: true, user };
  },

  // 登出
  logout() {
    localStorage.removeItem('xcn_current_user');
  },

  // 设置当前用户
  setCurrentUser(user) {
    localStorage.setItem('xcn_current_user', JSON.stringify(user));
  },

  // 获取当前用户
  getCurrentUser() {
    const data = localStorage.getItem('xcn_current_user');
    return data ? JSON.parse(data) : null;
  },

  // 更新当前用户信息
  updateCurrentUser(updates) {
    const user = this.getCurrentUser();
    if (!user) return null;
    const updatedUser = { ...user, ...updates };
    this.setCurrentUser(updatedUser);
    // 同步到用户列表
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx !== -1) {
      users[idx] = updatedUser;
      this.saveUsers(users);
    }
    return updatedUser;
  },

  // 是否管理员
  isAdmin() {
    const user = this.getCurrentUser();
    return user && user.role === 'admin';
  },

  // 是否已登录
  isLoggedIn() {
    return !!this.getCurrentUser();
  }
};

// ===== 导航栏渲染 =====
function renderNavbar() {
  const navLinks = document.getElementById('navLinks');
  if (!navLinks) return;

  const user = Auth.getCurrentUser();

  if (!user) {
    // 未登录
    navLinks.innerHTML = `<a href="login.html">🔑 登录</a>`;
  } else if (user.role === 'admin') {
    // 管理员
    navLinks.innerHTML = `
      <a href="login.html">👤 我的</a>
      <a href="admin.html">⚙️ 管理后台</a>
    `;
  } else {
    // 普通用户
    navLinks.innerHTML = `<a href="login.html">👤 我的</a>`;
  }
}

// 页面加载时渲染导航
document.addEventListener('DOMContentLoaded', renderNavbar);
