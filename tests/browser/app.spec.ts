import { test, expect } from "@playwright/test";
const video = { title: "Big Buck Bunny · 테스트 영상", channel: "Blender", duration: 60, thumbnail: "", qualities: [{ id: "137", height: 1080, width: 1920, fps: 30, size: 1000000, codec: "avc1", hasAudio: false, photoCompatible: true }, { id: "18", height: 360, width: 640, fps: 30, size: 500000, codec: "avc1", hasAudio: true, photoCompatible: true }] };

test("name, setup notice and mobile layout", async ({ page }) => {
  await page.route("**/api/session", route => route.fulfill({ json: { configured: false, authenticated: false } }));
  await page.goto("/");
  await expect(page).toHaveTitle("cnation 유투브 다운로더");
  await expect(page.getByLabel("cnation 유투브 다운로더 홈")).toBeVisible();
  await expect(page.getByText("앱 설정을 마무리해 주세요")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test("inspect, select actual quality, complete and reset (mock cloud)", async ({ page }) => {
  let phase = "ready";
  await page.route("**/api/session", route => route.fulfill({ json: { configured: true, authenticated: true } }));
  await page.route("**/api/jobs", route => route.fulfill({ status: 202, json: { token: "test-job-token" } }));
  await page.route("**/api/jobs/status", route => route.fulfill({ json: { phase, message: phase === "ready" ? "화질 선택" : "저장 완료", video, height: 1080, size: 1000000, filename: "test.mp4", expiresAt: Date.now() + 86400000 } }));
  await page.route("**/api/jobs/download", async route => {
    expect(route.request().postDataJSON()).toEqual({ quality: "137", container: "mp4", destination: "photos" });
    phase = "complete"; await route.fulfill({ status: 202, json: { ok: true } });
  });
  await page.route("**/api/jobs/cancel", route => route.fulfill({ json: { ok: true } }));
  await page.goto("/");
  await page.getByLabel("유튜브 영상 링크").fill("https://youtu.be/YE7VzlLtp-4");
  await page.getByRole("button", { name: "영상 확인", exact: true }).click();
  await expect(page.getByRole("heading", { name: video.title })).toBeVisible();
  await expect(page.getByLabel("원하는 해상도")).toHaveValue("137");
  await page.getByRole("button", { name: "동영상 준비하기" }).click();
  await expect(page.getByText("저장할 준비가 끝났어요.", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: "파일로 다운로드", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "서버 파일 삭제하고 새 영상" }).click();
  await expect(page.getByText("어떤 영상을 저장할까요?")).toBeVisible();
});

test("expired jobs recover without trapping the next download", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("clipdown-job", "expired-token"));
  await page.route("**/api/session", route => route.fulfill({ json: { configured: true, authenticated: true } }));
  await page.route("**/api/jobs/status", route => route.fulfill({ status: 410, json: { error: "이 작업은 만료되었습니다." } }));
  await page.goto("/");
  await expect(page.getByRole("region", { name: "영상 다운로드" }).getByRole("alert")).toContainText("만료");
  expect(await page.evaluate(() => localStorage.getItem("clipdown-job"))).toBeNull();
});
