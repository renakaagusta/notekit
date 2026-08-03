import { LiquidMetal } from "@paper-design/shaders-react"

export function HeroShader() {
  return (
    <LiquidMetal
      image="/notekit-shader-logo.svg"
      colorBack="#050505"
      colorTint="#c8c8cc"
      speed={0.8}
      scale={0.55}
      distortion={0.08}
      softness={0.12}
      repetition={2}
      shiftRed={0.25}
      shiftBlue={0.25}
      contour={0.35}
      angle={70}
      style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
    />
  )
}
