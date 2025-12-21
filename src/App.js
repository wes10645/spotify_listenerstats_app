import {useState, useEffect} from "react"; //importing useState, which stores data and useEffect which loads data

function App(){ //sets empty arrays for artist, 
  const[artists, setArtists]=useState([]); 
  const[loading, setLoading]=useState(true); //sets state for of waiting for data
  const[error, setError] = useState(null);



    async function fetchArtists() {
      try{
        setLoading(true);
        setError(null);

        const response = await fetch(
        "https://api.spotify.com/v1/me/top/artists",
        {
          headers:{
            Authorization: 'Bearer ${accessToken}',
          },
        }
        );
        if (!response.ok){
          throw new Error ("failed to fetch your stats:(");
        }
      const data = await response.json();
      const names = data.map((user) => user.name);

      setArtists(names);
    }catch (err){
        setError(err.message);
    }finally{
      setLoading(false);
    }
    }
    useEffect(()=>{
    fetchArtists();
  },[]);
return (
  <div>
    <h1>Welcome To Wesley's Spotify Listening Stats!!!</h1>

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