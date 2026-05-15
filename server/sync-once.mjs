import "dotenv/config";
import { getAdminDb } from "./firebase-admin.mjs";
import { syncFootballData } from "./football-data-sync.mjs";

const db = getAdminDb(process.env.FIREBASE_DATABASE_URL);
const result = await syncFootballData({ db, token: process.env.FOOTBALL_DATA_TOKEN });
console.log(result);
