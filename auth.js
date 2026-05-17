import { supabase } from './supabase.js'

// 注册
export async function signUp(username, password) {
  // 用 username@xiaocainiao.app 作为虚拟邮箱
  const email = `${username}@xiaocainiao.app`
  
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return { error: error.message }

  // 创建用户资料
  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user.id,
    username: username,
    is_admin: username === 'admin'
  })
  if (profileError) return { error: profileError.message }

  return { user: data.user }
}

// 登录
export async function signIn(username, password) {
  const email = `${username}@xiaocainiao.app`
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: '用户名或密码错误' }
  return { user: data.user }
}

// 退出
export async function signOut() {
  await supabase.auth.signOut()
}

// 获取当前用户资料
export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  return data
}

// 监听登录状态变化
export function onAuthChange(callback) {
  supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session)
  })
}

