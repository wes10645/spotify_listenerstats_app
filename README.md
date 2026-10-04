Spotify Analytics Platform

A full-stack web application that provides advanced analytics and insights into personal Spotify listening behavior. ADDING NEW FUNCTIONALITY FOR DATA TRENDS AND ANALYZING TOP CHARTS. IN DEVELOPMENT. 
Link to WIP deployment :https://spotify-listenerstats-cuq70ssac-wes10645s-projects.vercel.app/


Full Tech Stack:
- Frontend: React  
- Backend: Node.js, Express  
- Authentication: OAuth 2.0 (Spotify Web API)  
- API Handling:  REST APIs, Asynchronous Requests  
- State Management: React Hooks / Context API
- UI animations: P5.js

---

Core Features (Implemented):

- Spotify OAuth authentication flow  
- Secure access token management  
- Retrieval of user profile data  
- Listening history integration  
- Dynamic UI rendering based on API responses and Mouse Clicks  

---
Currently Developing:

- Advanced listening trend visualizations  
- Genre evolution analytics  
- Track-level audio feature comparison  
- Listening pattern forecasting modules  
- Performance optimization and scalable API handling
- Macro Trend analytics
- UI for Landing Page



Project Goal:

The goal of this platform is to evolve beyond a simple dashboard into a scalable analytics engine capable of generating personalized listening insights and behavioral trend analysis on a macro level as well. 


Running locally:

1. In the Spotify Developer Dashboard, add `http://127.0.0.1:5001/auth/callback` as a Redirect URI.
2. Install and start both halves (two terminals):

```bash
git clone https://github.com/wes10645/spotify_listenerstats_app.git
cd spotify_listenerstats_app
npm install
npm run server   # backend on http://127.0.0.1:5001
npm start        # frontend on http://127.0.0.1:3000
```

3. Open http://127.0.0.1:3000 (use 127.0.0.1, not localhost, so the login cookie is shared).

Tests: `npm run test:server` (backend) and `npm test` (frontend).
