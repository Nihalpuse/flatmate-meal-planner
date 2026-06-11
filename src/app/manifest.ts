import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aaj Kya Banega?",
    short_name: "Aaj Kya Banega",
    description:
      "Decide what to cook in under 2 minutes — vote, get AI meal suggestions, and avoid repeats.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#FBF1DC",
    theme_color: "#C98A2E",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
