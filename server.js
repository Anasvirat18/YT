const express = require("express");
const { exec } = require("child_process");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

// 🔥 CHANNEL → LIVE URL
const channels = {
  yt1: "https://www.youtube.com/channel/UCwXrBBZnIh2ER4lal6WbAHw/live"
};

let streamCache = {};
let updating = {};

// 🔁 Extract LIVE M3U8
function updateChannel(id, url) {
  if (updating[id]) return;
  updating[id] = true;

  exec(
    `./yt-dlp -f "bv*+ba/b[protocol^=m3u8]" -g "${url}"`,
    { timeout: 20000 },
    (err, stdout, stderr) => {
      updating[id] = false;

      console.log(`\n🔍 Checking ${id}...`);

      if (err) {
        console.log("❌ yt-dlp error");
        console.log(stderr);
        return;
      }

      const lines = stdout.split("\n").filter(Boolean);

      console.log("OUTPUT:", lines);

      // 🔥 Find m3u8 link
      const streamUrl = lines.find((l) => l.includes("m3u8"));

      if (streamUrl) {
        streamCache[id] = streamUrl;
        console.log("✅ M3U8 FOUND & UPDATED");
      } else {
        console.log("⚠️ No m3u8 found (maybe DASH only)");
      }
    }
  );
}

// 🔁 AUTO REFRESH (30 sec)
setInterval(() => {
  for (let id in channels) {
    updateChannel(id, channels[id]);
  }
}, 30000);

// Run once at start
for (let id in channels) {
  updateChannel(id, channels[id]);
}

// 🎯 SERVE M3U8
app.get("/:id.m3u8", async (req, res) => {
  const id = req.params.id;
  const source = streamCache[id];

  if (!source) {
    return res.send("⏳ Channel not live / loading...");
  }

  try {
    const response = await fetch(source);
    let text = await response.text();

    // 🔥 Rewrite URLs → proxy
    text = text.replace(/https?:\/\/[^\n]+/g, (url) => {
      return `/proxy?url=${encodeURIComponent(url)}`;
    });

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.send(text);

  } catch (err) {
    console.log("❌ Error fetching m3u8");
    res.send("Stream error");
  }
});

// 🎯 PROXY TS SEGMENTS
app.get("/proxy", async (req, res) => {
  const url = req.query.url;

  if (!url) {
    return res.send("No URL");
  }

  try {
    const r = await fetch(url);

    res.setHeader(
      "Content-Type",
      r.headers.get("content-type") || "application/octet-stream"
    );

    r.body.pipe(res);

  } catch (err) {
    console.log("❌ Proxy error");
    res.send("Proxy failed");
  }
});

// 🟢 ROOT CHECK
app.get("/", (req, res) => {
  res.send("YT LIVE PROXY RUNNING ✅");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
