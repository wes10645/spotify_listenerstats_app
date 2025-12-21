import {useState, useEffect} from "react"; //importing useState, which stores data and useEffect which loads data

function App(){ //sets empty arrays for artist, 
  const[artists, setArtists]=useState([]); 
  const[loading, setLoading]=useState(true); //sets state for of waiting for data
  const[error, setError] = useState(null);


  useEffect(()=>{
    async function fetchArtists() {
      try{
        const response = await fetch(
        "https://jsonplaceholder.typicode.com/users"
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

    fetchArtists();
  },[]);
return (
  <div>
    <h1>Welcome To Wesley's Spotify Listening Stats!!!</h1>

      {loading&&<p>trying to load some stats...</p>}

      {error&&<p style = {{color: "red"}}>{error}</p>}
         
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