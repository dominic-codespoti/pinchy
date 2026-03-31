import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pinchy - Agent Operations Console",
    short_name: "Pinchy",
    description: "Manage and monitor your AI agents",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#6366F1",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
      },
      {
        src: "/apple-icon.svg",
        sizes: "180x180",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
    categories: ["developer", "productivity", "utilities"],
    lang: "en",
    dir: "ltr",
    scope: "/",
    id: "/",
  };
}
