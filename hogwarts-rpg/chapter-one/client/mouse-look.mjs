// Pointer lock is entered only from an explicit click. UI panels and focus loss
// release it; closing a panel never captures the cursor again on its own.
export function createMouseLook(canvas, { document: doc, window: win, enabled, onLook, onState, onRelease, now = () => performance.now() }) {
  const supported = typeof canvas.requestPointerLock === 'function', listeners = [];
  let wanted = false, pending = false, failed = false, drag = null, disposed = false, wasLocked = false, requestedExit = false, requestId = 0, escapeUntil = 0, stamp = '';
  const ownsPointer = () => doc.pointerLockElement === canvas;
  const locked = () => ownsPointer() && wanted && enabled() && !disposed;
  const state = () => ({ mode: locked() ? 'locked' : drag ? 'drag' : failed || !supported ? 'unavailable' : 'free', locked: locked(), canCapture: supported && enabled() && !disposed, pending });
  function publish() { const value = state(), next = JSON.stringify(value); if (next !== stamp) { stamp = next; onState?.(value); } }
  function clearDrag() {
    const id = drag?.pointerId; drag = null;
    if (id !== undefined && canvas.hasPointerCapture?.(id)) { try { canvas.releasePointerCapture(id); } catch {} }
  }
  function exitPointer() { if (ownsPointer() && !requestedExit) { requestedExit = true; try { doc.exitPointerLock?.(); } catch { requestedExit = false; } } }
  function release() {
    const active = ownsPointer() && wanted || pending || Boolean(drag);
    const consumed = ownsPointer() || active || escapeUntil > now();
    escapeUntil = 0; wanted = false; pending = false; requestId++; clearDrag(); exitPointer();
    if (active) onRelease?.(); publish(); return consumed;
  }
  function rejected(id) {
    if (disposed || id !== requestId || locked()) return;
    wanted = pending = false; failed = true; publish();
  }
  function request() {
    if (disposed || !enabled() || !supported) { publish(); return false; }
    if (locked() || pending) return true;
    clearDrag(); wanted = pending = true; failed = false; escapeUntil = 0;
    const id = ++requestId;
    try { const result = canvas.requestPointerLock(); result?.then?.(() => { if (disposed || !enabled() || !wanted) exitPointer(); }, () => rejected(id)); }
    catch { rejected(id); }
    publish(); return true;
  }
  function sync() { if (!enabled()) release(); else publish(); }
  function listen(target, type, handler, options) { target.addEventListener(type, handler, options); listeners.push([target, type, handler, options]); }
  listen(doc, 'pointerlockchange', () => {
    const actual = ownsPointer();
    if (actual && (disposed || !enabled() || !wanted)) { exitPointer(); publish(); return; }
    const lost = wasLocked && !actual; wasLocked = actual; pending = false;
    if (lost) {
      wanted = false; clearDrag();
      // Some browsers report unlock before delivering that same Escape key.
      if (!requestedExit) { escapeUntil = now() + 250; onRelease?.(); }
    }
    requestedExit = false; publish();
  });
  listen(doc, 'pointerlockerror', () => rejected(requestId));
  listen(doc, 'mousemove', event => {
    if (!locked()) return;
    if (Number.isFinite(event.movementX) && Number.isFinite(event.movementY)) onLook(event.movementX, event.movementY);
  });
  listen(canvas, 'pointermove', event => {
    if (locked() || !enabled() || !drag || event.pointerId !== drag.pointerId) return;
    if (event.buttons !== undefined && !(event.buttons & 2)) { clearDrag(); publish(); return; }
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Number.isFinite(dx) && Number.isFinite(dy)) onLook(dx, dy);
    drag.x = event.clientX; drag.y = event.clientY;
  });
  const finishDrag = event => { if (drag && (event.pointerId === undefined || event.pointerId === drag.pointerId)) { clearDrag(); publish(); } };
  listen(canvas, 'pointerup', finishDrag); listen(canvas, 'pointercancel', finishDrag); listen(canvas, 'lostpointercapture', finishDrag);
  listen(win, 'blur', release); listen(doc, 'visibilitychange', () => { if (doc.hidden) release(); });
  function pointerDown(event) {
    if (!enabled() || disposed || event.pointerType === 'touch') return false;
    if (event.button === 2) {
      event.preventDefault();
      if (!locked()) {
        drag = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
        try { canvas.setPointerCapture?.(event.pointerId); } catch {}
        publish();
      }
      return true;
    }
    // The first click takes control without firing. After a rejected/unsupported
    // lock, normal cursor targeting and right-drag remain usable immediately.
    if (event.button === 0 && !locked() && !failed && supported) return request();
    return false;
  }
  publish();
  return { request, release, sync, pointerDown, getState: state, dispose() { release(); disposed = true; for (const [target, type, handler, options] of listeners) target.removeEventListener(type, handler, options); publish(); } };
}
