import type { CSSProperties } from "react";

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  circle?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({
  width,
  height = 12,
  circle,
  className,
  style,
}: SkeletonProps) {
  const cls = `nk-skel${circle ? " nk-skel--circle" : ""}${className ? ` ${className}` : ""}`;
  return <span className={cls} style={{ width, height, ...style }} aria-hidden />;
}

interface CountProps {
  count?: number;
}

export function SkeletonCommitList({ count = 4 }: CountProps) {
  return (
    <ol
      className="nk-commitlist nk-commitlist--skel"
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="nk-commit">
          <div className="nk-commit-graph">
            <div className="nk-commit-line nk-commit-line--top" />
            <Skeleton circle width={8} height={8} />
            <div className="nk-commit-line nk-commit-line--bot" />
          </div>
          <div className="nk-commit-body">
            <Skeleton width={`${45 + ((i * 7) % 35)}%`} height={12} />
            <Skeleton width={`${20 + ((i * 11) % 20)}%`} height={10} style={{ marginLeft: "auto" }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function SkeletonRepoList({ count = 5 }: CountProps) {
  return (
    <ul
      className="nk-repo-list nk-repo-list--skel"
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: count }).map((_, i) => (
        <li key={i}>
          <div className="nk-repo-row nk-repo-row--skel">
            <Skeleton width={`${50 + ((i * 9) % 30)}%`} height={13} />
            <Skeleton width={`${25 + ((i * 7) % 25)}%`} height={10} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SkeletonDeviceList({ count = 3 }: CountProps) {
  return (
    <ul className="nk-device-list" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="nk-device-item">
          <div className="nk-skel-col">
            <Skeleton width={`${45 + ((i * 9) % 30)}%`} height={13} />
            <Skeleton width={`${30 + ((i * 7) % 20)}%`} height={10} />
          </div>
          <Skeleton width={52} height={24} />
        </li>
      ))}
    </ul>
  );
}

export function SkeletonLines({ count = 3 }: CountProps) {
  return (
    <div className="nk-skel-block" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === count - 1 ? "55%" : "100%"}
          height={12}
        />
      ))}
    </div>
  );
}
