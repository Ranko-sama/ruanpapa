import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFighter } from '../assets/fighters.js';
import { createJellyMaterial } from '../assets/fruit-jelly.js';
import { ArenaView } from '../view.js';

test('every gel surface has optical thickness, with thicker torsos and a separate cheek pigment', () => {
  const arenaGel = createJellyMaterial({ texture: {}, depthTexture: {} });
  for (const kind of ['hammer', 'knight', 'cowboy', 'spark']) {
    const { torso, left, right } = makeFighter(kind, 2, 1, arenaGel).userData.jellyRig;
    let torsoDepth = 0;
    for (const part of [torso, left, right]) {
      const { geometry } = part;
      const optics = geometry.getAttribute('gelOptics');
      const group = geometry.groups.find((g) => g.materialIndex === 1);
      assert.equal(part.material[group.materialIndex], arenaGel);
      let maxDepth = 0,
        minPigment = Infinity,
        maxPigment = -Infinity;
      for (let i = group.start; i < group.start + group.count; i++) {
        const n = geometry.index.getX(i);
        assert.ok(optics.getX(n) > 0 && optics.getY(n) > 0 && optics.getZ(n) > 0);
        maxDepth = Math.max(maxDepth, optics.getZ(n));
        minPigment = Math.min(minPigment, optics.getW(n));
        maxPigment = Math.max(maxPigment, optics.getW(n));
      }
      if (part === torso) {
        assert.equal(minPigment, 0);
        assert.equal(maxPigment, 1);
        torsoDepth = maxDepth;
      } else {
        assert.equal(minPigment, -1);
        assert.equal(maxPigment, -1);
        assert.ok(maxDepth < torsoDepth);
      }
    }
  }
  assert.equal(arenaGel.transparent, false);
  assert.equal(makeFighter('hammer').userData.jellyRig.torso.material[1].transparent, true);
});

test('the shared refraction pass restores visibility, shadows and the render target even if capture fails', () => {
  const arena = {},
    original = {};
  for (const fail of [false, true]) {
    let current = original;
    const passes = [];
    const fighters = { visible: !fail };
    const shadows = { autoUpdate: true, needsUpdate: true };
    const renderer = {
      shadowMap: shadows,
      getRenderTarget: () => current,
      setRenderTarget: (target) => {
        current = target;
      },
      render() {
        passes.push([current, fighters.visible, shadows.autoUpdate, shadows.needsUpdate]);
        if (fail) throw new Error('capture interrupted');
      },
    };
    const draw = () =>
      ArenaView.prototype.drawScene.call({
        renderer,
        rig: {},
        fighterGroup: fighters,
        gelBackdrop: arena,
      });
    if (fail) assert.throws(draw, /capture interrupted/);
    else draw();
    assert.deepEqual(passes[0], [arena, false, false, false]);
    assert.equal(passes.length, fail ? 1 : 2);
    if (!fail) assert.deepEqual(passes[1], [original, true, true, true]);
    assert.equal(current, original);
    assert.deepEqual(shadows, { autoUpdate: true, needsUpdate: true });
    assert.equal(fighters.visible, !fail);
  }
});
