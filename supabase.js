// Supabase 配置
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://aqxbpuetdypcbmqdncpl.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxeGJwdWV0ZHlwY2JtcWRuY3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5ODg5MzksImV4cCI6MjA5NDU2NDkzOX0.YUwFQeJgbmhrtY32tGXbm9wz0jtou0Zxg1626EJl3r0'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

