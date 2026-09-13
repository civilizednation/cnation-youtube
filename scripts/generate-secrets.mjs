import { randomBytes } from "node:crypto";
console.log("Vercel 환경 변수에 각각 입력하세요. 이 값들을 GitHub에 올리지 마세요.\n");
for (const [key, count] of [["APP_ACCESS_CODE", 18], ["APP_SECRET", 48], ["CRON_SECRET", 32]]) console.log(`${key}=${randomBytes(count).toString("base64url")}`);
