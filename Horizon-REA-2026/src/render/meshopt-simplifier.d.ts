declare module "three/addons/libs/meshopt_simplifier.module.js" {
  export const MeshoptSimplifier: {
    ready: Promise<void>;
    supported: boolean;
    simplify(indices:Uint32Array, positions:Float32Array, stride:number,
      targetCount:number, targetError:number, flags?:string[]):[Uint32Array,number];
  };
}
