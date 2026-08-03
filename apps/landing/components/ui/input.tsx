import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-9 w-full rounded-md border border-white/20 bg-white/5 px-3 py-1 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#ea7317] focus:ring-2 focus:ring-[#ea7317]/30 transition-all",
        className
      )}
      {...props}
    />
  )
}

export { Input }
