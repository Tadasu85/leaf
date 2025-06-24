# Environment Variables

This document describes the environment variables used by the Leaf game application.

## Signaling Server Configuration

The application uses environment variables to configure the WebSocket signaling server connection:

### `REACT_APP_SIGNALING_SERVER`
- **Description**: Primary signaling server URL
- **Default**: None (falls back to environment-specific defaults)
- **Example**: `https://your-signaling-server.com`

### `REACT_APP_PRODUCTION_SIGNALING_SERVER`
- **Description**: Production-specific signaling server URL (used when `NODE_ENV=production`)
- **Default**: `https://leaf-server-5lrq.onrender.com`
- **Example**: `https://your-production-server.com`

### Configuration Logic

The signaling server URL is determined in this order:

1. `REACT_APP_SIGNALING_SERVER` (if set, used for all environments)
2. If in production (`NODE_ENV=production`):
   - `REACT_APP_PRODUCTION_SIGNALING_SERVER` (if set)
   - Fallback to `https://leaf-server-5lrq.onrender.com`
3. If in development:
   - Fallback to `http://localhost:4001`

### Setting Environment Variables

#### For Development
Create a `.env` file in the `leaf` directory:
```
REACT_APP_SIGNALING_SERVER=http://localhost:4001
```

#### For Production
Set the environment variable in your deployment platform:
```bash
REACT_APP_PRODUCTION_SIGNALING_SERVER=https://your-actual-production-server.com
```

### Troubleshooting

If you're getting WebSocket connection errors in production:

1. Verify the signaling server is deployed and accessible
2. Check that the correct URL is set in `REACT_APP_PRODUCTION_SIGNALING_SERVER`
3. Ensure the signaling server supports WebSocket connections
4. Check CORS configuration on the signaling server 