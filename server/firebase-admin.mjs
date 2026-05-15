import admin from "firebase-admin";

export function getAdminDb(databaseURL) {
  if (!databaseURL) throw new Error("FIREBASE_DATABASE_URL is not configured");
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      databaseURL
    });
  }
  return admin.database();
}
