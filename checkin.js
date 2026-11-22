// ===== 每日签到功能 =====
// 在菜鸟星球页面（park.html）加载，提供签到按钮和抽奖动画
// 依赖：auth.js（getCurrentUser / getUserProfile）、supabase.js（getSupabase）

(function () {
  'use strict';

  // 获取北京时间日期字符串 YYYY-MM-DD
  function beijingDate() {
    try {
      return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    } catch (e) {
      // fallback: 手动 UTC+8
      var d = new Date(Date.now() + 8 * 3600 * 1000);
      return d.toISOString().slice(0, 10);
    }
  }

  var btn = null;
  var busy = false;

  // 初始化签到按钮
  function initButton() {
    if (btn) return;
    btn = document.createElement('button');
    btn.id = 'checkinBtn';
    btn.style.cssText = [
      'position:fixed',
      'left:14px',
      'top:calc(var(--top-h,56px) + 50px)',
      'z-index:9',
      'border:2px solid #ffd23f',
      'background:rgba(26,20,70,.82)',
      'color:#fff',
      'font:800 14px inherit',
      'font-family:inherit',
      'padding:8px 16px',
      'border-radius:999px',
      'cursor:pointer',
      'box-shadow:0 4px 14px rgba(0,0,0,.3)',
      'transition:all .25s',
      'display:none'
    ].join(';');
    btn.textContent = '📅 签到';
    btn.onclick = onClick;
    document.body.appendChild(btn);

    // 签到结果弹窗
    var modal = document.createElement('div');
    modal.id = 'checkinModal';
    modal.style.cssText = [
      'position:fixed',
      'top:0;left:0;right:0;bottom:0',
      'background:rgba(0,0,0,.5)',
      'z-index:99999',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'padding:16px'
    ].join(';');
    modal.innerHTML = '<div id="checkinPanel" style="background:#fff;border-radius:24px;max-width:360px;width:100%;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.25);text-align:center;">' +
      '<div style="background:linear-gradient(135deg,#ff922b,#fcc419);padding:24px 20px 16px;color:#fff">' +
      '<div style="font-size:48px;line-height:1" id="checkinEmoji">🎁</div>' +
      '<h2 style="margin:8px 0 0;font-size:22px" id="checkinTitle">签到成功！</h2>' +
      '</div>' +
      '<div style="padding:20px;color:#333">' +
      '<div id="checkinDetail" style="font-size:16px;line-height:1.8"></div>' +
      '<button id="checkinClose" style="margin-top:16px;border:0;background:linear-gradient(135deg,#ff922b,#fcc419);color:#fff;font:800 15px inherit;font-family:inherit;padding:10px 28px;border-radius:999px;cursor:pointer">好的</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(modal);
    document.getElementById('checkinClose').onclick = function () {
      modal.style.display = 'none';
    };
    modal.onclick = function (e) {
      if (e.target === modal) modal.style.display = 'none';
    };
  }

  // 显示签到弹窗
  function showModal(data) {
    var modal = document.getElementById('checkinModal');
    var detail = document.getElementById('checkinDetail');
    var emoji = document.getElementById('checkinEmoji');
    var title = document.getElementById('checkinTitle');

    title.textContent = '签到成功！';
    var lotteryText = data.lottery_coins === 5 ? '🪙 5 金币' : data.lottery_coins === 10 ? '🪙 10 金币' : '🪙 15 金币';
    emoji.textContent = '🎉';
    detail.innerHTML =
      '<div style="font-size:14px;color:#868e96;margin-bottom:8px">连续签到 <b style="color:#e67700">' + data.streak + '</b> 天</div>' +
      '<div style="margin-bottom:6px">📅 签到奖励：<b style="color:#e67700">+' + data.fixed_coins + ' 金币</b></div>' +
      '<div style="margin-bottom:6px">🎰 抽奖结果：<b style="color:#e67700">' + lotteryText + '</b></div>' +
      '<div style="margin-top:12px;padding:10px;background:#fff8e1;border-radius:12px;font-size:18px;font-weight:900;color:#e67700">本次共获得 ' + data.total + ' 金币 🪙</div>' +
      '<div style="margin-top:8px;font-size:13px;color:#868e96">当前余额：' + data.coins + ' 金币</div>';
    modal.style.display = 'flex';
  }

  // 点击签到按钮
  async function onClick() {
    if (busy) return;
    busy = true;
    btn.style.opacity = '0.6';

    try {
      var sb = getSupabase();
      if (!sb) {
        alert('页面还没加载好，请稍等再试');
        return;
      }

      // 检查登录
      var user = await getCurrentUser();
      if (!user) {
        window.location.href = 'login.html?redirect=park.html';
        return;
      }

      // 调用签到 RPC
      var result = await sb.rpc('daily_checkin');

      if (result.error) {
        var msg = result.error.message || '';
        if (/already_checked_in/.test(msg)) {
          btn.textContent = '✅ 今日已签到';
          btn.disabled = true;
          btn.style.opacity = '0.6';
          // 静默处理，不弹错误
        } else if (/not_logged_in/.test(msg)) {
          window.location.href = 'login.html?redirect=park.html';
        } else {
          alert('签到出错了：' + msg);
        }
        return;
      }

      var data = result.data;
      if (!data) {
        alert('签到失败了，请刷新再试');
        return;
      }

      // 更新按钮状态
      btn.textContent = '✅ 今日已签到';
      btn.disabled = true;
      btn.style.opacity = '0.7';

      // 更新金币显示
      var coinNum = document.getElementById('coinNum');
      if (coinNum && typeof data.coins === 'number') {
        coinNum.textContent = data.coins;
      }

      // 显示结果弹窗
      showModal(data);
    } catch (e) {
      console.error('checkin error', e);
      alert('签到出错了，请刷新再试');
    } finally {
      busy = false;
      btn.style.opacity = '1';
    }
  }

  // 检查签到状态并更新按钮
  async function checkStatus() {
    try {
      var user = await getCurrentUser();
      if (!user) {
        btn.style.display = 'none';
        return;
      }

      var profile = await getUserProfile(user.id);
      if (!profile) {
        btn.style.display = 'none';
        return;
      }

      var today = beijingDate();
      var lastCheckin = profile.last_checkin_date;

      // last_checkin_date 可能是字符串或 Date 对象
      if (lastCheckin) {
        var lastStr = typeof lastCheckin === 'string' ? lastCheckin.slice(0, 10) :
          (lastCheckin instanceof Date ? lastCheckin.toISOString().slice(0, 10) : String(lastCheckin).slice(0, 10));

        if (lastStr === today) {
          btn.textContent = '✅ 今日已签到';
          btn.disabled = true;
          btn.style.opacity = '0.7';
        } else {
          btn.textContent = '📅 签到';
          btn.disabled = false;
          btn.style.opacity = '1';
        }
      } else {
        btn.textContent = '📅 签到';
        btn.disabled = false;
        btn.style.opacity = '1';
      }
      btn.style.display = 'block';
    } catch (e) {
      // 静默失败
    }
  }

  // 等待页面加载完成
  function start() {
    initButton();
    // 延迟检查，等 supabase 初始化
    setTimeout(checkStatus, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
