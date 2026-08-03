declare module 'react-simple-maps' {
  import { ComponentType, ReactNode } from 'react'

  interface ComposableMapProps {
    projectionConfig?: { scale?: number; center?: [number, number]; rotate?: [number, number, number] }
    className?: string
    children?: ReactNode
  }
  export const ComposableMap: ComponentType<ComposableMapProps>

  interface ZoomableGroupProps {
    center?: [number, number]
    zoom?: number
    children?: ReactNode
  }
  export const ZoomableGroup: ComponentType<ZoomableGroupProps>

  interface GeographiesProps {
    geography: string | object
    children: (data: { geographies: Geography[] }) => ReactNode
  }
  export const Geographies: ComponentType<GeographiesProps>

  interface GeographyProps {
    geography: Geography
    fill?: string
    stroke?: string
    strokeWidth?: number
    style?: {
      default?: React.CSSProperties & { outline?: string }
      hover?: React.CSSProperties & { outline?: string }
      pressed?: React.CSSProperties & { outline?: string }
    }
  }
  export const Geography: ComponentType<GeographyProps>

  interface Geography {
    id: string
    rsSVGPath?: string
    properties: { name: string; [key: string]: unknown }
  }
}
