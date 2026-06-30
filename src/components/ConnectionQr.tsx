import { createQrMatrix } from "../utils/qrCode";

type ConnectionQrProps = {
  value: string | null;
};

export function ConnectionQr({ value }: ConnectionQrProps) {
  if (!value) {
    return <div className="qrPlaceholder">QR indisponivel</div>;
  }

  const matrix = createQrMatrix(value);
  const quietZone = 4;
  const size = matrix.size + quietZone * 2;

  return (
    <svg
      className="qrImage"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="QR Code de configuracao do comando remoto"
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#ffffff" />
      {matrix.modules.map((row, rowIndex) =>
        row.map((isDark, colIndex) =>
          isDark ? (
            <rect
              key={`${rowIndex}-${colIndex}`}
              x={colIndex + quietZone}
              y={rowIndex + quietZone}
              width="1"
              height="1"
              fill="#000000"
            />
          ) : null,
        ),
      )}
    </svg>
  );
}
