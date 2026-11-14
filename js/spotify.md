# Files you'll want to use
- spotify-api.js
- spotify-monitor.js
  
*Don't use spotify-test.js or spotify.js, those are purely test files*

# Functions you might want to use
## Import these from their respective files

| Function | Returns / does |
| :---: | :---: |
| login() | Redirects user to Spotify authorization |
| handleCallback() | Completes Spotify login |
| isSpotifyConnected() | Returns whether a token is stored |
| getCurrentSong() | Returns current song object or null |
| getListeningHistory(limit) | Returns array of listening events |
| onSongChanged(callback) | Subscribes to current-song changes |
| onListeningEvent(callback) | Subscribes to playback events |
| startAllMonitoring() | Starts both polling systems |
| stopAllMonitoring() | Stops both polling systems |

*Import statements*
- import {
    getCurrentSong,
    login,
    isSpotifyConnected,
    getListeningHistory,
    handleCallback
} from "./spotify-api.js";
- import {
    onSongChanged,
    startSongMonitoring,
    onListeningEvent,
    startHistoryMonitoring
} from "./spotify-monitor.js";