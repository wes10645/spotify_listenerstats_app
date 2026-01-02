import {useState, useEffect} from "react"; //importing useState, which stores data and useEffect which loads data




//im starting to implement the authorization for spotify 
const CLIENT_ID = "f7ad09fd2de94e8cb33658dd53dafd3d"; //pasted the client id
const REDIRECT_URI = "http://127.0.0.1:3000";
const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const SCOPES = ["user-top-read"];

function generateRandom(length) {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < length; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}
async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return await window.crypto.subtle.digest("SHA-256", data);
}

function base64urlencode(a) {
  return btoa(String.fromCharCode(...new Uint8Array(a)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function generateCodeChallenge(verifier) {
  const hashed = await sha256(verifier);
  return base64urlencode(hashed);
}


function App(){ //sets empty arrays for artist, 
  const[artists, setArtists]=useState([]); 
  const[loading, setLoading]=useState(true); //sets state for of waiting for data
  const[error, setError] = useState(null);
  const [accessToken, setAccessToken] = useState("");
  //access token created and added

    useEffect(() => {
  const hash = window.location.hash;
  let token = window.localStorage.getItem("token");

  if (!token && hash) {
    token = hash
      .substring(1)
      .split("&")
      .find((elem) => elem.startsWith("access_token"))
      .split("=")[1];

    window.location.hash = "";
    window.localStorage.setItem("token", token);
  }

  if (token) {
    setAccessToken(token);
  }
}, []);

    async function fetchArtists() {
      try{
        setLoading(true);
        setError(null);

        const response = await fetch(
        "https://api.spotify.com/v1/me/top/artists",
        {
          headers:{
            Authorization: `Bearer ${accessToken}`, 
          },
        }
        );
        if (!response.ok){
          throw new Error ("failed to fetch your stats:(");
        }
      const data = await response.json();
      const names = data.items.map((user) => user.name); // fixing data.map to data.items, as spotify returns {items:...}

      setArtists(names);
    }catch (err){
        setError(err.message);
    }finally{
      setLoading(false);
    }
    }
    useEffect(()=>{
    if(accessToken) fetchArtists(); // now only fetches artist after access token is validated
  },[accessToken]);
    const loginUrl = `${AUTH_ENDPOINT}?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent( //now we add the redirect url 
    REDIRECT_URI
  )}&response_type=${RESPONSE_TYPE}&scope=${encodeURIComponent(
    SCOPES.join(" ")
  )}`;
return (
  <div>
    <h1>Welcome To Wesley's Spotify Listening Stats!!!</h1>
       {!accessToken && (  //checks if already logged in and shows log in button for spotify
        <a href={loginUrl}>
        <button>Log in with Spotify</button>
        </a>
        )}

      {loading&&<p>trying to load some stats...</p>}

      {error&& (
        <div>
        <p style = {{color: "red"}}>{error}</p>
        <button onClick={fetchArtists}>Retry</button>
         </div>
      )};

         {!loading &&!error&&(
          <ul>
          {artists.map((artist) => (
            <li key={artist}>{artist}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default App;