import { Application, Router } from "https://deno.land/x/oak@v17.1.4/mod.ts";
import { google } from "npm:googleapis";

// Load environment variables (for storing Google service account credentials)
// const SERVICE_ACCOUNT_KEY = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT") || "{}");
const SERVICE_ACCOUNT_JSON = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT") || "{}");
const SHEET_ID = Deno.env.get("GOOGLE_SHEET_ID") || "";

const cache = { data: null, timestamp: 0 } as { data: any; timestamp: number };
const CACHE_TTL = 60 * 60 * 1000; // Cache duration: 60 minutes

const router = new Router();

// Endpoint to manually refresh cache
router.get("/refresh", async (ctx) => {
  try {
    cache.data = await fetchSheetData();
    cache.timestamp = Date.now();
    ctx.response.body = { message: "Cache updated", data: cache.data };
  } catch (err) {
    console.error(err);
    ctx.response.status = 500;
    ctx.response.body = { error: err instanceof Error ? err.message : "An Error has occurred" };
  }
});

// Endpoint to return cached data (fetching if needed)
router.get("/data", async (ctx) => {
  const now = Date.now();

  if (!cache.data || now - cache.timestamp > CACHE_TTL) {
    console.log("Cache expired. Fetching new data...");
    try {
      cache.data = await fetchSheetData();
      cache.timestamp = now;
    } catch (err) {
      console.error(err);
      ctx.response.status = 500;
      ctx.response.body = { error: "Failed to fetch data" };
      return;
    }
  }

  ctx.response.body = cache.data;
});

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

console.log("Server running on http://localhost:8000");
await app.listen({ port: 8000 });

// ---- Functions ----

// Function to fetch data from Google Sheets
async function fetchSheetData() {
  console.log(Deno.env.toObject());
  if (!SHEET_ID) throw new Error("Missing SHEET_ID");

  // Auth
  const auth = await google.auth.getClient({
    credentials: SERVICE_ACCOUNT_JSON,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Sheet1!A1:E4",
  });

  if (response.status !== 200) {
    console.log({
      error: true,
      status: response.status,
      data: response.data,
    });

    return [];
  }

  // if we're here, then we can attempt to build the JSON
  return buildSheetToJson(response.data);
}

function buildSheetToJson(data) {
  return data.values.map((row) => {
    return {
      name: row[0],
      email: row[1],
      phone: row[2],
      address: row[3],
      notes: row[4],
    };
  });
}
