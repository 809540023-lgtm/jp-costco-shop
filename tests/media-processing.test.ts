import { describe, expect, it } from "vitest";
import { classifyMedia, keyFrameArgs } from "../lib/media-processing";

describe("Costco media processing", () => {
  it("recognizes HEIC from MIME type or extension", () => {
    expect(classifyMedia("image/heic", "IMG_0001.HEIC")).toBe("HEIC");
    expect(classifyMedia("application/octet-stream", "IMG_0002.heif")).toBe("HEIC");
  });

  it("keeps MOV in the video path", () => {
    expect(classifyMedia("video/quicktime", "IMG_8908.MOV")).toBe("VIDEO");
  });

  it("caps key-frame extraction at six JPEG files", () => {
    const args = keyFrameArgs("/tmp/input.mov", "/tmp/frame-%02d.jpg");
    expect(args).toContain("fps=1/5,scale=1600:-2:force_original_aspect_ratio=decrease");
    expect(args.slice(args.indexOf("-frames:v"), args.indexOf("-frames:v") + 2)).toEqual(["-frames:v", "6"]);
  });
});
