export type MediaType = "image" | "video";

export interface MediaAsset {
  id: string;
  sourceUrl: string;
  downloadUrl: string;
  contentType: string;
  filename: string;
  provider: "twitter" | "instagram" | "xiaohongshu";
  type: MediaType;
}

export interface MediaProvider {
  canHandle(url: string): boolean;
  fetchMedia(url: string, sessionId: string): Promise<MediaAsset[]>;
}

export interface ApiResponse {
  ok: boolean;
  assets?: MediaAsset[];
  message?: string;
  sessionId?: string;
}

