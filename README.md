# Podcast Cropper

A modern, local-first web application for intelligently extracting engaging clips from podcast videos. Built with Nuxt 4, Vue 3, and powered by AI for transcription and theme analysis.

## Features

- 🎬 **Video Upload & Processing**: Upload podcast videos in various formats
- 🎤 **Audio Extraction**: Extract and optimize audio for transcription
- 📝 **AI Transcription**: Automatic transcription using Groq's Whisper API
- 🧠 **Theme Analysis**: Intelligently identify engaging segments and themes
- ✂️ **Video Clipping**: Extract precise video clips using FFmpeg
- 🌟 **Interest Scoring**: AI-powered scoring of segment engagement levels
- 📱 **Responsive Design**: Mobile-first design with Tailwind CSS and DaisyUI
- 🏃 **Local Processing**: Runs entirely in your browser (no server required)

## Tech Stack

- **Frontend**: Nuxt 4, Vue 3, TypeScript
- **Styling**: Tailwind CSS, DaisyUI
- **Audio Processing**: FFmpeg.wasm (runs in browser)
- **AI Services**: Groq API (Whisper for transcription, LLM for analysis)
- **Deployment**: Docker with multi-stage build

## Quick Start

### Local Development

```bash
# Install dependencies
bun install

# Start development server
bun dev

# Build for production
bun build
```

### Docker Deployment

```bash
# Build the image
docker build -t podcast-cropper .

# Run the container with rate limiting
docker run -p 3000:3000 \
  -e GROQ_API_KEY=your_key_here \
  -e RATE_LIMIT_MAX_REQUESTS=10 \
  -e RATE_LIMIT_WINDOW_MS=3600000 \
  podcast-cropper
```

### Rate Limiting

The application includes built-in rate limiting to prevent abuse:
- **Default:** 10 requests per hour per IP address
- **Configurable:** Set `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW_MS` environment variables
- **Response:** Returns HTTP 429 with reset time when limit exceeded

Example configurations:
```bash
# 20 requests per hour
RATE_LIMIT_MAX_REQUESTS=20
RATE_LIMIT_WINDOW_MS=3600000

# 5 requests per 30 minutes
RATE_LIMIT_MAX_REQUESTS=5
RATE_LIMIT_WINDOW_MS=1800000
```

## Configuration

### Environment Variables

- `GROQ_API_KEY`: Your Groq API key for AI services (required for Groq API usage)
- `RATE_LIMIT_MAX_REQUESTS`: Maximum requests per time window (default: 10)
- `RATE_LIMIT_WINDOW_MS`: Time window in milliseconds (default: 3600000 = 1 hour)

### Groq API

This project uses Groq's API for:
- **Whisper Large v3**: Audio transcription
- **Groq LLM**: Theme analysis and segmentation

Get your free API key at [console.groq.com](https://console.groq.com)

## Next Steps: Local SLM Support

The next major iteration will include local Small Language Model (SLM) support to eliminate dependency on external AI services:

### Planned Features

1. **Local Whisper Integration** via Ollama
   - Run Whisper model locally for transcription
   - No API key required
   - Private processing in your browser or local server

2. **Local LLM via Ollama**
   - Run lightweight models like LLaMA 2, Mistral, or CodeLlama
   - Theme analysis and segmentation without external API calls
   - Completely offline operation

3. **Ollama Server Integration**
   - Optional local Ollama server deployment
   - Docker compose setup for easy local development
   - Fallback to Groq API when local models unavailable

### Implementation Roadmap

- [ ] Add Ollama client library and configuration
- [ ] Create local transcription service using Whisper via Ollama
- [ ] Implement local theme analysis using local LLM models
- [ ] Add system health checks for local model availability
- [ ] Create Docker compose configuration for Ollama server
- [ ] Add graceful failover between local and cloud AI services
- [ ] Update documentation for local deployment options

### Benefits of Local SLM Support

- **Privacy**: All processing happens locally
- **Cost**: No API usage fees
- **Reliability**: No dependency on external services
- **Speed**: Local inference can be faster than API calls
- **Control**: Full control over model selection and configuration

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Video File    │───▶│  FFmpeg Audio    │───▶│   Transcription │
│                 │    │   Extraction     │    │    (Groq API)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Final Clips   │◀───│  Video Clipping  │◀───│   Theme Analysis│
│                 │    │   (FFmpeg)       │    │    (Groq LLM)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Local Development with Docker Compose (Future)

Once local SLM support is implemented:

```yaml
# docker-compose.yml
version: '3.8'
services:
  podcast-cropper:
    build: .
    ports:
      - "3000:3000"
    environment:
      - OLLAMA_URL=http://ollama:11434
    depends_on:
      - ollama
      
  ollama:
    image: ollama/ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_models:/root/.ollama
      
volumes:
  ollama_models:
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Open an issue on GitHub
- Check the documentation below

### Troubleshooting

**FFmpeg Loading Issues**: Ensure your browser supports WebAssembly and has proper CORS headers.

**API Key Issues**: Verify your Groq API key is valid and has sufficient credits.

**Large File Processing**: Supports files up to 3GB. Browser memory limits may apply for very large files during client-side processing.