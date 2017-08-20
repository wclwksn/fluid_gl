'use strict'

let THREE = require('three')
class SimulatorBase {
  constructor(renderer){
    this.renderer = renderer
    this.camera = new THREE.Camera()
    this.camera.position.z = 1
    this.planeGeometry = new THREE.PlaneBufferGeometry(2, 2)
    this.scene = new THREE.Scene()
    this.mesh = new THREE.Mesh(this.planeGeometry)
    this.scene.add(this.mesh)
  }
  _initDisturb(){
    this.disturbScene = new THREE.Scene()
    this.disturbObjects = []
    this.disturbIndex = 0
    for(let i=0; i<100; i++){
      let shader = circleShader()
      let obj = {
        mult: new THREE.Mesh(this.planeGeometry, shader.mult),
        add: new THREE.Mesh(this.planeGeometry, shader.add)
      }
      this.disturbScene.add(obj.mult,obj.add)
      obj.mult.visible = obj.add.visible = false
      this.disturbObjects.push(obj)
    }
  }
  _initStore(size){
    let maxStore = 128
    let store = {
      target: SimulatorBase.createRenderTarget(1,maxStore,{filter:THREE.NearestFilter}),
      array: new Uint8Array(maxStore*4),
      positions: {},
      scene: new THREE.Scene(),
      shader: SimulatorBase.storeShader(),
      meshes: [],
      index: 0,
      max: maxStore
    }
    store.shader.uniforms.size.value = size
    store.shader.uniforms.height.value = maxStore
    for(let i=0; i<maxStore; i++){
      let smesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2));
      smesh.material = store.shader;
      store.meshes.push(smesh);
      store.scene.add(smesh);
    }
    this.store = store
  }
  static createRenderTarget(w, h, option){
    option=option||{};
    return new THREE.WebGLRenderTarget(w, h, {
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      minFilter: option.filter || THREE.LinearFilter,
      magFilter: option.filter || THREE.LinearFilter,
      format: option.format || THREE.RGBAFormat,
      type: option.type || THREE.FloatType,
      stencilBuffer: false,
      depthBuffer: false
    })
  }
  storeLoad(){
    let gl = this.renderer.getContext();
    let store = this.store
    if(store.index){
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.store.target.__webglFramebuffer, true)
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.store.target.__webglFramebuffer,true)
      gl.readPixels(0, 0, 1, this.store.index, gl.RGBA, gl.UNSIGNED_BYTE, this.store.array)
    }
    store.meshes.forEach((m)=>{m.visible=false})
    store.captured = {};
    for(let id in store.positions){
      let index = store.positions[id]
      let arr=[]
      for(let i=0;i<4;i++)arr[i]=store.array[4*index+i]/0xff
      store.captured[id] = {vx: arr[0], vy: arr[1], h: arr[2], a: arr[3]}
    }
    store.index = 0
    store.positions = {}
  }
  readStoredPixel(id){
    return this.store.captured[id];
  }
  storePixel(id,x,y){
    let store = this.store
    if(store.index==store.max)return
    if(x<0||x>=size||y<0||y>=size)return
    store.positions[id]=store.index
    let mesh = store.meshes[store.index]
    mesh.position.x = x/size
    mesh.position.y = y/size
    mesh.position.z = store.index/store.max
    mesh.visible = true
    store.index++
  }
  storeDone(){
    this.store.shader.uniforms.texture.value = this.wave.texture
    this.renderer.render(this.store.scene, this.camera, this.store.target)
  }
  disturb(position, r, mult, add){
    let obj = this.disturbObjects[this.disturbIndex++]
    if(!obj)return
    obj.mult.material.uniforms.center.value=obj.add.material.uniforms.center.value=new THREE.Vector4(position.x, position.y)
    obj.mult.material.uniforms.radius.value=obj.add.material.uniforms.radius.value=r
    obj.mult.material.uniforms.value.value=mult
    obj.add.material.uniforms.value.value=add
    obj.mult.visible=obj.add.visible=true
  }
  _disturbApply(target){
    if(!this.disturbIndex)return
    let autoClearWas = this.renderer.autoClear
    this.renderer.autoClear = false
    this.renderer.render(this.disturbScene, this.camera, target)
    this.renderer.autoClear = autoClearWas
    for(let i=0;i<this.disturbIndex;i++){
      let obj = this.disturbObjects[i]
      obj.add.visible = obj.mult.visible = false
    }
    this.disturbIndex = 0
  }
  _clearTarget(target){
    _render(target, SimulatorBase.zeroShader)
  }
  _render(target, material, uniforms){
    this.mesh.material = material
    for(let name in uniforms){
      let value = uniforms[name]
      if(material.uniforms[name]){
        material.uniforms[name].value = value && (value.texture || value)
      }
    }
    this.renderer.render(this.scene, this.camera, target)
  }
  static generateCalcShader(option){
    let defs = Object.assign({}, option.defs)
    if(option.size)defs.SIZE = size.toFixed(2)
    return new THREE.ShaderMaterial({
      uniforms: option.uniforms || {},
      defines: defs,
      vertexShader: option.vertex || SimulatorBase.vertexShaderCode,
      fragmentShader: option.fragment,
      transparent: true,
      blending: THREE.NoBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.ZeroFactor
    });
  }
}

