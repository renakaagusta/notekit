import { Metaballs } from "@paper-design/shaders-react"

export function HeroShader() {
  return (
    <Metaballs
      colorBack={{ r: 0.02, g: 0.01, b: 0.01, a: 1 }}
      colors={[
        { r: 0.918, g: 0.451, b: 0.09, a: 1 },
        { r: 0.961, g: 0.576, b: 0.251, a: 1 },
        { r: 0.725, g: 0.341, b: 0.063, a: 1 },
        { r: 1, g: 0.7, b: 0.4, a: 0.6 },
      ]}
      count={6}
      size={0.35}
      sizeRange={0.2}
      speed={0.5}
      style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
    />
  )
}
