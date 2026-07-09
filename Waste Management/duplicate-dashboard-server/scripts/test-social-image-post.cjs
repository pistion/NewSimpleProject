const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(repoRoot, ".env"));
loadEnvFile(path.join(repoRoot, ".env.local"));
loadEnvFile(path.join(repoRoot, "admin-dashboard", "backend", ".env"));

function readArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const publish = process.argv.includes("--publish");
const providerArg = readArg("provider", process.env.TEST_SOCIAL_PROVIDER || "all").toLowerCase();
const providers = providerArg === "all"
  ? ["linkedin", "facebook"]
  : providerArg.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);

const endpoint = String(
  process.env.MCP_ENDPOINT ||
  process.env.MCP_GATEWAY_URL ||
  process.env.ROXANNE_MCP_ENDPOINT ||
  process.env.ROXANNE_MCP_URL ||
  ""
).replace(/\/+$/, "");

const apiKey = String(
  process.env.MCP_API_KEY ||
  process.env.MCP_SECRET ||
  process.env.ROXANNE_MCP_API_KEY ||
  ""
).trim();

const userId = readArg("user", process.env.TEST_MCP_USER_ID || "heya:admin@heya.com.pg").trim();
const text = readArg(
  "text",
  process.env.TEST_SOCIAL_POST_TEXT || "Testing a social image post from the HEYA dashboard MCP proxy."
).trim();
const imagePath = path.resolve(
  repoRoot,
  readArg("image", process.env.TEST_SOCIAL_IMAGE_PATH || "public/imgs/heya-talent-solutions-mark.jpg")
);

const mimeByExt = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!endpoint) fail("Missing MCP_ENDPOINT.");
if (!apiKey) fail("Missing MCP_API_KEY.");
if (!fs.existsSync(imagePath)) fail(`Image file not found: ${imagePath}`);
if (!providers.length) fail("No provider selected. Use --provider=linkedin, --provider=facebook, or --provider=all.");

const unsupported = providers.filter((provider) => !["linkedin", "facebook"].includes(provider));
if (unsupported.length) fail(`Unsupported provider(s): ${unsupported.join(", ")}`);

const imageName = path.basename(imagePath);
const imageMimeType = mimeByExt[path.extname(imagePath).toLowerCase()] || "application/octet-stream";
const imageBase64 = fs.readFileSync(imagePath).toString("base64");

function buildPayload(provider) {
  const image = {
    filename: imageName,
    name: imageName,
    mimeType: imageMimeType,
    type: imageMimeType,
    contentBase64: imageBase64,
    altText: "HEYA Talent Solutions social post image"
  };

  return {
    tool: provider === "linkedin" ? "linkedin_post" : "facebook_post",
    provider,
    userId,
    dryRun: !publish,
    text,
    content: text,
    image,
    media: [{ type: "image", ...image }]
  };
}

async function runProvider(provider) {
  const response = await fetch(`${endpoint}/execute`, {
    method: "POST",
    headers: {
      "Accept": "application/json, text/plain;q=0.9, */*;q=0.8",
      "Authorization": `Bearer ${apiKey}`,
      "x-mcp-api-key": apiKey,
      "x-heya-mcp-source": "heya-dashboard-social-test",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildPayload(provider))
  });

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  return {
    provider,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    data,
    raw: data ? undefined : raw.slice(0, 1000)
  };
}

(async () => {
  const results = [];
  for (const provider of providers) {
    results.push(await runProvider(provider));
  }

  console.log(JSON.stringify({
    ok: results.every((result) => result.ok),
    mode: publish ? "publish" : "dry-run",
    endpoint,
    userId,
    text,
    image: {
      path: imagePath,
      filename: imageName,
      mimeType: imageMimeType,
      bytes: fs.statSync(imagePath).size
    },
    results
  }, null, 2));

  if (results.some((result) => !result.ok)) process.exit(1);
})().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
