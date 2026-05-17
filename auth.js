// ===== 认证模块 - 注册/登录/登出/状态管理 =====

// 注册
async function signUp(username, password) {
  const sb = getSupabase()
  if (!sb) return { error: 'Supabase 未初始化' }

  const email = `${username}@xiaocainiao.app`
  const { data, error } = await sb.auth.signUp({ email, password })
  if (error) return { error: error.message }

  // 创建用户资料
  const userId = data.user?.id
  if (userId) {
    const isAdmin = username === 'admin'
    await sb.from('profiles').insert({
      id: userId,
      username: username,
      role: isAdmin ? 'admin' : 'user',
      coins: 0
    })
  }
  return { data }
}

// 登录
async function signIn(username, password) {
  const sb = getSupabase()
  if (!sb) return { error: 'Supabase 未初始化' }

  const email = `${username}@xiaocainiao.app`
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }
  return { data }
}

// 登出
async function signOut() {
  const sb = getSupabase()
  if (!sb) return
  await sb.auth.signOut()
  window.location.href = 'index.html'
}

// 获取当前用户
async function getCurrentUser() {
  const sb = getSupabase()
  if (!sb) return null
  const { data } = await sb.auth.getUser()
  return data?.user || null
}

// 获取用户资料（含 username、role、coins）
async function getUserProfile(userId) {
  const sb = getSupabase()
  if (!sb) return null
  const { data } = await sb.from('profiles').select('*').eq('id', userId).single()
  return data
}

// 更新导航栏（根据登录状态）
async function updateNavbar() {
  const navLinks = document.getElementById('navLinks')
  if (!navLinks) return

  const user = await getCurrentUser()

  if (user) {
    const profile = await getUserProfile(user.id)
    const isAdmin = profile?.role === 'admin'
    navLinks.innerHTML = `
      <a href="index.html">首页</a>
      ${isAdmin ? '<a href="admin.html">管理后台</a>' : ''}
      <a href="login.html?tab=profile" class="nav-btn">👤 ${profile?.username || '我的'}</a>
      <button onclick="signOut()" class="nav-btn nav-btn-outline">退出</button>
    `
  } else {
    navLinks.innerHTML = `
      <a href="index.html">首页</a>
      <a href="login.html" class="nav-btn">登录 / 注册</a>
    `
  }
}

// 页面加载时更新导航栏
document.addEventListener('DOMContentLoaded', function () {
  updateNavbar()
})

