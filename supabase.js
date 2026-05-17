// Supabase 配置 - 使用全局变量方式，兼容普通 script 标签
// supabase-js 通过 CDN 加载后挂载在 window.supabase 上

var SUPABASE_URL = 'https://aqxbpuetdypcbmqdncpl.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxeGJwdWV0ZHlwY2JtcWRuY3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5ODg5MzksImV4cCI6MjA5NDU2NDkzOX0.YUwFQeJgbmhrtY32tGXbm9wz0jtou0Zxg1626EJl3r0';

window._supabaseClient = null;

function getSupabase() {
  if (!window._supabaseClient) {
    if (window.supabase && window.supabase.createClient) {
      window._supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          storageKey: 'xiaocainiao_session',
          storage: window.localStorage,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      });
    }
  }
  return window._supabaseClient;
}
