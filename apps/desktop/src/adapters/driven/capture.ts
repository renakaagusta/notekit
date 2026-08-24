// SPDX-License-Identifier: MIT
// Driven adapter: screenshot the renderer's WebContents (whole page or a
// sub-rect) into a PNG data URL. The main process drives this on the sender
// that issued the capture request.

import type { WebContents } from "electron";
import type { AppCapturePagePayload } from "../../domain/ipc-contract";

export async function capturePageDataUrl(
  webContents: WebContents,
  payload: AppCapturePagePayload,
): Promise<string | null> {
  const r = payload?.rect;
  // Electron's capturePage rect is in device-independent (CSS) pixels,
  // matching getBoundingClientRect, so no DPR scaling needed here.
  const rect =
    r && r.width > 0 && r.height > 0
      ? {
          x: Math.max(0, Math.round(r.x)),
          y: Math.max(0, Math.round(r.y)),
          width: Math.round(r.width),
          height: Math.round(r.height),
        }
      : undefined;
  try {
    const image = rect
      ? await webContents.capturePage(rect)
      : await webContents.capturePage();
    return image.isEmpty() ? null : image.toDataURL();
  } catch {
    return null;
  }
}
