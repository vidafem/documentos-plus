import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#01376D",
          color: "#FFFFFF",
          fontSize: 18,
          fontWeight: 800,
          fontFamily: "Arial",
          borderRadius: 8,
        }}
      >
        DP
      </div>
    ),
    {
      ...size,
    }
  );
}
