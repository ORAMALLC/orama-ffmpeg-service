import express from "express";
import axios from "axios";
import { execFile } from "child_process";
import fs from "fs";
import ffmpegPath from "ffmpeg-static";

const app = express();
app.use(express.json({ limit: "1mb" }));

/**
 * POST /convert
 * Body: { "imageUrl": "https://....jpg" }
 * Returns: MP4 (8 seconds) 720x1280 (9:16) optimized for low memory (Render Free)
 */
app.post("/convert", async (req, res) => {
  try {
    const { imageUrl } = req.body || {};
    if (!imageUrl) return res.status(400).send("Missing imageUrl");

    // Use /tmp on Render for temp files
    const inputPath = "/tmp/input.jpg";
    const outputPath = "/tmp/output.mp4";

    // Download image as stream (avoid loading into memory)
    const response = await axios({
      url: imageUrl,
      method: "GET",
      responseType: "stream",
      timeout: 60000,
      maxContentLength: 10 * 1024 * 1024, // 10MB
      maxBodyLength: 10 * 1024 * 1024,    // 10MB
      headers: {
        // Helps with some CDNs
        "User-Agent": "orama-ffmpeg-service/1.0"
      }
    });

    const writer = fs.createWriteStream(inputPath);
    response.data.pipe(writer);

    writer.on("error", (err) => {
      console.error("write error:", err);
      return res.status(500).send("Error saving image");
    });

    writer.on("finish", () => {
      // ffmpeg args optimized for low memory/CPU
      // - 8 seconds
      // - 24 fps
      // - 720x1280 (Reels-friendly and lighter than 1080x1920)
      // - CRF 28 reduces file size and memory
      // - threads 1 reduces spikes
      const args = [
        "-y",
        "-hide_banner",
        "-loglevel", "error",
        "-loop", "1",
        "-i", inputPath,
        "-t", "8",
        "-r", "24",
        "-vf", "scale=720:1280,format=yuv420p",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "28",
        "-threads", "1",
        "-movflags", "+faststart",
        outputPath
      ];

      execFile(ffmpegPath, args, (error) => {
        if (error) {
          console.error("ffmpeg error:", error);
          safeCleanup(inputPath, outputPath);
          return res.status(500).send("Error converting video");
        }

        // Stream the MP4 file back (no big memory usage)
        res.setHeader("Content-Type", "video/mp4");
        res.setHeader("Content-Disposition", 'inline; filename="output.mp4"');

        const videoStream = fs.createReadStream(outputPath);
        videoStream.pipe(res);

        videoStream.on("error", (err) => {
          console.error("read stream error:", err);
          safeCleanup(inputPath, outputPath);
          // If headers already sent, just end
          try { res.end(); } catch (_) {}
        });

        videoStream.on("close", () => {
          safeCleanup(inputPath, outputPath);
        });
      });
    });

  } catch (err) {
    console.error("server error:", err);
    return res.status(500).send("Server error");
  }
});

function safeCleanup(inputPath, outputPath) {
  fs.unlink(inputPath, () => {});
  fs.unlink(outputPath, () => {});
}

// Health check (optional but helpful)
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

// IMPORTANT: Render uses a dynamic PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
