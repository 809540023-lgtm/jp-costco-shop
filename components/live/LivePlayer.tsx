"use client";
import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

interface Props {
  src: string; // 直播串流網址（.m3u8 用 HLS；其餘直接播放）
}

export default function LivePlayer({ src }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<string>("直播載入中…");
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls: Hls | null = null;

    const isHls = /\.m3u8($|\?)/.test(src);
    if (isHls) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src; // iOS 原生支援 HLS
      } else if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(src);
        hls.attachMedia(video);
      }
    } else {
      video.src = src;
    }

    video.addEventListener("loadedmetadata", () => setStatus("直播中"));
    video.addEventListener("error", () => setStatus("無法載入直播，請稍後再試"));

    return () => { if (hls) hls.destroy(); };
  }, [src]);

  // 一鍵截圖並存到手機
  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return;

    const file = new File([blob], `costco-live-${Date.now()}.jpg`, { type: "image/jpeg" });

    // 手機：透過分享面板儲存到照片
    const nav = navigator as any;
    if (nav.canShare && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: "Costco 直播截圖", text: "直播中看到的好商品" });
      } catch { /* 使用者取消 */ }
    } else {
      // 桌面/無法分享：下載檔案
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `costco-live-${Date.now()}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    setFlash(true);
    setTimeout(() => setFlash(false), 300);
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      <video
        ref={videoRef}
        controls
        playsInline
        crossOrigin="anonymous"
        className="aspect-video w-full"
      />

      {flash ? <div className="pointer-events-none absolute inset-0 bg-white opacity-40" /> : null}

      {/* 直播中標籤 */}
      <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
        <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> LIVE
      </div>

      {/* 大截圖按鈕（靠右，方便拇指操作，適合年長用戶） */}
      <button
        onClick={capture}
        aria-label="截圖儲存"
        className="absolute right-4 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1 rounded-3xl bg-brand px-5 py-6 text-white shadow-lg active:scale-95"
        style={{ minWidth: "5.5rem" }}
      >
        <span className="text-4xl">📸</span>
        <span className="text-base font-extrabold leading-tight">截圖<br />儲存</span>
      </button>

      <div className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white">{status}</div>
    </div>
  );
}
