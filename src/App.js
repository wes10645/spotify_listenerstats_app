import {useState, useEffect} from react; //importing useState, which stores data and useEffect which loads data

function App(){ //sets empty arrays for artist, 
  const[artists, setArtists]=useState([]); 
  const[loading, setLoading]=useState(true); //sets state for of waiting for data



  useEffect(()=>{
     fetch("https://jsonplaceholder.typicode.com/users") //supposed to be a. placeholder for now
      .then((response) => response.json())
      .then((data) => {
        const names = data.map((user) => user.name);
        setArtists(names);
        setLoading(false);//not loading anymore, stop loading screen
      });
  }, []);//runs effect only one time 
}
