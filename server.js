const express = require("express");
const { exec } = require("child_process");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

// 🔥 Your channels
const channels = {
  yt1: "https://www.youtube.com/watch?v=YGEgelAiUf0"
};

let streamCache = {};

// 🔁 Update each channel
function updateChannel(id, url) {
  exec(`yt-dlp -f best -g "${url}"`, (err, stdout) => {
    if (err) return console.log("Error:", id);

    const streamUrl = stdout.split("\n")[0];

    if (streamUrl && streamUrl.includes("m3u8")) {
      streamCache[id] = streamUrl;
      console.log("Updated:", id);
    }
  });
}

// 🔁 Loop every 30 sec
setInterval(() => {
  for (let id in channels) {
    updateChannel(id, channels[id]);
  }
}, 30000);

// Run once on start
for (let id in channels) {
  updateChannel(id, channels[id]);
}

// 🎯 M3U8 endpoint
app.get("/:id.m3u8", async (req, res) => {
  const id = req.params.id;
  const url = streamCache[id];

  if (!url) return res.send("Stream not ready");

  try {
    const r = await fetch(url);
    let text = await r.text();

    // rewrite URLs
    text = text.replace(/https?:\/\/[^\n]+/g, (u) => {
      return `/proxy?url=${encodeURIComponent(u)}`;
    });

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.send(text);

  } catch {
    res.send("Error loading stream");
  }
});

// 🎯 TS proxy
app.get("/proxy", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.send("No URL");

  try {
    const r = await fetch(url);
    res.setHeader("Content-Type", r.headers.get("content-type"));
    r.body.pipe(res);
  } catch {
    res.send("Proxy error");
  }
});

app.listen(PORT, () => console.log("Running"));
