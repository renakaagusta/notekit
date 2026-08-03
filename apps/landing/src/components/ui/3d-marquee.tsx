"use client";

import { motion } from "framer-motion";
import { cn } from "../../lib/utils";

export const ThreeDMarquee = ({
  images,
  className,
}: {
  images: string[];
  className?: string;
}) => {
  const chunkSize = Math.ceil(images.length / 4);
  const chunks = Array.from({ length: 4 }, (_, colIndex) => {
    const start = colIndex * chunkSize;
    return images.slice(start, start + chunkSize);
  });
  return (
    <div
      className={cn(
        "relative block h-full w-full overflow-hidden",
        className,
      )}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "1000px",
          height: "1000px",
        }}
      >
        <div
          style={{
            transform: "rotateX(55deg) rotateY(0deg) rotateZ(-45deg)",
            transformStyle: "preserve-3d",
            position: "absolute",
            top: "50%",
            left: "50%",
            marginTop: "-450px",
            marginLeft: "-450px",
            width: "900px",
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "20px",
          }}
        >
          {chunks.map((subarray, colIndex) => (
            <motion.div
              animate={{ y: colIndex % 2 === 0 ? 80 : -80 }}
              transition={{
                duration: colIndex % 2 === 0 ? 10 : 15,
                repeat: Infinity,
                repeatType: "reverse",
              }}
              key={colIndex + "marquee"}
              style={{ display: "flex", flexDirection: "column", gap: "20px" }}
            >
              {subarray.map((image, imageIndex) => (
                <div key={imageIndex + image}>
                  <img
                    src={image}
                    alt={`Token ${imageIndex + 1}`}
                    className="rounded-xl object-contain bg-neutral-800/60 p-4 ring-1 ring-white/[0.08]"
                    style={{ width: "160px", height: "160px" }}
                  />
                </div>
              ))}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
