const express = require("express");
const { exec } = require("child_process");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

// 🔥 Channel ID
const channels = {
  yt1: "UCwXrBBZnIh2ER4lal6WbAHw"
};

let streamCache = {};
let updating = {};

// 🔁 Step 1: Get LIVE video ID
function getLiveVideoId(channelId, callback) {
  const url = `https://www.youtube.com/channel/${channelId}/live`;

  exec(`./yt-dlp --get-id "${url}"`, { timeout: 15000 }, (err, stdout) => {
    if (err || !stdout) {
      console.log("❌ Failed to get video ID");
      return callback(null);
    }

    const videoId = stdout.trim();
    console.log("🎯 Live Video ID:", videoId);

    callback(videoId);
  });
}

// 🔁 Step 2: Get M3U8 from video
function getM3U8(videoId, callback) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  exec(
    `./yt-dlp -f "bv*+ba/b[protocol^=m3u8]" -g "${videoUrl}"`,
    { timeout: 20000 },
    (err, stdout) => {
      if (err || !stdout) {
        console.log("❌ Failed to get m3u8");
        return callback(null);
      }

      const lines = stdout.split("\n").filter(Boolean);
      const m3u8 = lines.find((l) => l.includes("m3u8"));

      console.log("M3U8:", m3u8);

      callback(m3u8 || null);
    }
  );
}

// 🔁 Update channel stream
function updateChannel(id, channelId) {
  if (updating[id]) return;
  updating[id] = true;

  getLiveVideoId(channelId, (videoId) => {
    if (!videoId) {
      updating[id] = false;
      return;
    }

    getM3U8(videoId, (m3u8) => {
      updating[id] = false;

      if (m3u8) {
        streamCache[id] = m3u8;
        console.log(`✅ Updated ${id}`);
      } else {
        console.log(`⚠️ No m3u8 found`);
      }
    });
  });
}

// 🔁 Auto refresh every 30 sec
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
    return res.send("⏳ Waiting for live stream...");
  }

  try {
    const r = await fetch(source);
    let text = await r.text();

    // rewrite segment URLs
    text = text.replace(/https?:\/\/[^\n]+/g, (u) => {
      return `/proxy?url=${encodeURIComponent(u)}`;
    });

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.send(text);
  } catch {
    res.send("❌ Failed to load stream");
  }
});

// 🎯 Proxy TS
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
  res.send("YT LIVE PROXY RUNNING ✅");
});

app.listen(PORT, () => {
  console.log("🚀 Server started");
});
