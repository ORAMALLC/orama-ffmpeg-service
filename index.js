import express from "express";
import axios from "axios";
import { execFile } from "child_process";
import fs from "fs";
import ffmpegPath from "ffmpeg-static";

const app = express();
app.use(express.json());

// Endpoint: POST /convert
// Body: { "imageUrl": "https://....jpg" }
// Respuesta: MP4 de 8 segundos (9:16)
app.post("/convert", async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).send("Missing imageUrl");

    const inputPath = "./input.jpg";
    const outputPath = "./output.mp4";

    // Descargar imagen
    const response = await axios({
      url: imageUrl,
      method: "GET",
      responseType: "stream",
    });

    const writer = fs.createWriteStream(inputPath);
    response.data.pipe(writer);

    writer.on("finish", () => {
      const args = [
        "-loop", "1",
        "-i", inputPath,
        "-t", "8",
        "-r", "30",
        "-vf", "scale=1080:1920,format=yuv420p",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        outputPath,
      ];

      execFile(ffmpegPath, args, (error) => {
        if (error) {
          console.error("ffmpeg error:", error);
          return res.status(500).send("Error converting video");
        }

        res.setHeader("Content-Type", "video/mp4");
        return res.sendFile(outputPath, { root: "." });
      });
    });

    writer.on("error", (err) => {
      console.error("download error:", err);
      return res.status(500).send("Error downloading image");
    });

  } catch (error) {
    console.error("server error:", error);
    res.status(500).send("Server error");
  }
});

// Render usa PORT dinámico. Esto es clave.
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
