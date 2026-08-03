import { Metaballs } from "@paper-design/shaders-react"

export function HeroShader() {
  return (
    <Metaballs
      colorBack="#050505"
      colors={["#ffffff", "#d4d4d8", "#a1a1aa", "#71717a", "#e4e4e7"]}
      count={7}
      size={0.65}
      speed={0.4}
      scale={1}
      style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
    />
  )
}
