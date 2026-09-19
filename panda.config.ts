import { defineConfig } from "@pandacss/dev";
import { palette } from "./src/palette";

const { player: _p, terrain: _t, ...surface } = palette;

export default defineConfig({
  preflight: true,
  include: ["./src/**/*.{ts,tsx}"],
  jsxFramework: "solid",
  outdir: "styled-system",
  theme: {
    tokens: {
      colors: {
        ...Object.fromEntries(Object.entries(surface).map(([k, v]) => [k, { value: v }])),
        player: Object.fromEntries(
          Object.entries(palette.player).map(([k, v]) => [k, { value: v }]),
        ),
        terrain: Object.fromEntries(
          Object.entries(palette.terrain).map(([k, v]) => [k, { value: v }]),
        ),
      },
      fonts: {
        game: { value: `"Nunito", ui-rounded, "SF Pro Rounded", system-ui, sans-serif` },
      },
      radii: {
        card: { value: "14px" },
        ctrl: { value: "10px" },
      },
      easings: {
        out: { value: "cubic-bezier(0.23, 1, 0.32, 1)" },
      },
    },
  },
});
