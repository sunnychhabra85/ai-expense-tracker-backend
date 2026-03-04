# Mobile Device Setup Guide

## Problem
`10.0.2.2` only works in the **Android emulator**, not on physical devices. Physical Android phones need your computer's actual local network IP address.

## Your Local Network IP
Your development machine's IP address is: **192.168.0.252**

## Solution

### 1. Update Your Expo App Configuration

Replace `10.0.2.2` with `192.168.0.252` in your mobile app configuration:

```javascript
// BEFORE (emulator only)
{
  "authAPI": "http://10.0.2.2:3001/api/v1",
  "uploadAPI": "http://10.0.2.2:3002/api/v1",
  "notificationAPI": "http://10.0.2.2:3005/api/v1"
}

// AFTER (physical device)
{
  "authAPI": "http://192.168.0.252:3001/api/v1",
  "uploadAPI": "http://192.168.0.252:3002/api/v1",
  "notificationAPI": "http://192.168.0.252:3005/api/v1"
}
```

### 2. Ensure Phone and Computer are on Same WiFi Network

Both your development machine and Android phone must be connected to the same WiFi network (your Wi-Fi network with IP 192.168.0.252).

### 3. Check Windows Firewall

If you still get timeouts, Windows Firewall might be blocking the connection:

```powershell
# Allow NodeJS through Windows Firewall
New-NetFirewallRule -DisplayName "Node.js Server" -Direction Inbound -Program "C:\Program Files\nodejs\node.exe" -Action Allow
```

Or manually:
1. Open Windows Defender Firewall
2. Click "Allow an app through firewall"
3. Find Node.js and allow it on Private networks

### 4. Backend CORS Configuration

✅ **Already configured!** All 5 backend services now support:
- Requests from physical mobile devices (no Origin header)
- Local network IP addresses in development mode (192.168.* and 10.*)
- Existing localhost origins for web browsers

The backend automatically:
- Allows requests with no Origin header (mobile apps, Postman)
- Allows localhost:3000, :8080, :8081 (web browsers)
- In development mode, allows any 192.168.* or 10.* IP addresses

## Testing

### Test from your phone:
```bash
# On your phone's browser, visit:
http://192.168.0.252:3001/api/v1/health
```

You should see: `{"status":"ok"}`

### Test API endpoints:
```javascript
// In your Expo app
fetch('http://192.168.0.252:3001/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test@example.com', password: 'password' })
})
```

## Dynamic IP Configuration (Recommended)

For flexibility between emulator and physical device:

```javascript
// config.js
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const getBaseURL = () => {
  // Check if running in emulator
  if (Platform.OS === 'android' && Constants.isDevice === false) {
    return '10.0.2.2'; // Android emulator
  }
  
  // Physical device - use your local IP
  return '192.168.0.252';
};

const BASE_URL = getBaseURL();

export const API_CONFIG = {
  authAPI: `http://${BASE_URL}:3001/api/v1`,
  uploadAPI: `http://${BASE_URL}:3002/api/v1`,
  processingAPI: `http://${BASE_URL}:3003/api/v1`,
  analyticsAPI: `http://${BASE_URL}:3004/api/v1`,
  notificationAPI: `http://${BASE_URL}:3005/api/v1`,
};
```

## Troubleshooting

### Still getting timeout?

1. **Check if services are running:**
   ```powershell
   Get-NetTCPConnection -LocalPort 3001,3002,3003,3004,3005 -State Listen
   ```

2. **Test from your computer first:**
   ```powershell
   curl http://192.168.0.252:3001/api/v1/health
   ```

3. **Check Windows Firewall logs** to see if it's blocking connections

4. **Restart services** after CORS changes:
   ```powershell
   # Stop all services
   Get-NetTCPConnection -LocalPort 3001,3002,3003,3004,3005 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
   
   # Start them again
   npx nx serve auth-service
   npx nx serve upload-service
   # ... etc
   ```

5. **Use a different network** - Some corporate/public WiFi networks block device-to-device communication

## Production Note

For production, you would:
1. Use HTTPS with a domain name
2. Deploy to a cloud service (AWS, Azure, etc.)
3. Update ALLOWED_ORIGINS environment variable with your production domain
4. Remove the development mode IP whitelist logic
