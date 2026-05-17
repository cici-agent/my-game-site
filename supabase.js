// Supabase 配置 - 使用全局变量方式，兼容普通 script 标签
// supabase-js 通过 CDN 加载后挂载在 window.supabase 上

const SUPABASE_URL = 'https://aqxbpuetdypcbmqdncpl.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxeGJwdWV0ZHlwY2JtcWRuY3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5ODg5MzksImV4cCI6MjA5NDU2NDkzOX0.YUwFQeJgbmhrtY32tGXbm9wz0jtou0Zxg1626EJl3r0'

// 等待 supabase-js CDN 加载完成后初始化
window._supabaseClient = null

function getSupabase() {
  if (!window._supabaseClient) {
    if (window.supabase && window.supabase.createClient) {
      window._supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    }
  }
  return window._supabaseClient
}

