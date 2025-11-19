# MultiMediaSaver

A responsive web application for downloading images and videos from Twitter/X and Instagram without using official APIs.

## Features

- Download images and videos from Twitter/X links
- Instagram support (coming soon)
- Automatic cleanup removes previous downloads when parsing a new link
- Download every fetched asset at once as a ZIP archive
- Responsive design for mobile and desktop
- No official API required - uses a self-hosted Playwright scraper

## Credits

Built by [@xxlemon-io](https://github.com/xxlemon-io)

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Node.js

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd MultiMediaSaver
```

2. Install dependencies:
```bash
npm install
```

3. Install Playwright browsers (Chromium only is required):
```bash
npx playwright install chromium
```

4. Configure environment variables:
```bash
# Copy env.local.example to .env.local
# On Windows PowerShell:
Copy-Item env.local.example .env.local
# On Linux/Mac:
cp env.local.example .env.local
```

Edit `.env.local` if you plan to enable future Instagram support (Twitter scraping is fully self-hosted and does not need configuration).

4. Create the downloads directory:
```bash
mkdir -p public/downloads
```

5. Create the downloads directory:
```bash
mkdir -p public/downloads
```

6. Run the development server:
```bash
npm run dev
```

7. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Configuration

### Twitter/X Scraper

- Uses Playwright with headless Chromium to load the tweet and extract media URLs from the rendered DOM.
- Requires the server environment to support running headless browsers (or Playwright's Chromium build).
- If Playwright fails (private/deleted tweets, rate limiting, etc.), the API surfaces the specific error so you can retry or inspect logs. No external parser is required.

### Instagram (Future)

- Instagram support still relies on configurable parser endpoints:
```bash
INSTAGRAM_PARSER_ENDPOINT=https://api.example.com/instagram
INSTAGRAM_PARSER_KEY=optional-api-key
```

## Public API

The backend endpoint used by the UI can also be called programmatically.

### Endpoints

#### `POST /api/media`

### Request Body

```json
{
  "url": "https://x.com/user/status/1234567890"
}
```

##### Success Response

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

##### Error Response

```json
{
  "ok": false,
  "message": "Tweet not found or inaccessible. Possible reasons: ..."
}
```

The HTTP status conveys the reason (400 invalid URL, 404 no media, 500/504 scraping errors, 501 Instagram placeholder).

##### CLI Example
#### `POST /api/download-all`

Bundle previously fetched assets (from `/api/media`) into a single ZIP file stored under `public/downloads`.

##### Request Body

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

##### Success Response

```json
{
  "ok": true,
  "zipUrl": "/downloads/1711105000000-zip12345.zip"
}
```

##### Error Response

```json
{
  "ok": false,
  "message": "Failed to create download archive"
}
```


```bash
curl -X POST http://localhost:3000/api/media \
  -H "Content-Type: application/json" \
  -d '{"url": "https://x.com/user/status/1234567890"}'
```

## Docker Deployment

Build the Docker image:
```bash
docker build -t MultiMediaSaver .
```

Run the container:
```bash
docker run -p 3000:3000 --env-file .env.local MultiMediaSaver
```

## Limitations

- Maximum 10 media files per request
- Maximum 500MB per file
- Parser timeout: 15 seconds
- Download timeout: 60 seconds

## License

MIT

