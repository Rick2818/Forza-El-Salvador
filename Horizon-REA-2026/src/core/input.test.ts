import {afterEach,expect,it,vi} from 'vitest';
import {Input} from './input';
class Element {
 constructor(private readonly form=false) {}
 closest(){return this.form?this:null;}
}
afterEach(()=>vi.unstubAllGlobals());
it('lets range controls use arrows while retaining driving keys on the canvas',()=>{
 vi.stubGlobal('HTMLElement',Element);
 const input=new Input();
 const keys=input as unknown as {onKeyDown:(event:KeyboardEvent)=>void;onKeyUp:(event:KeyboardEvent)=>void};
 const event=(target:Element)=>{
  const e=new Event('keydown',{cancelable:true});
  Object.defineProperties(e,{code:{value:'ArrowUp'},target:{value:target}});
  return e as KeyboardEvent;
 };
 const slider=event(new Element(true));keys.onKeyDown(slider);
 expect(slider.defaultPrevented).toBe(false);expect(input.isDown('ArrowUp')).toBe(false);
 const canvas=event(new Element());keys.onKeyDown(canvas);
 expect(canvas.defaultPrevented).toBe(true);expect(input.isDown('ArrowUp')).toBe(true);
 keys.onKeyUp(slider);expect(input.isDown('ArrowUp')).toBe(false);
});
