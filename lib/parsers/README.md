# Parser Architecture

This directory now hosts the Playwright-based Twitter/X parser, plus future Instagram helpers.

## Playwright Scraper

- Uses `playwright` to launch Chromium with a realistic user-agent.
- Waits for network to become idle, then inspects `<img>`, `<video>`, and `<a>` elements for `pbs.twimg.com` / `video.twimg.com` URLs.
- Normalizes image URLs to `:orig` quality and deduplicates results.
- Requires the environment to support headless browsers. Run `npx playwright install chromium` after installing dependencies.

### Failure Modes

- Private / deleted tweets, heavy rate limiting, or network blocks.
- Misconfigured headless environments (e.g., missing `--no-sandbox` support on some hosts).

When a failure occurs, the scraper surfaces the specific Playwright error so you can inspect logs or retry manually.

## Instagram Parser

- Still relies on configurable parser endpoints (`INSTAGRAM_PARSER_ENDPOINT` / `INSTAGRAM_PARSER_KEY`).
- Configuration helpers live in `lib/config/parserEndpoints.ts`.

