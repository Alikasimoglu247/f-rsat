import "dotenv/config";
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith("_test"))
  throw new Error("Entegrasyon testleri ayrı *_test veritabanı gerektirir.");
process.env.DATABASE_URL = testUrl;
