interface InstagramParserConfig {
  endpoint: string;
  apiKey?: string;
}

export function requireInstagramConfig(): InstagramParserConfig {
  const endpoint = process.env.INSTAGRAM_PARSER_ENDPOINT;

  if (!endpoint) {
    throw new Error(
      "INSTAGRAM_PARSER_ENDPOINT is not configured. Please set it in .env.local"
    );
  }

  return {
    endpoint,
    apiKey: process.env.INSTAGRAM_PARSER_KEY,
  };
}

