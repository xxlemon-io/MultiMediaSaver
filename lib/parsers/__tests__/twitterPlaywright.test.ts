import { scrapeTwitterMediaWithPlaywright } from "../twitterPlaywright";

const mockEvaluate = jest.fn();
const mockGoto = jest.fn().mockResolvedValue(undefined);
const mockWaitForTimeout = jest.fn().mockResolvedValue(undefined);
const mockPageClose = jest.fn().mockResolvedValue(undefined);

const mockPage = {
  goto: mockGoto,
  waitForTimeout: mockWaitForTimeout,
  evaluate: mockEvaluate,
  close: mockPageClose,
};

const mockNewPage = jest.fn().mockResolvedValue(mockPage);
const mockContextClose = jest.fn().mockResolvedValue(undefined);
const mockNewContext = jest.fn().mockResolvedValue({
  newPage: mockNewPage,
  close: mockContextClose,
});
const mockBrowserClose = jest.fn().mockResolvedValue(undefined);

jest.mock("playwright", () => ({
  chromium: {
    launch: jest.fn(() =>
      Promise.resolve({
        newContext: mockNewContext,
        close: mockBrowserClose,
      })
    ),
  },
}));

const { chromium } = jest.requireMock("playwright");

describe("scrapeTwitterMediaWithPlaywright", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEvaluate.mockResolvedValue([]);
  });

  it("scrapes media and normalizes URLs", async () => {
    mockEvaluate.mockResolvedValue([
      { url: "https://pbs.twimg.com/media/test.jpg?name=small", type: "image" },
      { url: "https://pbs.twimg.com/media/test.jpg?name=medium", type: "image" },
      { url: "https://video.twimg.com/test.mp4?tag=10", type: "video" },
      { url: "https://video.twimg.com/test.mp4?tag=10", type: "video" },
    ]);

    const result = await scrapeTwitterMediaWithPlaywright("https://x.com/user/status/123");

    expect(chromium.launch).toHaveBeenCalled();
    expect(mockGoto).toHaveBeenCalledWith("https://x.com/user/status/123", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    expect(result).toEqual([
      { url: "https://pbs.twimg.com/media/test.jpg?name=large", type: "image" },
      { url: "https://video.twimg.com/test.mp4?tag=10", type: "video" },
    ]);
  });

  it("throws when no media found", async () => {
    mockEvaluate.mockResolvedValue([]);

    await expect(
      scrapeTwitterMediaWithPlaywright("https://x.com/user/status/404")
    ).rejects.toThrow("No media found via Playwright scraping");
  });
});

