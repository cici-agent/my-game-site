// Supabase 配置
var SUPABASE_URL = 'https://aqxbpuetdypcbmqdncpl.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxeGJwdWV0ZHlwY2JtcWRuY3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5ODg5MzksImV4cCI6MjA5NDU2NDkzOX0.YUwFQeJgbmhrtY32tGXbm9wz0jtou0Zxg1626EJl3r0';

window._supabaseClient = null;

function getSupabase() {
  if (!window._supabaseClient) {
    // 兼容本地文件（var supabase = ...）和 CDN（window.supabase = ...）两种加载方式
    var lib = (typeof supabase !== 'undefined' && supabase && supabase.createClient) ? supabase
            : (window.supabase && window.supabase.createClient) ? window.supabase
            : null;
    if (lib) {
      window._supabaseClient = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
