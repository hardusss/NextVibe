import axios from "axios";
import { env } from "./config/env";

async function main() {
  const sigs = [
    "59VdJPUVV8advRAGbRox4cArfCaLnsmfCq1ej6puV6F4M7XwaRgvVRtK7XseWUBdNdoZu3XNMAgbKzdhNWbEMvf6",
    "35ScLtTYTfKUNbGN2guReX45Ah4tLPybjxi5n1c1R4hKQ7ca5AfTgpyT88AAfekThxGgw9TwPeKJG345YTpxtv92"
  ];
  const url = `https://api.helius.xyz/v0/transactions/?api-key=${env.HELIUS_API_KEY}`;
  try {
    const response = await axios.post(url, { transactions: sigs });
    console.log(JSON.stringify(response.data, null, 2));
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

main();
