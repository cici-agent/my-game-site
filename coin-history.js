// ===== 金币流水记录弹窗组件 =====
// 全局函数 showCoinHistory()，点击金币余额时调用
// 兼容多种 Supabase 初始化方式：getSupabase() / initSB() / window._supabaseClient

(function() {
  // 获取 Supabase 客户端（兼容不同页面的初始化方式）
  function getSB() {
    if (typeof getSupabase === 'function') return getSupabase();
    if (typeof initSB === 'function') return initSB();
    if (window._supabaseClient) return window._supabaseClient;
    if (window._sb) return window._sb;
    // 尝试自行创建
    if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
      var url = window.SUPABASE_URL || 'https://aqxbpuetdypcbmqdncpl.supabase.co';
      var key = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxeGJwdWV0ZHlwY2JtcWRuY3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5ODg5MzksImV4cCI6MjA5NDU2NDkzOX0.YUwFQeJgbmhrtY32tGXbm9wz0jtou0Zxg1626EJl3r0';
      return window.supabase.createClient(url, key, {
        auth: { persistSession: true, storageKey: 'xiaocainiao_session', storage: window.localStorage }
      });
    }
    return null;
  }

  // 注入弹窗样式（只注入一次）
  if (!document.getElementById('coinHistoryStyles')) {
    var style = document.createElement('style');
    style.id = 'coinHistoryStyles';
    style.textContent = '\
.coin-history-overlay {\
  position: fixed;\
  top: 0; left: 0; right: 0; bottom: 0;\
  background: rgba(0,0,0,0.45);\
  z-index: 99999;\
  display: flex;\
  align-items: center;\
  justify-content: center;\
  animation: coinHistFadeIn 0.2s ease;\
  padding: 16px;\
}\
@keyframes coinHistFadeIn {\
  from { opacity: 0; }\
  to { opacity: 1; }\
}\
.coin-history-panel {\
  background: #fff;\
  border-radius: 16px;\
  width: 100%;\
  max-width: 420px;\
  max-height: 75vh;\
  display: flex;\
  flex-direction: column;\
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);\
  animation: coinHistSlideUp 0.25s ease;\
  overflow: hidden;\
}\
@keyframes coinHistSlideUp {\
  from { transform: translateY(30px); opacity: 0; }\
  to { transform: translateY(0); opacity: 1; }\
}\
.coin-history-header {\
  display: flex;\
  align-items: center;\
  justify-content: space-between;\
  padding: 16px 20px;\
  border-bottom: 1px solid #f0f0f0;\
  background: linear-gradient(135deg, #fff8e1, #fff3cd);\
}\
.coin-history-header h3 {\
  margin: 0;\
  font-size: 1.1rem;\
  font-weight: 800;\
  color: #e65100;\
}\
.coin-history-close {\
  width: 32px;\
  height: 32px;\
  border: none;\
  background: rgba(0,0,0,0.06);\
  border-radius: 50%;\
  font-size: 1.2rem;\
  cursor: pointer;\
  display: flex;\
  align-items: center;\
  justify-content: center;\
  color: #666;\
  transition: background 0.15s;\
}\
.coin-history-close:hover {\
  background: rgba(0,0,0,0.12);\
}\
.coin-history-body {\
  flex: 1;\
  overflow-y: auto;\
  padding: 12px 16px;\
}\
.coin-history-empty {\
  text-align: center;\
  padding: 40px 20px;\
  color: #999;\
  font-size: 0.95rem;\
  line-height: 1.6;\
}\
.coin-history-empty .empty-icon {\
  font-size: 2.5rem;\
  margin-bottom: 12px;\
}\
.coin-history-item {\
  display: flex;\
  align-items: center;\
  justify-content: space-between;\
  padding: 10px 8px;\
  border-bottom: 1px solid #f5f5f5;\
}\
.coin-history-item:last-child {\
  border-bottom: none;\
}\
.coin-history-item .item-left {\
  flex: 1;\
  min-width: 0;\
}\
.coin-history-item .item-desc {\
  font-size: 0.9rem;\
  color: #333;\
  font-weight: 600;\
  white-space: nowrap;\
  overflow: hidden;\
  text-overflow: ellipsis;\
}\
.coin-history-item .item-time {\
  font-size: 0.75rem;\
  color: #aaa;\
  margin-top: 3px;\
}\
.coin-history-item .item-amount {\
  font-size: 1rem;\
  font-weight: 800;\
  margin-left: 12px;\
  white-space: nowrap;\
}\
.coin-history-item .item-amount.positive {\
  color: #2e7d32;\
}\
.coin-history-item .item-amount.negative {\
  color: #c62828;\
}\
.coin-history-loading {\
  text-align: center;\
  padding: 40px 20px;\
  color: #999;\
}\
.coin-history-loading .spinner {\
  display: inline-block;\
  width: 24px;\
  height: 24px;\
  border: 3px solid #f0f0f0;\
  border-top-color: #ff9800;\
  border-radius: 50%;\
  animation: coinHistSpin 0.8s linear infinite;\
}\
@keyframes coinHistSpin {\
  to { transform: rotate(360deg); }\
}\
.coin-badge, .coins-display, [data-coin-click] {\
  cursor: pointer !important;\
  user-select: none;\
  transition: transform 0.1s;\
}\
.coin-badge:active, .coins-display:active, [data-coin-click]:active {\
  transform: scale(0.95);\
}';
    document.head.appendChild(style);
  }

  // 格式化时间（转为本地时区显示）
  function formatTime(isoStr) {
    var d = new Date(isoStr);
    var now = new Date();
    var diffMs = now - d;
    var diffMin = Math.floor(diffMs / 60000);
    var diffHour = Math.floor(diffMs / 3600000);
    var diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return diffMin + '分钟前';
    if (diffHour < 24) return diffHour + '小时前';
    if (diffDay < 7) return diffDay + '天前';

    var month = d.getMonth() + 1;
    var day = d.getDate();
    var hour = String(d.getHours()).padStart(2, '0');
    var min = String(d.getMinutes()).padStart(2, '0');
    return month + '/' + day + ' ' + hour + ':' + min;
  }

  // 根据 source 生成描述
  function getSourceDesc(source, description) {
    if (description) return description;
    var map = {
      'register': '🎉 注册奖励',
      'typing_challenge': '⌨️ 打字挑战赛',
      'typing_rank': '🏅 打字排名赛',
      'game_play': '🎮 游戏消耗',
      'ai_publish': '🤖 发布AI游戏奖励',
      'admin': '👑 管理员操作'
    };
    return map[source] || source || '金币变动';
  }

  // 主函数：显示金币历史弹窗
  window.showCoinHistory = async function() {
    // 防止重复打开
    if (document.querySelector('.coin-history-overlay')) return;

    var sb = getSB();
    if (!sb) { alert('系统未就绪，请刷新页面'); return; }

    // 获取当前用户
    var user = null;
    try {
      var sessionRes = await sb.auth.getSession();
      if (sessionRes.data && sessionRes.data.session) {
        user = sessionRes.data.session.user;
      }
    } catch(e) {}
    if (!user) {
      try {
        var userRes = await sb.auth.getUser();
        user = (userRes.data && userRes.data.user) ? userRes.data.user : null;
      } catch(e) {}
    }
    if (!user) {
      alert('请先登录后查看金币记录');
      return;
    }

    // 创建弹窗
    var overlay = document.createElement('div');
    overlay.className = 'coin-history-overlay';
    overlay.innerHTML = 
      '<div class="coin-history-panel">' +
        '<div class="coin-history-header">' +
          '<h3>🪙 金币记录</h3>' +
          '<button class="coin-history-close" onclick="closeCoinHistory()">✕</button>' +
        '</div>' +
        '<div class="coin-history-body" id="coinHistoryBody">' +
          '<div class="coin-history-loading"><div class="spinner"></div><div style="margin-top:12px">加载中...</div></div>' +
        '</div>' +
      '</div>';

    // 点击遮罩关闭
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeCoinHistory();
    });

    document.body.appendChild(overlay);

    // 加载数据
    var records = [];
    var useFallback = false;

    // 尝试从 coin_transactions 表读取
    try {
      var txResult = await sb.from('coin_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (txResult.error) {
        // 表不存在或其他错误，使用 fallback
        useFallback = true;
      } else if (txResult.data && txResult.data.length > 0) {
        records = txResult.data.map(function(tx) {
          return {
            amount: tx.amount,
            description: getSourceDesc(tx.source, tx.description),
            created_at: tx.created_at
          };
        });
      } else {
        // 表存在但没数据，也尝试 fallback
        useFallback = true;
      }
    } catch(e) {
      useFallback = true;
    }

    // Fallback: 从 typing_records 读取金币记录
    if (useFallback || records.length === 0) {
      try {
        var typingResult = await sb.from('typing_records')
          .select('coins_earned, mode, level, lang, created_at')
          .eq('user_id', user.id)
          .gt('coins_earned', 0)
          .order('created_at', { ascending: false })
          .limit(50);

        if (typingResult.data && typingResult.data.length > 0) {
          var fallbackRecords = typingResult.data.map(function(r) {
            var desc = '';
            if (r.mode === 'challenge') {
              var langLabel = r.lang === 'en' ? 'English' : '古诗词';
              desc = '⌨️ 打字挑战赛 ' + langLabel + ' 第' + r.level + '级';
            } else if (r.mode === 'rank') {
              desc = '🏅 打字排名赛奖励';
            } else {
              desc = '⌨️ 打字奖励';
            }
            return {
              amount: r.coins_earned,
              description: desc,
              created_at: r.created_at
            };
          });
          // 如果 coin_transactions 没有数据，使用 fallback
          if (records.length === 0) {
            records = fallbackRecords;
          }
        }
      } catch(e) {
        // typing_records 也读取失败，忽略
      }
    }

    // 渲染列表
    var body = document.getElementById('coinHistoryBody');
    if (!body) return;

    if (records.length === 0) {
      body.innerHTML = 
        '<div class="coin-history-empty">' +
          '<div class="empty-icon">🪙</div>' +
          '<div>还没有金币记录哦</div>' +
          '<div style="margin-top:8px;color:#bbb;">去玩游戏赚取第一枚金币吧！</div>' +
        '</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var amountClass = r.amount > 0 ? 'positive' : 'negative';
      var amountText = r.amount > 0 ? ('+' + r.amount) : String(r.amount);
      html += 
        '<div class="coin-history-item">' +
          '<div class="item-left">' +
            '<div class="item-desc">' + r.description + '</div>' +
            '<div class="item-time">' + formatTime(r.created_at) + '</div>' +
          '</div>' +
          '<div class="item-amount ' + amountClass + '">' + amountText + ' 🪙</div>' +
        '</div>';
    }
    body.innerHTML = html;
  };

  // 关闭弹窗
  window.closeCoinHistory = function() {
    var overlay = document.querySelector('.coin-history-overlay');
    if (overlay) {
      overlay.style.animation = 'none';
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.15s';
      setTimeout(function() { overlay.remove(); }, 150);
    }
  };

  // ESC 键关闭
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeCoinHistory();
  });

  // 自动绑定点击事件
  function bindCoinClicks() {
    var selectors = ['.coin-badge', '.coins-display', '[data-coin-click]'];
    for (var s = 0; s < selectors.length; s++) {
      var els = document.querySelectorAll(selectors[s]);
      for (var i = 0; i < els.length; i++) {
        if (!els[i].dataset.coinBound) {
          els[i].addEventListener('click', window.showCoinHistory);
          els[i].dataset.coinBound = '1';
          els[i].title = '点击查看金币记录';
        }
      }
    }
  }

  // DOM ready 后绑定
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindCoinClicks);
  } else {
    bindCoinClicks();
  }

  // 延迟再绑定（处理动态渲染的元素）
  setTimeout(bindCoinClicks, 1000);
  setTimeout(bindCoinClicks, 3000);
})();
