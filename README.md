# MultiMediaSaver

A responsive web application for downloading images and videos from Twitter/X and Instagram without using official APIs.

## Overview

MultiMediaSaver bundles a Playwright-powered scraper and a Next.js UI so you can self-host a downloader for Twitter/X today and Instagram in the future. The backend can also be called programmatically to automate downloads or integrate with other internal tools (non-commercial only).

## Key Features

- Download images and videos from Twitter/X links
- Planned Instagram support via remote parsers
- Automatic cleanup removes previous downloads when parsing a new link
- Batch download every fetched asset as a ZIP archive
- Responsive design for mobile and desktop
- No official API required; uses a self-hosted Playwright scraper

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Node.js

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd MultiMediaSaver
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Install Playwright browsers (Chromium only):
   ```bash
   npx playwright install chromium
   ```
4. Configure environment variables:
   ```bash
   # Copy env.local.example to .env.local
   # Windows PowerShell
   Copy-Item env.local.example .env.local
   # Linux / macOS
   cp env.local.example .env.local
   ```
   Edit `.env.local` if you plan to enable the future Instagram parser.
5. The downloads directory will be created automatically in `tmp/downloads` when needed.
6. Start the development server:
   ```bash
   npm run dev
   ```
7. Open [http://localhost:3000](http://localhost:3000).

## Configuration

### Twitter/X Scraper

- Uses Playwright with headless Chromium to load the tweet and extract media URLs from the rendered DOM.
- Requires the server environment to support running headless browsers (or Playwright's Chromium build).
- If Playwright fails (private/deleted tweets, rate limiting, etc.), the API surfaces the specific error so you can retry or inspect logs. No external parser is required.

### Instagram (Future)

- Instagram support will rely on configurable parser endpoints:
  ```bash
  INSTAGRAM_PARSER_ENDPOINT=https://api.example.com/instagram
  INSTAGRAM_PARSER_KEY=optional-api-key
  ```

## API Usage

The backend endpoints can be invoked directly.

### `POST /api/media`

Request body:

```json
{
  "url": "https://x.com/user/status/1234567890"
}
```

Success response:

```json
{
  "ok": true,
  "assets": [
    {
      "id": "0a7c8c2d-4f2f-4c12-8d0f-7f4b4f4a2f16",
      "sourceUrl": "https://pbs.twimg.com/media/xxxx.jpg:orig",
      "downloadUrl": "/downloads/1711100000000-abcd1234.jpg",
      "contentType": "image/jpeg",
      "filename": "1711100000000-abcd1234.jpg",
      "provider": "twitter",
      "type": "image"
    }
  ]
}
```

- `downloadUrl` is relative; prepend your host when sharing externally.
- `type` is `image` or `video`.

Error response:

```json
{
  "ok": false,
  "message": "Tweet not found or inaccessible. Possible reasons: ..."
}
```

Example:

```bash
curl -X POST http://localhost:3000/api/media \
  -H "Content-Type: application/json" \
  -d '{"url": "https://x.com/user/status/1234567890"}'
```

### `POST /api/download-all`

Bundle previously fetched assets (from `/api/media`) into a single ZIP file stored in the temporary downloads directory (`tmp/downloads`).

Request body:

```json
{
  "assets": [
    {
      "downloadUrl": "/downloads/1711100000000-abcd1234.jpg",
      "filename": "1711100000000-abcd1234.jpg"
    }
  ]
}
```

Success response:

```json
{
  "ok": true,
  "zipUrl": "/downloads/1711105000000-zip12345.zip"
}
```

Error response:

```json
{
  "ok": false,
  "message": "Failed to create download archive"
}
```

## Docker Deployment

Build the image:

```bash
docker build -t MultiMediaSaver .
```

Run the container:

```bash
docker run -p 3000:3000 --env-file .env.local MultiMediaSaver
```

### Docker Compose (recommended)

1. Create an `.env.local` file (or reuse the one from development) and set any parser credentials you need.
2. Start the stack:
   ```bash
   docker compose up --build -d
   ```
3. Downloads are written to the named volume declared in `docker-compose.yml`. Remove the volume to clear old assets:
   ```bash
   docker compose down -v
   ```

## Limitations

- Maximum 10 media files per request
- Maximum 500MB per file
- Parser timeout: 15 seconds
- Download timeout: 60 seconds

## Credits

Built by [@xxlemon-io](https://github.com/xxlemon-io)

## Disclaimer / 免责声明

- This project is provided solely for personal study and research purposes.
- Commercial use, resale, or integration into paid services is strictly prohibited.
- Using the project for any unlawful, harmful, or privacy-invasive activity is strictly prohibited.
- 本项目仅供学习和研究使用，严禁用于任何商业化场景。
- 严禁将本项目用于任何违法、违规或侵权行为，由此产生的风险由使用者自行承担。

## License

This project is distributed under the non-commercial Educational and Research License described in `LICENSE`. By using the project you agree to abide by its restrictions.

