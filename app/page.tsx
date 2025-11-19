"use client";

import { useState } from "react";
import Image from "next/image";
import type { MediaAsset, ApiResponse } from "@/lib/media/types";

export default function Home() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [downloadAllLoading, setDownloadAllLoading] = useState(false);
  const [downloadAllError, setDownloadAllError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setStatus("loading");
    setErrorMessage("");
    setDownloadAllError("");
    setAssets([]);

    try {
      const response = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data: ApiResponse = await response.json();

      if (data.ok && data.assets) {
        setAssets(data.assets);
        setStatus("success");
      } else {
        setErrorMessage(
          data.message || "An error occurred. Please try again."
        );
        setStatus("error");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setErrorMessage("Request timeout. Please try again.");
      } else {
        setErrorMessage("Network error. Please check your connection and try again.");
      }
      setStatus("error");
    }
  };

  const handleDownloadAll = async () => {
    if (!assets.length || downloadAllLoading) {
      return;
    }

    setDownloadAllLoading(true);
    setDownloadAllError("");

    try {
      const response = await fetch("/api/download-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assets: assets.map(({ downloadUrl, filename }) => ({
            downloadUrl,
            filename,
          })),
        }),
      });

      const data = await response.json();

      if (response.ok && data.zipUrl) {
        const link = document.createElement("a");
        link.href = data.zipUrl;
        link.download = data.zipUrl.split("/").pop() || "media.zip";
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        setDownloadAllError(
          data.message || "Failed to prepare the archive. Please try again."
        );
      }
    } catch (error) {
      setDownloadAllError(
        error instanceof Error ? error.message : "Network error. Please try again."
      );
    } finally {
      setDownloadAllLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-8 lg:p-12">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">MultiMediaSaver</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Download images and videos from Twitter/X and Instagram
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
            No official API required • Instagram support coming soon
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex flex-col md:flex-row gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste Twitter/X or Instagram link here..."
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              disabled={status === "loading"}
            />
            <button
              type="submit"
              disabled={status === "loading" || !url.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {status === "loading" ? "Processing..." : "Download"}
            </button>
          </div>
        </form>

        {status === "loading" && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              Processing your link...
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-8">
            <p className="text-red-800 dark:text-red-200">{errorMessage}</p>
          </div>
        )}

        {status === "success" && assets.length > 0 && (
          <div>
            <div className="mb-4 flex justify-between items-center">
              <h2 className="text-xl font-semibold">
                Found {assets.length} media file{assets.length > 1 ? "s" : ""}
              </h2>
              <div className="text-right">
                <button
                  onClick={handleDownloadAll}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={downloadAllLoading}
                >
                  {downloadAllLoading ? "Preparing..." : "Download All"}
                </button>
                {downloadAllError && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                    {downloadAllError}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800"
                >
                  {asset.type === "image" ? (
                    <div className="relative w-full h-48">
                      <Image
                        src={asset.downloadUrl}
                        alt={asset.filename}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      />
                    </div>
                  ) : (
                    <video
                      src={asset.downloadUrl}
                      controls
                      className="w-full h-48 object-cover"
                    />
                  )}
                  <div className="p-3">
                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate mb-2">
                      {asset.filename}
                    </p>
                    <a
                      href={asset.downloadUrl}
                      download={asset.filename}
                      className="block w-full text-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
                    >
                      Download
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

