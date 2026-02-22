import express from "express";
import axios from "axios";
import { exec } from "child_process";
import fs from "fs";

const app = express();
app.use(express.json());

app.post("/convert", async (req, res) => {
  try {
    const { imageUrl } = req.body;

    const inputPath = "./input.jpg";
    const outputPath = "./output.mp4";

    const response = await axios({
      url: imageUrl,
      method: "GET",
      responseType: "stream",
    });

    const writer = fs.createWriteStream(inputPath);
    response.data.pipe(writer);

    writer.on("finish", () => {
      exec(
        `ffmpeg -loop 1 -i input.jpg -t 8 -r 30 -vf scale=1080:1920,format=yuv420p output.mp4`,
        (error) => {
          if (error) {
            return res.status(500).send("Error converting video");
          }

          res.download(outputPath);
        }
      );
    });
  } catch (error) {
    res.status(500).send("Server error");
  }
});

app.listen(3000, () => console.log("Server running"));
