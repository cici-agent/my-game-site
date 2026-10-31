// ===== 登录 / 注册弹窗（降落到任何星球时，没登录就弹出） =====
// 复用 auth.js 里的 signIn / signUpWithAvatar

const BAD_WORDS = ['poop', 'shit', 'fuck', 'bitch', 'damn', 'sex', 'porn', 'kill',
  '傻', '笨蛋', '蠢', '死', '屎', '尿', '屁', '滚', '妈的', '他妈', '操', '草泥', '日你', '贱', '婊', '色情', '黄色', '杀'];
export function nameProblem(name) {
  if (!name) return '请输入名字';
  if (name.length < 2 || name.length > 12) return '名字要 2 到 12 个字';
  if (!/^[一-龥A-Za-z0-9_]+$/.test(name)) return '名字只能用中文、字母、数字和下划线';
  const low = name.toLowerCase();
  if (BAD_WORDS.some(w => low.includes(w))) return '这个名字不太合适，换一个好听的吧';
  return '';
}

const AVATARS = Array.from({ length: 12 }, (_, i) => `assets/avatars/avatar_${String(i + 1).padStart(2, '0')}.png`);

let el, resolver, mode = 'login', avatar = AVATARS[0];

function build() {
  el = document.createElement('div');
  el.id = 'loginModal';
  el.innerHTML = `
    <div class="lm-box">
      <div class="lm-planet" id="lmPlanet"></div>
      <div class="lm-tabs"><button data-m="login" class="on">登录</button><button data-m="register">注册新账号</button></div>
      <label>名字<input id="lmName" maxlength="12" autocomplete="username" placeholder="你的名字"></label>
      <label>密码<input id="lmPwd" type="password" maxlength="32" autocomplete="current-password" placeholder="至少 6 位"></label>
      <div class="lm-reg">
        <label>再输一次密码<input id="lmPwd2" type="password" maxlength="32" autocomplete="new-password"></label>
        <div class="lm-sub">选一个头像</div>
        <div class="lm-avatars">${AVATARS.map((a, i) => `<img src="${a}" data-a="${a}" class="${i ? '' : 'on'}" alt="">`).join('')}</div>
        <div class="lm-sub">名字会显示在你的飞船上，大家都能看到哦</div>
      </div>
      <div class="lm-err" id="lmErr"></div>
      <button class="lm-go" id="lmGo">登录</button>
      <button class="lm-cancel" id="lmCancel">先不登录，继续飞</button>
    </div>`;
  document.body.appendChild(el);
  el.querySelectorAll('.lm-tabs button').forEach(b => b.onclick = () => setMode(b.dataset.m));
  el.querySelectorAll('.lm-avatars img').forEach(img => img.onclick = () => {
    el.querySelectorAll('.lm-avatars img').forEach(i => i.classList.remove('on')); img.classList.add('on'); avatar = img.dataset.a;
  });
  el.querySelector('#lmGo').onclick = submit;
  el.querySelector('#lmCancel').onclick = () => close(false);
  el.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') submit(); if (e.key === 'Escape') close(false); });
  el.addEventListener('keyup', e => e.stopPropagation());
}
function setMode(m) {
  mode = m;
  el.querySelectorAll('.lm-tabs button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  el.classList.toggle('reg', m === 'register');
  el.querySelector('#lmGo').textContent = m === 'login' ? '登录' : '注册并进入';
  el.querySelector('#lmErr').textContent = '';
}
async function submit() {
  const name = el.querySelector('#lmName').value.trim(), pwd = el.querySelector('#lmPwd').value;
  const err = el.querySelector('#lmErr'), go = el.querySelector('#lmGo');
  err.textContent = '';
  if (mode === 'register') {
    const p = nameProblem(name); if (p) { err.textContent = p; return; }
    if (pwd.length < 6) { err.textContent = '密码至少 6 位'; return; }
    if (pwd !== el.querySelector('#lmPwd2').value) { err.textContent = '两次密码不一样'; return; }
  } else if (!name || !pwd) { err.textContent = '请输入名字和密码'; return; }
  go.disabled = true; go.textContent = '请稍等…';
  try {
    const r = mode === 'login' ? await signIn(name, pwd) : await signUpWithAvatar(name, pwd, avatar);
    if (r.error) { err.textContent = /already|registered|exists/i.test(r.error) ? '这个名字已经有人用了' : r.error; return; }
    close(true);
  } catch (e) { err.textContent = '网络有点问题，再试一次'; }
  finally { go.disabled = false; go.textContent = mode === 'login' ? '登录' : '注册并进入'; }
}
function close(ok) { el.classList.remove('show'); const r = resolver; resolver = null; r && r(ok); }

// 打开弹窗，返回 Promise<boolean>：true = 登录成功
export function askLogin(planet) {
  if (!el) build();
  setMode('login');
  el.querySelector('#lmPlanet').innerHTML = planet
    ? `<span style="font-size:40px">${planet.icon}</span><div>要进入 <b>${planet.name}</b>，先登录一下吧</div>`
    : '<div>登录小菜鸟宇宙</div>';
  el.style.setProperty('--c', planet ? planet.color : '#FF6B35');
  el.classList.add('show');
  setTimeout(() => el.querySelector('#lmName').focus(), 50);
  return new Promise(r => resolver = r);
}
