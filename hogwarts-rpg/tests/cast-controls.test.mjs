import test from 'node:test';
import assert from 'node:assert/strict';
import {bindCastControls,cycleCast} from '../js/magic/cast-controls.mjs';

class InputTarget extends EventTarget {
  emit(type, fields = {}) {
    const event = new Event(type, {cancelable:true});
    for (const [field,value] of Object.entries(fields)) Object.defineProperty(event, field, {value});
    this.dispatchEvent(event);
    return event;
  }
}

function fixture(t, gamepad) {
  const win = new InputTarget();
  const doc = new InputTarget();
  const surface = new InputTarget();
  const dialog = {};
  doc.defaultView = win;
  doc.activeElement = surface;
  doc.hasFocus = () => true;
  surface.ownerDocument = doc;
  surface.clientWidth = 600;
  surface.closest = query => query.includes('dialog') ? dialog : null;
  const captured = new Set();
  surface.setPointerCapture = id => captured.add(id);
  surface.hasPointerCapture = id => captured.has(id);
  surface.releasePointerCapture = id => captured.delete(id);
  let nextFrame;
  win.requestAnimationFrame = callback => { nextFrame = callback; return 42; };
  win.cancelAnimationFrame = () => { nextFrame = null; };
  win.navigator = gamepad ? {getGamepads:() => [gamepad]} : {};
  let enabled = true;
  const events = [];
  const controls = bindCastControls({
    surface, isActive:() => enabled, step:n => events.push(['step',n]), confirm:() => events.push(['confirm']),
    rotate:radians => events.push(['rotate',radians])
  });
  t.after(() => controls.dispose());
  return {
    win,doc,surface,dialog,captured,controls,events,enable:value=>{enabled=value;},frame:()=>nextFrame?.(),
    key:(code,fields) => win.emit('keydown',{code,target:surface,...fields}),
    pointer:(type,x,y,fields) => surface.emit(type,{clientX:x,clientY:y,pointerId:7,pointerType:'touch',button:0,isPrimary:true,...fields})
  };
}

test('cast selection wraps in either direction and can recover a missing selection', () => {
  const ids = ['harry','ron','hermione','neville','george'];
  assert.equal(cycleCast(ids,'harry',-1),'george');
  assert.equal(cycleCast(ids,'george',1),'harry');
  assert.equal(cycleCast(ids,'hermione',-1),'ron');
  assert.equal(cycleCast(ids,'unknown',1),'harry');
  assert.equal(cycleCast([],'harry',1),null);
});

test('game keys respect focus, repeat, composition, active overlays, and disposal', t => {
  const f=fixture(t);
  assert(f.key('KeyA').defaultPrevented);
  f.key('ArrowRight'); f.key('KeyQ'); f.key('KeyE'); f.key('Space'); f.key('Enter',{repeat:true});
  f.key('ArrowRight',{isComposing:true}); f.key('KeyD',{ctrlKey:true});
  const input={closest:query=>query.includes('input')?input:null};
  const button={closest:query=>query.includes('button')?button:null};
  const other={closest:query=>query.includes('dialog')?other:null};
  assert.equal(f.key('Enter',{target:input}).defaultPrevented,false);
  assert.equal(f.key('Space',{target:button}).defaultPrevented,false);
  assert.equal(f.key('KeyD',{target:other}).defaultPrevented,false);
  f.enable(false); f.key('ArrowLeft');
  f.enable(true); f.controls.dispose(); f.key('Enter');
  assert.deepEqual(f.events,[['step',-1],['step',1],['rotate',-Math.PI/12],['rotate',Math.PI/12],['confirm']]);
});

test('horizontal drags rotate the model incrementally, and a tap keeps the selection', t => {
  const f=fixture(t);
  f.pointer('pointerdown',100,50); f.pointer('pointerup',100,50);
  f.pointer('pointerdown',100,20); f.pointer('pointermove',150,25);
  f.pointer('pointermove',140,25); f.pointer('pointerup',145,50);
  f.pointer('pointerdown',100,30); f.pointer('pointerup',100,140);
  assert.deepEqual(f.events,[['rotate',50*.012],['rotate',-10*.012],['rotate',5*.012]]);
  assert.equal(f.captured.size,0);
});

test('cancel, multitouch, blur, and leaving the cast scene discard incomplete selections', t => {
  const f=fixture(t);
  f.pointer('pointerdown',100,50); f.pointer('pointercancel',100,50); f.pointer('pointerup',100,50);
  f.pointer('pointerdown',100,50); f.pointer('pointerdown',120,50,{pointerId:8,isPrimary:false}); f.pointer('pointerup',100,50);
  f.pointer('pointerdown',100,50); f.win.emit('blur'); f.pointer('pointerup',100,50);
  f.pointer('pointerdown',100,50); f.enable(false); f.pointer('pointerup',100,50); f.enable(true);
  f.pointer('pointerdown',100,50); f.controls.dispose(); f.pointer('pointerup',100,50);
  assert.deepEqual(f.events,[]); assert.equal(f.captured.size,0);
});

test('gamepad waits for neutral, debounces sticks and confirmation, and rearms after another overlay', t => {
  const pad={index:0,connected:true,mapping:'standard',axes:[.8],buttons:Array.from({length:16},()=>({pressed:false}))};
  const f=fixture(t,pad);
  f.frame(); pad.axes[0]=0; f.frame();
  pad.axes[0]=.85; f.frame(); f.frame();
  pad.axes[0]=.49; f.frame(); pad.axes[0]=.78; f.frame();
  pad.axes[0]=0; f.frame(); pad.buttons[14].pressed=true; f.frame(); f.frame(); pad.buttons[14].pressed=false; f.frame();
  pad.buttons[0].pressed=true; f.frame(); f.frame(); f.enable(false); f.frame(); f.enable(true); f.frame();
  pad.buttons[0].pressed=false; f.frame(); pad.buttons[0].pressed=true; f.frame();
  f.controls.dispose(); f.frame();
  assert.deepEqual(f.events,[['step',1],['step',-1],['confirm'],['confirm']]);
});
