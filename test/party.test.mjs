import test from 'node:test';
import assert from 'node:assert/strict';
import { Party } from '../party.js';

const offer = { type: 'offer', sdp: 'v=0\r\n' };

// Supply an already gathered offer so the tests can control when the room service
// responds without depending on a browser's ICE implementation.
function roomParty(t, fetchRoom) {
  const original = globalThis.fetch;
  globalThis.fetch = fetchRoom;
  const party = new Party(
    () => {},
    () => {},
  );
  party.direct = true;
  party.setup = function (role) {
    this.close(false);
    this.role = role;
    this.pc = { close() {}, createOffer: async () => offer };
    return this.pc;
  };
  party.local = async (pc, description) => description;
  t.after(() => {
    party.close(false);
    globalThis.fetch = original;
  });
  return party;
}

test('a failed automatic room still supplies a usable manual invitation', async (t) => {
  const party = roomParty(t, async () => new Response(null, { status: 503 }));
  await assert.rejects(party.host());
  assert.equal(party.role, 'host');
  assert.deepEqual(JSON.parse(Buffer.from(party.manualCode, 'base64url').toString('utf8')), offer);
});

test('a late room lookup cannot replace the connection started after cancellation', async (t) => {
  let respond;
  const party = roomParty(
    t,
    () =>
      new Promise((resolve) => {
        respond = resolve;
      }),
  );
  const pending = party.join('123456');
  const current = party.setup('host');
  respond(new Response(JSON.stringify({ offer })));
  await assert.rejects(pending, /配对已取消/);
  assert.equal(party.pc, current);
  assert.equal(party.role, 'host');
});
