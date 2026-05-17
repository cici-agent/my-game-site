// ===== 认证模块 - 注册/登录/登出/状态管理 =====
// 使用普通 script 标签加载，所有函数挂载到全局

// 注册
async function signUp(username, password) {
  var sb = getSupabase();
  if (!sb) return { error: 'Supabase 未初始化，请刷新页面重试' };

  var email = username + '@xiaocainiao.app';
  var result = await sb.auth.signUp({ email: email, password: password });
  if (result.error) return { error: result.error.message };

  // 创建用户资料
  var userId = result.data.user ? result.data.user.id : null;
  if (userId) {
    var isAdmin = (username === 'admin');
    await sb.from('profiles').insert({
      id: userId,
      username: username,
      role: isAdmin ? 'admin' : 'user',
      coins: 0
    });
  }
  return { data: result.data };
}

// 登录
async function signIn(username, password) {
  var sb = getSupabase();
  if (!sb) return { error: 'Supabase 未初始化，请刷新页面重试' };

  var email = username + '@xiaocainiao.app';
  var result = await sb.auth.signInWithPassword({ email: email, password: password });
  if (result.error) return { error: result.error.message };
  return { data: result.data };
}

// 登出
async function signOut() {
  var sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

// 获取当前登录用户（Supabase auth user）
async function getCurrentUser() {
  var sb = getSupabase();
  if (!sb) return null;
  var result = await sb.auth.getUser();
  return (result.data && result.data.user) ? result.data.user : null;
}

// 获取当前 session
async function getSession() {
  var sb = getSupabase();
  if (!sb) return null;
  var result = await sb.auth.getSession();
  return (result.data && result.data.session) ? result.data.session : null;
}

// 获取用户资料（含 username、role、coins）
async function getUserProfile(userId) {
  var sb = getSupabase();
  if (!sb) return null;
  var result = await sb.from('profiles').select('*').eq('id', userId).single();
  return result.data || null;
}

// 获取当前登录用户的完整资料
async function getMyProfile() {
  var user = await getCurrentUser();
  if (!user) return null;
  return await getUserProfile(user.id);
}

// ===== 登录拦截工具函数 =====
// 检查是否已登录，未登录则跳转到登录页并携带 redirect 参数
// redirectUrl: 登录后要跳回的页面（默认为当前页面）
// 返回 true 表示已登录，返回 false 表示未登录（已跳转）
async function requireLogin(redirectUrl) {
  var user = await getCurrentUser();
  if (!user) {
    var target = redirectUrl || (window.location.pathname.split('/').pop() + window.location.search);
    window.location.href = 'login.html?redirect=' + encodeURIComponent(target);
    return false;
  }
  return true;
}

// 更新导航栏（根据登录状态）- 所有页面通用
async function updateNavbar() {
  var navLinks = document.getElementById('navLinks');
  if (!navLinks) return;

  var user = await getCurrentUser();

  if (user) {
    var profile = await getUserProfile(user.id);
    var isAdmin = profile && profile.role === 'admin';
    var username = (profile && profile.username) ? profile.username : '我的';
    navLinks.innerHTML =
      '<a href="index.html">首页</a>' +
      '<a href="profile.html">👤 ' + username + '</a>';
  } else {
    navLinks.innerHTML =
      '<a href="index.html">首页</a>' +
      '<a href="login.html">登录 / 注册</a>';
  }
}

// 页面加载时更新导航栏，完成后显示 body（避免导航栏闪烁）
document.addEventListener('DOMContentLoaded', function() {
  updateNavbar().then(function() {
    document.body.style.opacity = '1';
  });
});

