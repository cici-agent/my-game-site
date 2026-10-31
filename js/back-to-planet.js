// ===== 宇宙外的页面：去掉传统顶部导航，换成"🚀 回到 X 星球"悬浮按钮 =====
// 用法：在页面末尾 <script src="/js/back-to-planet.js"></script>
(function () {
  if (window.top !== window.self) return; // 在 game.html 的 iframe 里运行的游戏不处理

  var DEFAULT = { plaza: ['菜鸟星球', '🐣'], games: ['游戏星球', '🎮'], coins: ['金币星球', '🪙'], create: ['创作星球', '🎨'], home: ['我的星球', '🏠'] };
  var names = DEFAULT;
  try { var cached = JSON.parse(sessionStorage.getItem('xcn_planets') || 'null'); if (cached) names = Object.assign({}, DEFAULT, cached); } catch (e) {}

  // 这个页面属于哪个星球：URL 上的 from 参数优先，其次按页面判断，最后用上一次记住的
  var path = location.pathname;
  var guess =
    /\/games\/(typing-challenge|typing-rank|math-challenge|spelling-bee|grammar-challenge|listening-challenge)\//.test(path) ? 'coins' :
    /\/games\//.test(path) ? 'games' :
    /learn\.html$/.test(path) ? 'coins' :
    /(editor|upload)\.html$/.test(path) ? 'create' :
    /(admin|profile)\.html$/.test(path) ? 'home' :
    /game\.html$/.test(path) ? 'games' : '';
  var from = new URLSearchParams(location.search).get('from');
  var kind = (from && names[from]) ? from : (guess || sessionStorage.getItem('xcn_from') || '');
  if (kind) sessionStorage.setItem('xcn_from', kind);
  var target = kind ? '/index.html?land=' + kind : '/index.html';
  var label = kind ? '回到' + names[kind][0] : '回到宇宙';

  function isHome(href) {
    if (!href) return false;
    try { var u = new URL(href, location.href); }
    catch (e) { return false; }
    if (u.origin !== location.origin && !/cici2\.fun$/.test(u.hostname)) return false;
    return /^\/(index\.html)?$/.test(u.pathname) && !/[?&]land=/.test(u.search);
  }

  function apply() {
    // 1. 隐藏顶部导航里的"菜单"（首页 / 学习 / 做游戏…这些快捷入口），保留页面自己的功能按钮
    document.querySelectorAll('body > nav, nav.navbar, nav.editor-nav').forEach(function (nav) {
      Array.prototype.forEach.call(nav.children, function (c) {
        var keep = c.classList.contains('nav-right') || c.classList.contains('nav-title');
        if (!keep) c.style.display = 'none';
      });
      // 导航条里什么都不剩就整个藏起来
      var visible = Array.prototype.some.call(nav.children, function (c) { return c.style.display !== 'none'; });
      if (!visible) nav.style.display = 'none';
    });
    document.querySelectorAll('.nav-btn-back').forEach(function (b) { b.style.display = 'none'; });

    // 2. 所有"回首页"的链接都改成回到对应星球
    document.querySelectorAll('a[href]').forEach(function (a) {
      if (isHome(a.getAttribute('href'))) {
        a.setAttribute('href', target);
        if (/返回|首页/.test(a.textContent) && a.textContent.length < 12) a.textContent = '🚀 ' + label;
      }
    });

    // 3. 悬浮按钮
    if (!document.getElementById('xcnBack')) {
      var btn = document.createElement('a');
      btn.id = 'xcnBack'; btn.href = target;
      btn.innerHTML = '🚀 ' + label;
      btn.style.cssText = 'position:fixed;left:12px;bottom:14px;z-index:99999;background:linear-gradient(135deg,#1a1446,#3a2a8c);color:#fff;' +
        'padding:10px 16px;border-radius:999px;font:800 15px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;text-decoration:none;' +
        'box-shadow:0 6px 20px rgba(26,20,70,.45),0 0 0 2px rgba(255,255,255,.25) inset;display:flex;align-items:center;gap:6px;';
      document.body.appendChild(btn);
    }
  }

  // 代码里直接写 location.href='index.html' 的地方也拦一下
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (a && isHome(a.getAttribute('href'))) { e.preventDefault(); location.href = target; }
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
  // auth.js 等脚本可能晚一点才往导航里填内容，再跑一次
  setTimeout(apply, 800);
})();
