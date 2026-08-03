import { cn } from "../../lib/utils";
import { CardSpotlight } from "./card-spotlight";

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "mx-auto grid max-w-7xl grid-cols-1 gap-4 md:auto-rows-[20rem] md:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
};

export const BentoGridItem = ({
  className,
  title,
  description,
  header,
  icon,
}: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
}) => {
  return (
    <CardSpotlight
      radius={250}
      color="#7c2d12"
      className={cn(
        "group/bento row-span-1 flex flex-col justify-between space-y-4 rounded-xl border-white/[0.08] bg-neutral-950 p-4 transition duration-200 hover:shadow-xl hover:border-white/[0.15] overflow-hidden",
        className,
      )}
    >
      {header}
      <div className="relative z-10 transition duration-200 group-hover/bento:translate-x-2">
        {icon}
        <div className="mb-2 font-sans font-bold text-lg text-neutral-200">
          {title}
        </div>
        <div className="font-sans text-sm font-normal text-neutral-400">
          {description}
        </div>
      </div>
    </CardSpotlight>
  );
};
