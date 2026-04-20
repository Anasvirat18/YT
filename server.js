const express = require("express");
const { exec } = require("child_process");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

// 🔥 Use CHANNEL ID (not video link)
const channels = {
  yt1: "https://www.youtube.com/channel/UCwXrBBZnIh2ER4lal6WbAHw/live"
};

let streamCache = {};
let updating = {};

// 🔁 Get LIVE stream from channel
function updateChannel(id, url) {
  if (updating[id]) return;
  updating[id] = true;

  // 👇 IMPORTANT: this fetches current LIVE video automatically
  exec(`./yt-dlp -f best -g "${url}"`, { timeout: 20000 }, (err, stdout) => {
    updating[id] = false;

    if (err) {
      console.log(`❌ ${id} not live or error`);
      return;
    }

    const streamUrl = stdout.split("\n")[0];

    if (streamUrl && streamUrl.includes("m3u8")) {
      streamCache[id] = streamUrl;
      console.log(`✅ Updated LIVE for ${id}`);
    } else {
      console.log(`⚠️ ${id} not live`);
    }
  });
}

// 🔁 Auto refresh
setInterval(() => {
  for (let id in channels) {
    updateChannel(id, channels[id]);
  }
}, 30000);

// Run once
for (let id in channels) {
  updateChannel(id, channels[id]);
}

// 🎯 Serve M3U8
app.get("/:id.m3u8", async (req, res) => {
  const id = req.params.id;
  const source = streamCache[id];

  if (!source) {
    return res.send("⏳ Channel not live / loading...");
  }

  try {
    const r = await fetch(source);
    let text = await r.text();

    // rewrite URLs
    text = text.replace(/https?:\/\/[^\n]+/g, (u) => {
      return `/proxy?url=${encodeURIComponent(u)}`;
    });

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.send(text);

  } catch {
    res.send("❌ Failed to load stream");
  }
});

// 🎯 Segment proxy
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

app.get("/", (req, res) => {
  res.send("YT Channel Live Proxy Running ✅");
});

app.listen(PORT, () => console.log("🚀 Running"));
