import { useMemo } from "react";

type BoxProps = {
  h: number;
  w?: number | string;
  r?: number;
  style?: React.CSSProperties;
};

export function SkeletonBox({ h, w = "100%", r = 12, style }: BoxProps) {
  return (
    <div
      style={{
        height: h,
        width: w,
        borderRadius: r,
        background:
          "linear-gradient(90deg, rgba(17,24,39,0.06) 0%, rgba(17,24,39,0.10) 45%, rgba(17,24,39,0.06) 100%)",
        backgroundSize: "220% 100%",
        animation: "brioche_skel 1.1s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

export function SkeletonCard({
  lines = 3,
  rows = 0,
}: {
  lines?: number;
  rows?: number;
}) {
  return (
    <div className="fiuriCard" style={{ borderRadius: 14 }}>
      <SkeletonBox h={18} w={180} r={10} />
      <div style={{ height: 10 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i}>
          <SkeletonBox h={12} w={i === lines - 1 ? "70%" : "100%"} r={10} />
          <div style={{ height: 10 }} />
        </div>
      ))}

      {rows > 0 ? <div style={{ height: 8 }} /> : null}

      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            padding: "10px 0",
            borderTop: i === 0 ? "1px solid rgba(0,0,0,0.06)" : "1px solid rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ flex: 1 }}>
            <SkeletonBox h={14} w="60%" r={10} />
            <div style={{ height: 8 }} />
            <SkeletonBox h={12} w="35%" r={10} />
          </div>
          <SkeletonBox h={38} w={130} r={999} />
        </div>
      ))}
    </div>
  );
}

export default function SkeletonStyles() {
  // Inject keyframes once (safe)
  useMemo(() => {
    const id = "brioche_skeleton_style";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.innerHTML = `
      @keyframes brioche_skel {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    `;
    document.head.appendChild(style);
  }, []);

  return null;
}
