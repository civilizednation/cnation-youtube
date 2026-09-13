export type Quality = { id: string; height: number; width: number; fps: number; size: number; codec: string; hasAudio: boolean; photoCompatible: boolean };
export type VideoInfo = { title: string; channel: string; duration: number; thumbnail: string; qualities: Quality[] };
export type JobState = {
  phase: "preparing" | "analyzing" | "ready" | "downloading" | "merging" | "uploading" | "complete" | "failed" | "canceled";
  message: string; progress?: number; speed?: number; eta?: number; video?: VideoInfo;
  filename?: string; size?: number; height?: number; expiresAt?: number; diagnostics?: string;
};
