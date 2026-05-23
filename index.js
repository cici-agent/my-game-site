// ===== 首页 - 轮播 & 分类 & 游戏列表加载 =====

document.addEventListener('DOMContentLoaded', function() {
  // ---- 轮播自动播放 ----
  var slides = document.querySelectorAll('.banner-slide');
  var dots = document.querySelectorAll('.banner-dots .dot');
  var currentSlide = 0;

  function showSlide(index) {
    slides.forEach(function(s) { s.classList.remove('active'); });
    dots.forEach(function(d) { d.classList.remove('active'); });
    slides[index].classList.add('active');
    dots[index].classList.add('active');
    currentSlide = index;
  }

  function nextSlide() {
    showSlide((currentSlide + 1) % slides.length);
  }

  var autoPlay = setInterval(nextSlide, 4000);

  dots.forEach(function(dot) {
    dot.addEventListener('click', function() {
      clearInterval(autoPlay);
      showSlide(parseInt(this.dataset.index));
      autoPlay = setInterval(nextSlide, 4000);
    });
  });

  // ---- 分类导航点击 ----
  var categoryLinks = document.querySelectorAll('.category-list a');
  var currentCategory = 'all';

  categoryLinks.forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      categoryLinks.forEach(function(l) { l.classList.remove('active'); });
      this.classList.add('active');
      currentCategory = this.dataset.category;
      loadGames(currentCategory);
    });
  });

  // ---- 从 Supabase 加载游戏列表 ----
  function loadGames(category) {
    var sb = getSupabase();
    if (!sb) {
      showPlaceholderGames();
      return;
    }

    var query = sb.from('games').select('*').eq('status', 'online');

    if (category && category !== 'all' && category !== 'new' && category !== 'hot') {
      query = query.eq('category', category);
    }
    if (category === 'new') {
      query = query.order('created_at', { ascending: false }).limit(20);
    } else if (category === 'hot') {
      query = query.order('play_count', { ascending: false }).limit(20);
    } else {
      query = query.order('created_at', { ascending: false }).limit(40);
    }

    query.then(function(result) {
      var games = result.data;
      if (!games || games.length === 0) {
        showEmptyGames();
        return;
      }
      renderGames(games);
    }).catch(function() {
      showPlaceholderGames();
    });
  }

  function renderGames(games) {
    var grid = document.getElementById('gamesGrid');
    var html = '';
    var coverColors = [
      'linear-gradient(135deg, #ff6b35, #ffd166)',
      'linear-gradient(135deg, #4a90e2, #4ecdc4)',
      'linear-gradient(135deg, #a855f7, #ff6b9d)',
      'linear-gradient(135deg, #52c41a, #4ecdc4)',
      'linear-gradient(135deg, #ffd166, #ff6b35)',
      'linear-gradient(135deg, #ff6b9d, #a855f7)'
    ];
    var categoryEmojis = {
      shooter: '💥', tower: '🏰', learn: '📚', runner: '🏃',
      casual: '🎪', nurture: '🌱', rpg: '⚔️', other: '🎮'
    };

    games.forEach(function(game, i) {
      var bg = coverColors[i % coverColors.length];
      var emoji = categoryEmojis[game.category] || '🎮';
      var coverHtml = '';
      if (game.cover_url) {
        coverHtml = '<div class="card-cover" style="background:' + bg + '"><img src="' + game.cover_url + '" alt="' + (game.title || game.name) + '" style="width:100%;height:100%;object-fit:cover;"></div>';
      } else {
        coverHtml = '<div class="card-cover" style="background:' + bg + '">' + emoji + '</div>';
      }
      html += '<a href="game.html?id=' + game.id + '" class="game-card" onclick="return goToGame(event, \'' + game.id + '\')">' +
        coverHtml +
        '<div class="card-info">' +
          '<h3>' + (game.title || game.name) + '</h3>' +
          '<div class="card-meta">' +
            '<span>' + (game.category || '其他') + '</span>' +
            '<span class="rating">⭐ ' + (game.rating || '0') + '</span>' +
          '</div>' +
        '</div>' +
      '</a>';
    });
    grid.innerHTML = html;
  }

  function showEmptyGames() {
    var grid = document.getElementById('gamesGrid');
    grid.innerHTML = '<div class="loading-tip">🐣 还没有游戏，快去<a href="editor.html" style="color:var(--primary);font-weight:700;">做一个</a>吧！</div>';
  }

  function showPlaceholderGames() {
    // 展示占位游戏卡片（数据库无数据或未连接时）
    var grid = document.getElementById('gamesGrid');
    var placeholders = [
      { name: '太空冒险', cat: '射击', emoji: '🚀', rating: '4.8', color: 'cover-1' },
      { name: '猫咪跑酷', cat: '跑酷', emoji: '🐱', rating: '4.6', color: 'cover-2' },
      { name: '魔法学院', cat: 'RPG', emoji: '🧙', rating: '4.9', color: 'cover-3' },
      { name: '城堡守卫', cat: '塔防', emoji: '🏰', rating: '4.5', color: 'cover-4' },
      { name: '数学大冒险', cat: '学习', emoji: '🧮', rating: '4.7', color: 'cover-5' },
      { name: '花园物语', cat: '养成', emoji: '🌸', rating: '4.4', color: 'cover-6' }
    ];
    var html = '';
    placeholders.forEach(function(g) {
      html += '<a href="game.html" class="game-card" onclick="return goToGame(event, null)">' +
        '<div class="card-cover ' + g.color + '">' + g.emoji + '</div>' +
        '<div class="card-info">' +
          '<h3>' + (g.title || g.name) + '</h3>' +
          '<div class="card-meta">' +
            '<span>' + g.cat + '</span>' +
            '<span class="rating">⭐ ' + g.rating + '</span>' +
          '</div>' +
        '</div>' +
      '</a>';
    });
    grid.innerHTML = html;
  }

  // 初始加载
  loadGames('all');
});

// 游戏卡片点击 - 登录拦截
async function goToGame(e, gameId) {
  e.preventDefault();
  var dest = gameId ? ('game.html?id=' + gameId) : 'game.html';
  var loggedIn = await requireLogin(dest);
  if (loggedIn) window.location.href = dest;
  return false;
}



