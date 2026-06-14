/**
 * MiniCandlestick — pure SVG candlestick chart.
 * Props: ohlcv (array of {open, high, low, close}), width, height
 */
export default function MiniCandlestick({ ohlcv, width = 128, height = 80 }) {
  if (!ohlcv || ohlcv.length === 0) return null;

  const n        = ohlcv.length;
  const padding  = 4;
  const minPrice = Math.min(...ohlcv.map(c => c.low));
  const maxPrice = Math.max(...ohlcv.map(c => c.high));
  const priceRange = maxPrice - minPrice || 1;
  const drawH    = height - padding * 2;

  const toY  = p => padding + drawH - ((p - minPrice) / priceRange) * drawH;
  const candleW = Math.max(1, ((width / n) * 0.7));
  const step    = width / n;

  return (
    <svg width={width} height={height} className="block">
      {ohlcv.map((c, i) => {
        const cx   = i * step + step / 2;
        const bull = c.close >= c.open;
        const fill = bull ? "#10b981" : "#ef4444";
        const bodyTop    = toY(Math.max(c.open, c.close));
        const bodyBottom = toY(Math.min(c.open, c.close));
        const bodyH      = Math.max(1, bodyBottom - bodyTop);
        return (
          <g key={i}>
            {/* wick */}
            <line
              x1={cx} y1={toY(c.high)}
              x2={cx} y2={toY(c.low)}
              stroke={fill} strokeWidth={1}
            />
            {/* body */}
            <rect
              x={cx - candleW / 2}
              y={bodyTop}
              width={candleW}
              height={bodyH}
              fill={fill}
            />
          </g>
        );
      })}
    </svg>
  );
}
