import {expect,it} from 'vitest';
import {Track} from './track';
import {getCircuit} from './circuits';
import {distanceToTrack} from './terrain';
import {pinePlacements} from './pineForest';
it('keeps mature pine groups clear of both branches of the figure-eight',()=>{
 const track=new Track(getCircuit('suzaka')!);track.buildVisuals=()=>{};track.build();
 const ground={heightAt:(x:number,z:number)=>Math.sin(x*.01)+Math.cos(z*.01)};
 const trees=pinePlacements(track,ground);
 expect(trees.length).toBeGreaterThan(400);expect(trees.length).toBeLessThan(980);
 expect(trees).toEqual(pinePlacements(track,ground));
 for(const tree of trees) {
  expect(tree.y).toBe(ground.heightAt(tree.x,tree.z));
  expect(distanceToTrack(tree.x,tree.z,track,1)).toBeGreaterThan(track.barrierLateralOffset+10);
  expect(tree.height).toBeGreaterThanOrEqual(20);expect(tree.height).toBeLessThan(30);
 }
});