SimulatorBase.storeShader = function(){
  let VERT = `
  uniform float size, height;
  varying vec2 vsrc;
  void main(){
    vec4 xyiw = modelMatrix*vec4(0,0,0,1);
    vsrc=xyiw.xy+position.xy/size;
    gl_Position=vec4(
      position.x,
      2.0*xyiw.z-1.0+(position.y+1.0)/height,
      0,
      1
    );
  }
  `
  let FRAG = `
  uniform sampler2D texture;
  varying vec2 vsrc;
  void main(){gl_FragColor=texture2D(texture,vsrc);}
  `
  return new THREE.ShaderMaterial({
    uniforms: {
      texture: {type: "t"},
      size: {type: 'f'},
      height: {type: 'f'},
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    blending: THREE.NoBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.ZeroFactor
  });
}
SimulatorBase.vertexShaderCode = 'void main(){gl_Position=vec4(position,1);}';

SimulatorBase.zeroShader = SimulatorBase.generateCalcShader({
  fragment: 'void main(){gl_FragColor = vec4(0,0,0,0);}'
})

let waveDisturbVertexCode = `
void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1);}
`
let waveDisturbFragmentCode =`
uniform vec4 value;
void main(){gl_FragColor=value;}
`
SimulatorBase.waveMultShader = new THREE.ShaderMaterial({
  uniforms: {value: {type: 'v4'}},
  vertexShader: waveDisturbVertexCode,
  fragmentShader: waveDisturbFragmentCode,
  transparent: true,
  depthTest: false,
  blending: THREE.MultiplyBlending,
})
SimulatorBase.waveAddShader = new THREE.ShaderMaterial({
  uniforms: {value: {type: 'v4'}},
  vertexShader: waveDisturbVertexCode,
  fragmentShader: waveDisturbFragmentCode,
  transparent: true,
  depthTest: false,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor
})

let disturbCircleVertexCode = `
uniform vec2 center;
uniform float radius;
varying vec2 coord;
void main(){
  gl_Position=vec4(center+radius*position.xy,0,1);
  coord = position.xy;
}
`
let disturbCircleFragmentCode = `
varying vec2 coord;
uniform vec4 value;
void main(){
  float r2=dot(coord,coord);
  if(r2>1.0)discard;
  float alpha=(1.0-r2)*(1.0-r2);
  gl_FragColor = FRAGCOLOR;
}
`
let disturbCircleUniforms = {
  radius: { type: 'f' },
  center: { type: 'v2' },
  value: { type: 'v4' }
}
function disturbCircleShaders(){
  return {
    mult: new THREE.ShaderMaterial({
      uniforms: disturbCircleUniforms,
      vertexShader: disturbCircleVertexCode,
      fragmentShader: disturbCircleFragmentCode.replace('FRAGCOLOR', '1.0-alpha*(1.0-value)'),
      transparent: true,
      depthTest: false,
      blending: THREE.MultiplyBlending,
    }),
    add: new THREE.ShaderMaterial({
      uniforms: disturbCircleUniforms,
      vertexShader: disturbCircleVertexCode,
      fragmentShader: disturbCircleFragmentCode.replace('FRAGCOLOR', 'alpha*value'),
      transparent: true,
      depthTest: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor
    })
  }
}


module.exports = SimulatorBase
SimulatorBase.THREE = THREE
