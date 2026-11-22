// Exchange one pose and receive the other students and any new story checkpoint in one round trip.
export function createPresence(session, {onPeers, onCampaign, onBoat, onStatus} = {}) {
  if (!session?.code || !session.token || !session.memberId) {
    return {update() {}, dispose() {}};
  }
  const url = '/api/parties/' + encodeURIComponent(session.code) + '/presence';
  const headers = {Authorization:'Bearer ' + session.token, 'Content-Type':'application/json'};
  const stream = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2,'0')).join('');
  let snapshot = null, timer, timerAt = Infinity, pending = null, status;
  let localRevision = session.campaign?.revision ?? session.revision ?? -1;
  let lastStarted = 0, lastSuccess = 0, failures = 0;
  let disposed = false, unauthorized = false;
  let jumpAt = 0, castAt = 0, jumping = false, casting = false;

  function setStatus(value) {
    if (status === value) return;
    status = value;
    onStatus?.(value);
  }
  function cancelTimer() {
    clearTimeout(timer);
    timer = undefined;
    timerAt = Infinity;
  }
  function schedule(delay) {
    if (!snapshot || pending || disposed || unauthorized || document.hidden) return;
    const now = Date.now();
    const at = Math.max(now + delay, lastStarted + 720);
    if (timerAt <= at) return;
    cancelTimer();
    timerAt = at;
    timer = setTimeout(exchange, Math.max(0, at - now));
  }
  function pulse(timestamp, now) {
    return timestamp && now >= timestamp && now - timestamp < 2300 ? [timestamp,now-timestamp] : [null,null];
  }
  function update(pose) {
    if (disposed || !pose || !pose.sceneId || !Number.isFinite(pose.x) || !Number.isFinite(pose.z)) return;
    const now = Date.now();
    const newScene = snapshot?.sceneId !== pose.sceneId;
    if (newScene) {
      jumpAt = castAt = 0;
      jumping = casting = false;
      onPeers?.([]);
    }
    const y = Number.isFinite(pose.y) ? pose.y : 0;
    const air = Boolean(pose.jumping) || y > 0.025;
    const spell = Boolean(pose.casting);
    const motionChanged = !snapshot || snapshot.moving !== Boolean(pose.moving);
    const equipmentChanged = snapshot?.equipment !== pose.equipment;
    const newAction = (air && !jumping) || (spell && !casting);
    if (air && !jumping) jumpAt = now;
    if (spell && !casting) castAt = now;
    jumping = air;
    casting = spell;
    const escort=Number.isFinite(pose.escort)?{escort:Math.round(Math.min(1,Math.max(0,pose.escort))*100)/100}:{};
    const escortStarted=snapshot?.escort===undefined && escort.escort!==undefined;
    snapshot = {sceneId:pose.sceneId, x:pose.x, y, z:pose.z, yaw:pose.yaw || 0, moving:Boolean(pose.moving), casting:spell,equipment:pose.equipment,...escort};
    if (newScene || newAction || motionChanged || escortStarted || equipmentChanged) schedule(failures ? 1800 : 0);
  }
  async function exchange() {
    cancelTimer();
    if (!snapshot || pending || disposed || unauthorized || document.hidden) return;
    const sent = {...snapshot};
    const now = Date.now();
    lastStarted = now;
    [sent.jumpId,sent.jumpAge] = pulse(jumpAt,now);
    [sent.castId,sent.castAge] = pulse(castAt,now);
    sent.stream = stream;
    sent.revision = Math.max(localRevision,session.campaign?.revision ?? -1);
    const controller = new AbortController();
    pending = controller;
    const timeout = setTimeout(() => controller.abort(), 8500);
    let delay = 1200;
    try {
      const response = await fetch(url,{method:'POST',headers,cache:'no-store',body:JSON.stringify(sent),signal:controller.signal});
      if (disposed || document.hidden || pending !== controller) return;
      if (response.status === 401 || response.status === 404) {
        unauthorized = true;
        onPeers?.([]);
        setStatus('unauthorized');
        return;
      }
      if (!response.ok) throw new Error('presence unavailable');
      const data = await response.json();
      if (disposed || document.hidden || pending !== controller) return;
      lastSuccess = Date.now();
      failures = 0;
      setStatus('online');
      if (data.campaign && data.revision >= localRevision) onCampaign?.(data.campaign);
      localRevision = Math.max(localRevision,data.revision);
      if (disposed) return;
      const peers = data.peers ?? [];
      if (snapshot.sceneId === sent.sceneId) {
        onPeers?.(peers);
        if(sent.sceneId==='chapter-lake'&&data.boat)onBoat?.({boat:data.boat,serverNow:data.serverNow});
      }
      const busy = snapshot.moving || peers.some(peer => peer.moving || peer.jumping || peer.casting);
      delay = busy || (Date.now()-jumpAt < 1500) || (Date.now()-castAt < 1500) ? 850 : peers.length ? 1450 : 2800;
    } catch {
      if (disposed || document.hidden || pending !== controller) return;
      if (Date.now() - lastSuccess > 15000) onPeers?.([]);
      failures++;
      setStatus('reconnecting');
      delay = Math.min(12000,1200 * 2 ** Math.min(4,failures-1));
    } finally {
      clearTimeout(timeout);
      if (pending === controller) {
        pending = null;
        schedule(snapshot?.sceneId !== sent.sceneId || snapshot?.equipment !== sent.equipment ? 0 : delay);
      }
    }
  }
  function pause() {
    cancelTimer();
    pending?.abort();
    pending = null;
    onPeers?.([]);
    if (!lastStarted || unauthorized) return;
    // The stream restriction leaves a newer tab or replacement world intact.
    fetch(url,{method:'POST',headers,keepalive:true,body:JSON.stringify({stream,leave:true})}).catch(() => {});
  }
  function visibility() {
    if (document.hidden) pause();
    else schedule(0);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    document.removeEventListener('visibilitychange',visibility);
    window.removeEventListener('pagehide',pause);
    pause();
  }
  document.addEventListener('visibilitychange',visibility);
  window.addEventListener('pagehide',pause);
  return {update,dispose};
}
