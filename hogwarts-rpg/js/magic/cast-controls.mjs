/** Return the adjacent student in a circular cast list. */
export function cycleCast(ids, current, direction) {
  if (!ids.length) return null;
  const index = ids.indexOf(current);
  if (index < 0) return direction < 0 ? ids.at(-1) : ids[0];
  return ids[(index + Math.sign(direction) + ids.length) % ids.length];
}

const editable = node => node?.isContentEditable || node?.closest?.('input, textarea, select, [role="textbox"]');
const nativeButton = node => node?.closest?.('button, a[href], [role="button"]');

export function bindCastControls({surface, isActive, step, confirm, rotate, onInputMode}) {
  const doc = surface.ownerDocument;
  const win = doc.defaultView;
  const dialog = surface.closest('dialog, [role="dialog"]');
  const bindings = [];
  let pointer = null;
  let frame = null;
  let disposed = false;
  let inputMode;
  let gamepadIndex = null;
  let stickDirection = 0;
  let confirmHeld = true;
  let armed = false;

  function active(target) {
    if (disposed || doc.hidden || !isActive() || editable(target)) return false;
    const openDialog = target?.closest?.('dialog[open], [role="dialog"]');
    return !openDialog || openDialog === dialog;
  }
  function report(mode) {
    if (mode !== inputMode) {
      inputMode = mode;
      onInputMode?.(mode);
    }
  }
  function bind(node, type, handler, options) {
    node.addEventListener(type, handler, options);
    bindings.push(() => node.removeEventListener(type, handler, options));
  }

  function keydown(event) {
    if (!active(event.target) || event.defaultPrevented || event.isComposing ||
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const code = event.code || event.key;
    let direction = 0, turn = 0;
    switch (code) {
      case 'KeyA': case 'a': case 'A': case 'ArrowLeft': direction = -1; break;
      case 'KeyD': case 'd': case 'D': case 'ArrowRight': direction = 1; break;
      case 'KeyQ': case 'q': case 'Q': turn = -1; break;
      case 'KeyE': case 'e': case 'E': turn = 1; break;
      case 'Enter': case 'NumpadEnter': case 'Space': case ' ':
        // A focused menu button uses its own native keyboard activation.
        if (nativeButton(event.target)) return;
        break;
      default: return;
    }
    event.preventDefault();
    if (event.repeat && !turn) return;
    report('keyboard');
    if (direction) step(direction);
    else if (turn) rotate(turn * Math.PI / 12);
    else confirm();
  }

  function cancelPointer() {
    const id = pointer?.id;
    pointer = null;
    if (id != null && surface.hasPointerCapture?.(id)) surface.releasePointerCapture(id);
  }
  function pointerdown(event) {
    if (!active(event.target) || nativeButton(event.target) || event.button !== 0 ||
        event.isPrimary === false || pointer) {
      if (pointer && event.pointerId !== pointer.id) cancelPointer();
      return;
    }
    pointer = {id:event.pointerId, x:event.clientX, type:event.pointerType};
    surface.setPointerCapture?.(event.pointerId);
  }
  function pointermove(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (!active(event.target)) { cancelPointer(); return; }
    const dx = event.clientX - pointer.x;
    pointer.x = event.clientX;
    if (!dx) return;
    report(pointer.type === 'touch' ? 'touch' : 'pointer');
    rotate(dx * .012);
  }
  function pointerup(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    pointermove(event);
    cancelPointer();
  }
  function cancelEvent(event) {
    if (event.pointerId === pointer?.id) cancelPointer();
  }

  function reset() {
    cancelPointer();
    gamepadIndex = null;
    armed = false;
    stickDirection = 0;
    confirmHeld = true;
  }
  function pollGamepad() {
    frame = null;
    if (disposed) return;
    if (active(doc.activeElement) && doc.hasFocus()) {
      let pads;
      // Some embedding origins disable Gamepad access through permissions policy.
      try { pads = win.navigator.getGamepads(); } catch { return; }
      const pad = Array.from(pads).find(p => p?.connected && p.mapping === 'standard');
      if (pad) {
        const axis = pad.axes[0] || 0;
        const left = pad.buttons[14]?.pressed;
        const right = pad.buttons[15]?.pressed;
        const pressed = Boolean(pad.buttons[0]?.pressed);
        const dead = Math.abs(axis) < .30 && !left && !right;
        if (pad.index !== gamepadIndex) {
          gamepadIndex = pad.index;
          armed = false;
          stickDirection = 0;
          confirmHeld = true;
        }
        if (!armed) {
          // A button already held when returning from another menu must be released first.
          if (dead && !pressed) { armed = true; confirmHeld = false; }
        } else {
          const direction = left || axis < -.60 ? -1 : right || axis > .60 ? 1 : 0;
          if (direction && direction !== stickDirection) {
            report('gamepad');
            step(direction);
            stickDirection = direction;
          } else if (dead) stickDirection = 0;
          if (pressed && !confirmHeld) { report('gamepad'); confirm(); }
          confirmHeld = pressed;
        }
      } else gamepadIndex = null;
    } else {
      armed = false;
    }
    if (!disposed) frame = win.requestAnimationFrame(pollGamepad);
  }

  bind(win, 'keydown', keydown, true);
  bind(surface, 'pointerdown', pointerdown);
  bind(surface, 'pointermove', pointermove);
  bind(surface, 'pointerup', pointerup);
  bind(surface, 'pointercancel', cancelEvent);
  bind(surface, 'lostpointercapture', cancelEvent);
  bind(win, 'blur', reset);
  bind(doc, 'visibilitychange', reset);
  if (typeof win.navigator?.getGamepads === 'function' && win.requestAnimationFrame) {
    frame = win.requestAnimationFrame(pollGamepad);
  }

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      reset();
      if (frame != null) win.cancelAnimationFrame(frame);
      for (const remove of bindings) remove();
    }
  };
}
