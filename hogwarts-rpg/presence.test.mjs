import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createPresence } from './world/presence.mjs';

async function until(test) {
  const end = Date.now() + 4500;
  while (!test() && Date.now() < end) await wait(20);
  assert.ok(test(), 'expected a presence exchange');
}

test('browser presence preserves short jump/cast events, fetches team progress, and leaves on dispose', async t => {
  const doc = new EventTarget();
  doc.hidden = false;
  globalThis.document = doc;
  globalThis.window = new EventTarget();
  t.after(() => { delete globalThis.document; delete globalThis.window; });
  const received = [], campaigns = [], rosters = [], states = [];
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = JSON.parse(options.body);
    received.push({url,body,options});
    const response = {peers:[{id:'other', x:1, z:2}], revision:3};
    if (body.revision !== 3 && !body.leave) response.campaign = {revision:3};
    return Response.json(response);
  });
  const presence = createPresence({code:'ABCDEFGH',token:'test-token',memberId:'self'},{
    onCampaign:data=>campaigns.push(data), onPeers:p=>rosters.push(p), onStatus:state=>states.push(state)
  });
  t.after(()=>presence.dispose());
  const pose = {sceneId:'kings-cross',x:2,z:5,yaw:0,y:0,moving:false,casting:false};
  presence.update(pose);
  await until(()=>campaigns.length);
  assert.equal(received[0].url,'/api/parties/ABCDEFGH/presence');
  assert.equal(received[0].options.headers.Authorization,'Bearer test-token');
  assert.deepEqual(campaigns,[{revision:3}]);
  assert.deepEqual(states,['online']);
  assert.deepEqual(rosters.at(-1),[{id:'other',x:1,z:2}]);
  presence.update({...pose, y:0.25, casting:true});
  presence.update({...pose, y:0});
  await until(()=>received.length===2);
  const pulse = received[1].body;
  assert.equal(pulse.y,0);
  assert.equal(pulse.casting,false);
  assert(pulse.jumpId > 0 && pulse.jumpAge >= 0);
  assert(pulse.castId > 0 && pulse.castAge >= 0);
  assert.equal(pulse.revision,3);
  assert.equal(pulse.stream,received[0].body.stream);
  const equipment={top:'vest',pants:'trousers',gloves:'garden',shoes:'boots',weapon:'none',hat:'beret'};
  presence.update({...pose,equipment});
  await until(()=>received.length===3);
  assert.deepEqual(received[2].body.equipment,equipment);
  presence.dispose();
  const count = fetch.mock.callCount();
  assert(received.at(-1).body.leave);
  assert.deepEqual(rosters.at(-1),[]);
  presence.update({...pose,moving:true});
  await wait(900);
  assert.equal(fetch.mock.callCount(),count);
});
