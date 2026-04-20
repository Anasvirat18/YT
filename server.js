const express = require("express");
const { exec } = require("child_process");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

// 🔥 YOUR CHANNEL ID
const channels = {
  yt1: "UCwXrBBZnIh2ER4lal6WbAHw"
};

let streamCache = {};
let updating = {};

// 🔁 STEP 1: Get LIVE video ID (reliable method)
function getLiveVideoId(channelId, callback) {
  const url = `https://www.youtube.com/channel/${channelId}/streams`;

  exec(
    `./yt-dlp --flat-playlist --print "%(id)s" --no-warnings --user-agent "Mozilla/5.0" "${url}"`,
    { timeout: 15000 },
    (err, stdout, stderr) => {
      console.log("📺 RAW VIDEO LIST:", stdout);

      if (err || !stdout) {
        console.log("❌ Failed to get video list");
        return callback(null);
      }

      // first video = usually live
      const videoId = stdout.split("\n").filter(Boolean)[0];

      console.log("🎯 Selected Video ID:", videoId);
      callback(videoId || null);
    }
  );
}

// 🔁 STEP 2: Get M3U8
function getM3U8(videoId, callback) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  exec(
    `./yt-dlp -f "bv*+ba/b[protocol^=m3u8]" -g --no-warnings --user-agent "Mozilla/5.0" "${videoUrl}"`,
    { timeout: 20000 },
    (err, stdout, stderr) => {
      console.log("📡 RAW STREAM URLS:", stdout);

      if (err || !stdout) {
        console.log("❌ Failed to get m3u8");
        return callback(null);
      }

      const lines = stdout.split("\n").filter(Boolean);

      // 🔥 find real m3u8
      const m3u8 = lines.find((l) => l.includes("m3u8"));

      console.log("🎯 M3U8 FOUND:", m3u8);

      callback(m3u8 || null);
    }
  );
}

// 🔁 UPDATE CHANNEL
function updateChannel(id, channelId) {
  if (updating[id]) return;
  updating[id] = true;

  getLiveVideoId(channelId, (videoId) => {
    if (!videoId) {
      updating[id] = false;
      console.log("⚠️ No live video found");
      return;
    }

    getM3U8(videoId, (m3u8) => {
      updating[id] = false;

      if (m3u8) {
        streamCache[id] = m3u8;
        console.log(`✅ UPDATED ${id}`);
      } else {
        console.log("⚠️ No m3u8 extracted");
      }
    });
  });
}

// 🔁 AUTO REFRESH (30 sec)
setInterval(() => {
  for (let id in channels) {
    updateChannel(id, channels[id]);
  }
}, 30000);

// Run once on start
for (let id in channels) {
  updateChannel(id, channels[id]);
}

// 🎯 SERVE M3U8
app.get("/:id.m3u8", async (req, res) => {
  const id = req.params.id;
  const source = streamCache[id];

  if (!source) {
    return res.send("⏳ Waiting for live stream...");
  }

  try {
    const r = await fetch(source);
    let text = await r.text();

    // rewrite URLs → proxy
    text = text.replace(/https?:\/\/[^\n]+/g, (u) => {
      return `/proxy?url=${encodeURIComponent(u)}`;
    });

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.send(text);
  } catch (err) {
    console.log("❌ Error fetching m3u8");
    res.send("Stream error");
  }
});

// 🎯 TS PROXY
app.get("/proxy", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.send("No URL");

  try {
    const r = await fetch(url);
    res.setHeader("Content-Type", r.headers.get("content-type"));
    r.body.pipe(res);
  } catch (err) {
    console.log("❌ Proxy failed");
    res.send("Proxy error");
  }
});

// ROOT
app.get("/", (req, res) => {
  res.send("YT LIVE PROXY RUNNING ✅");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
