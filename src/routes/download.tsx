import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/download")({
  component: DownloadPage,
});

function DownloadPage() {
  // Redirect to the static download.html page
  if (typeof window !== "undefined") {
    window.location.replace("/download.html");
  }
  return null;
}
