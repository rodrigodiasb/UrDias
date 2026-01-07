import { openDB } from "idb";

const DB_NAME = "triagem-gu-db";
const DB_VERSION = 1;

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("kv")) {
        db.createObjectStore("kv");
      }
    }
  });
}

export async function loadState() {
  const db = await getDB();
  const state = await db.get("kv", "state");
  return state || null;
}

export async function saveState(state) {
  const db = await getDB();
  await db.put("kv", state, "state");
}

export async function clearAll() {
  const db = await getDB();
  await db.clear("kv");
}
