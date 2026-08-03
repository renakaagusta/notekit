import { Metaballs } from "@paper-design/shaders-react"

export function HeroShader() {
  return (
    <Metaballs
      colorBack="#050505"
      colors={["#ea7317", "#f59340", "#b85a10", "#ff9a4a", "#c4620f"]}
      count={7}
      size={0.75}
      speed={0.6}
      scale={1}
      style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
    />
  )
}
