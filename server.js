const express = require("express");
const { exec } = require("child_process");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

// 🔥 Add your channels here
const channels = {
  yt1: "https://www.youtube.com/watch?v=YGEgelAiUf0"
};

let streamCache = {};
let updating = {};

// 🔁 Update function (safe + controlled)
function updateChannel(id, url) {
  if (updating[id]) return; // prevent duplicate calls
  updating[id] = true;

  exec(`./yt-dlp -f best -g "${url}"`, { timeout: 15000 }, (err, stdout) => {
    updating[id] = false;

    if (err) {
      console.log(`❌ Error updating ${id}`);
      return;
    }

    const streamUrl = stdout.split("\n")[0];

    if (streamUrl && streamUrl.includes("m3u8")) {
      streamCache[id] = streamUrl;
      console.log(`✅ Updated ${id}`);
    }
  });
}

// 🔁 Auto अपडेट loop (every 30 sec)
setInterval(() => {
  for (let id in channels) {
    updateChannel(id, channels[id]);
  }
}, 30000);

// Run once at start
for (let id in channels) {
  updateChannel(id, channels[id]);
}

// 🎯 Serve M3U8
app.get("/:id.m3u8", async (req, res) => {
  const id = req.params.id;
  const source = streamCache[id];

  if (!source) {
    return res.send("⏳ Stream loading, try again...");
  }

  try {
    const response = await fetch(source);
    let text = await response.text();

    // 🔥 Rewrite all URLs → proxy
    text = text.replace(/https?:\/\/[^\n]+/g, (url) => {
      return `/proxy?url=${encodeURIComponent(url)}`;
    });

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.send(text);

  } catch (err) {
    res.send("❌ Failed to load m3u8");
  }
});

// 🎯 Proxy TS / segments
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
    res.send("❌ Proxy error");
  }
});

// 🟢 Root check
app.get("/", (req, res) => {
  res.send("YT M3U8 Proxy Running ✅");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
