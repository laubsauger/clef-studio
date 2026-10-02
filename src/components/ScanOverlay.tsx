import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ScanLine, Sparkles } from 'lucide-react'
import { createPortal } from 'react-dom'

const vertex = `#version 300 es
in vec2 position;
out vec2 uv;
void main(){ uv=position*.5+.5; gl_Position=vec4(position,0.,1.); }`
const fragment = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform float time;
uniform vec2 resolution;
uniform sampler2D frame;
uniform vec2 sourceSize;
uniform float ready;
uniform float cover;
uniform float scoring;
float luminance(vec2 p){return dot(texture(frame,vec2(p.x,1.-p.y)).rgb,vec3(.2126,.7152,.0722));}
void main(){
  float viewAspect=resolution.x/resolution.y,imageAspect=sourceSize.x/sourceSize.y;
  vec2 imageUV=uv;
  if(cover>.5){if(viewAspect>imageAspect)imageUV.y=(uv.y-.5)*imageAspect/viewAspect+.5;else imageUV.x=(uv.x-.5)*viewAspect/imageAspect+.5;}
  else{if(viewAspect>imageAspect)imageUV.x=(uv.x-.5)*viewAspect/imageAspect+.5;else imageUV.y=(uv.y-.5)*imageAspect/viewAspect+.5;}
  float inside=step(0.,imageUV.x)*step(imageUV.x,1.)*step(0.,imageUV.y)*step(imageUV.y,1.);
  vec2 texel=1.8/sourceSize;
  float a=luminance(imageUV+texel*vec2(-1.,-1.)),b=luminance(imageUV+texel*vec2(0.,-1.)),c=luminance(imageUV+texel*vec2(1.,-1.));
  float d=luminance(imageUV+texel*vec2(-1.,0.)),f=luminance(imageUV+texel*vec2(1.,0.));
  float g=luminance(imageUV+texel*vec2(-1.,1.)),h=luminance(imageUV+texel*vec2(0.,1.)),i=luminance(imageUV+texel*vec2(1.,1.));
  float edge=smoothstep(.04,.28,length(vec2(-a-2.*d-g+c+2.*f+i,-a-2.*b-c+g+2.*h+i)));
  float progress=fract(time*mix(.19,.26,scoring));
  float scanY=1.18-progress*1.36;
  float scanX=-.18+progress*1.36;
  float distance=mix((uv.y-scanY)*resolution.y,(scanX-uv.x)*resolution.x,scoring);
  float beam=exp(-pow(distance*.6,2.));
  float echo=exp(-pow((distance-7.)*.75,2.))*scoring;
  float behind=smoothstep(-1.,3.,distance);
  float trail=min(110.,mix(resolution.y,resolution.x,scoring)*.35);
  float wake=(1.-smoothstep(0.,trail,distance))*behind;
  float ahead=exp(-pow(min(distance,0.)/9.,2.))*(1.-behind);
  vec3 original=texture(frame,vec2(imageUV.x,1.-imageUV.y)).rgb;
  vec3 edgeColor=mix(vec3(.62,.98,.91),vec3(1.,.65,.32),scoring);
  vec3 processed=mix(mix(1.-original,edgeColor,.22*scoring),edgeColor,edge);
  float alpha=clamp((edge*wake*.88+wake*.10+ahead*edge*.25)*inside*ready+beam*.8+echo*.5,0.,1.);
  color=vec4(mix(processed,mix(vec3(.86,1.,.97),vec3(1.,.91,.76),scoring),beam+echo),alpha);
}`

type ScanPhase = 'collect' | 'score'

function ScanShader({ image, cover, phase, onError }: { image?: string; cover: boolean; phase: ScanPhase; onError: (message: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  useEffect(() => {
    const element = canvas.current!
    let gl: WebGL2RenderingContext | null = null
    let frame = 0
    let program: WebGLProgram | null = null
    let buffer: WebGLBuffer | null = null
    let texture: WebGLTexture | null = null
    let disposed = false
    const shaders: WebGLShader[] = []
    let observer: ResizeObserver | undefined
    try {
      gl = element.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false, powerPreference: 'low-power' })
      if (!gl) throw new Error('The scanning shader requires WebGL 2 in this browser.')
      const context = gl
      const compile = (type: number, source: string) => {
        const shader = context.createShader(type)!
        shaders.push(shader); context.shaderSource(shader, source); context.compileShader(shader)
        if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) throw new Error(`Scanning shader: ${context.getShaderInfoLog(shader)}`)
        return shader
      }
      program = context.createProgram()!
      context.attachShader(program, compile(context.VERTEX_SHADER, vertex)); context.attachShader(program, compile(context.FRAGMENT_SHADER, fragment)); context.linkProgram(program)
      if (!context.getProgramParameter(program, context.LINK_STATUS)) throw new Error(`Scanning shader: ${context.getProgramInfoLog(program)}`)
      context.useProgram(program)
      buffer = context.createBuffer(); context.bindBuffer(context.ARRAY_BUFFER, buffer); context.bufferData(context.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), context.STATIC_DRAW)
      const position = context.getAttribLocation(program, 'position'); context.enableVertexAttribArray(position); context.vertexAttribPointer(position, 2, context.FLOAT, false, 0, 0)
      const time = context.getUniformLocation(program, 'time'), resolution = context.getUniformLocation(program, 'resolution')
      const imageSize = context.getUniformLocation(program, 'sourceSize'), ready = context.getUniformLocation(program, 'ready')
      context.uniform1f(context.getUniformLocation(program, 'cover'), cover ? 1 : 0)
      context.uniform1f(context.getUniformLocation(program, 'scoring'), phase === 'score' ? 1 : 0)
      context.uniform2f(imageSize, 1, 1); context.uniform1f(ready, 0)
      texture = context.createTexture(); context.activeTexture(context.TEXTURE0); context.bindTexture(context.TEXTURE_2D, texture)
      context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE); context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE)
      context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR); context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR)
      context.texImage2D(context.TEXTURE_2D,0,context.RGBA,1,1,0,context.RGBA,context.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]))
      context.uniform1i(context.getUniformLocation(program, 'frame'), 0)
      if (image) {
        const img = new Image(); img.onload = () => { if (disposed) return; context.bindTexture(context.TEXTURE_2D,texture); context.texImage2D(context.TEXTURE_2D,0,context.RGBA,context.RGBA,context.UNSIGNED_BYTE,img); context.uniform2f(imageSize,img.width,img.height); context.uniform1f(ready,1); if(reduced) context.drawArrays(context.TRIANGLES,0,6) }; img.src = image
      }
      const resize = () => { const bounds = element.getBoundingClientRect(); const scale = Math.min(devicePixelRatio, 1.25); element.width = Math.round(bounds.width * scale); element.height = Math.round(bounds.height * scale); context.viewport(0, 0, element.width, element.height); context.uniform2f(resolution, element.width, element.height) }
      observer = new ResizeObserver(resize); observer.observe(element); resize()
      const started = performance.now(); let last = 0
      function draw(now: number) {
        if (now - last >= 1000 / 24) { context.uniform1f(time, reduced ? 1.5 : (now - started) / 1000); context.drawArrays(context.TRIANGLES, 0, 6); last = now }
        if (!reduced) frame = requestAnimationFrame(draw)
      }
      draw(performance.now())
    } catch (error) { onError(error instanceof Error ? error.message : 'Scanning shader failed.') }
    return () => { disposed = true; cancelAnimationFrame(frame); observer?.disconnect(); shaders.forEach(shader => gl?.deleteShader(shader)); if (program) gl?.deleteProgram(program); if (buffer) gl?.deleteBuffer(buffer); if (texture) gl?.deleteTexture(texture) }
  }, [reduced, onError, image, cover, phase])
  return <canvas ref={canvas} className="scan-shader" data-phase={phase} aria-hidden="true" />
}

export function ScanOverlay({ busy, frame, cover, target, phase, onError }: { busy: boolean; frame?: string; cover: boolean; target?: HTMLElement | null; phase: ScanPhase; onError: (message: string) => void }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!busy) return
    const start = performance.now(); const timer = setInterval(() => setElapsed((performance.now() - start) / 1000), 100)
    return () => clearInterval(timer)
  }, [busy, phase])
  return <AnimatePresence>{busy && <motion.div className={`scan-overlay scan-${phase}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
    {target ? createPortal(<div className="scan-media-effect"><ScanShader image={frame} cover={cover} phase={phase} onError={onError} /></div>, target) : <ScanShader image={frame} cover={cover} phase={phase} onError={onError} />}
    <div className="scan-corners"><i /><i /><i /><i /></div>
    <div className="scan-hud">{phase === 'collect' ? <ScanLine size={14} /> : <Sparkles size={14} />}<span>{phase === 'collect' ? 'COLLECTING PROFILE' : 'SCORING FRAME'}</span><span className="scan-timer">{elapsed.toFixed(1)}s</span></div>
  </motion.div>}</AnimatePresence>
}
