import { pool } from "./db/connection";

async function main() {
  const addresses = [
    "5EBkFN1Vuvr6ykswSZrjC9EuuHNCRuA59FLqYaJ9a3AZ",
    "ETmEgcacRsi4gdqQiGxWXEziEHACAbJNuaUa44pNjTaC",
    "GPu3RvoSpxbeBoS1Cw485uDAvh3XKfyNxtyEzEfktzjs",
    "5aRAuMMMvJBYbML4HqUScTNt9cJXwDtmAp1HW4djyoAd"
  ];
  try {
    const [rows] = await pool.query(
      "SELECT * FROM sync_cursors WHERE address IN (?)",
      [addresses]
    );
    console.log("SYNC CURSORS FOR ADDRESSES:");
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

main();
