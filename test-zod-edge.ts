import { z } from "zod";

const schema = z.string().url().nullable().optional();

// This demonstrates the edge case behavior
const testCases = [
  { value: "http://localhost:9000/v1", desc: "valid URL" },
  { value: "", desc: "empty string" },
  { value: null, desc: "null" },
];

testCases.forEach(({ value, desc }) => {
  const result = schema.safeParse(value);
  console.log(`${desc}: ${result.success ? "✓" : "✗"}`);
  if (result.success) {
    console.log(`  -> ${JSON.stringify(result.data)}`);
  } else {
    console.log(`  -> error: ${result.error.issues[0].message}`);
  }
});
