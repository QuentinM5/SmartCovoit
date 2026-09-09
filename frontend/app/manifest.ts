import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SmartCovoit",
    short_name: "SmartCovoit",
    description: "Organise les trajets d'un groupe : qui prend qui, et dans quel ordre.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#fbfaf7",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/manifest-icons/192", sizes: "192x192", type: "image/png" },
      { src: "/manifest-icons/512", sizes: "512x512", type: "image/png" },
    ],
  };
}
