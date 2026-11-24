import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GovNavAI: government services in your language",
    short_name: "GovNavAI",
    description: "Office, fee, documents and the official form, already filled. Sinhala, Tamil, English.",
    start_url: "/",
    display: "standalone",
    background_color: "#FBF7F2",
    theme_color: "#5C0F0F",
    lang: "si",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
