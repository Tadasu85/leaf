import './App.css';
import GameOutputWindow, { GameOutputMessage } from './components/GameOutputWindow';
import SignOutButton from './components/SignOutButton';
import TextInputBox from './components/TextInputBox';
import React, { useState, useEffect } from 'react';
import { KeychainSDK, Login, KeychainKeyTypes, Custom } from "keychain-sdk";
import { Client } from "@hiveio/dhive";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const client = new Client(["https://api.hive.blog",
"https://api.hivekings.com",
"https://anyx.io",
"https://api.openhive.network"]);

const keychain = new KeychainSDK(window);

function App() {
  async function initializeKeychain() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const isInstalled = await keychain.isKeychainInstalled();
  }

  window.onload = initializeKeychain;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [gameOutputMessage, setGameOutputMessage] = useState<GameOutputMessage[]>([]);
  const [isSignedIn, setIsSignedIn] = useState(false);
  let [username, setUsername] = useState('');
  const [roomdata, setRoomData] = useState('');

  console.log(client.database.getDiscussions("blog", {tag:"raymonjohnstone", limit:299}));

  try
  {
    
    const formParamsAsObject = {
     "data": {
          "username": "raymonjohnstone",
          "id": "egodeath",
          "method" : KeychainKeyTypes.posting,
          "json": "{}",
          "display_msg": "Seed"
     }
  }
    
    const custom = await keychain
         .custom(
              formParamsAsObject.data as Custom);
    console.log({ custom });
  } catch (error) {
    console.log({ error });
  }
  
  const handleSignIn = async (username: string) => {
    const data: Login = {
      "username": username,
      "message": "{\"login\":\"123\"}",
      "method": KeychainKeyTypes.posting,
      "title": "Login"
    };

    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const login = await keychain.login(data as Login);
      setIsSignedIn(true); // Update directly after successful login
    } catch (error) {
      console.error("Login error:", error);
      // Handle the error here, e.g., display an error message to the user
    }
  }
  const handleSignOut = () => {
    setIsSignedIn(false);
    setUsername('');
  };

  const handleTextEntered = (enteredText: string) => {
    switch(enteredText.toLowerCase().split(/\s+/)[0]) {
      case "login":
        if(isSignedIn) {
          setGameOutputMessage((prevOutput) => [...prevOutput, { output: "You are already signed in!" }]);
        }else{
        const tempuser = enteredText.split(/\s+/)[1];
        setUsername(tempuser);
        }
        break;
      case "seed":

        break;

      default:
        if(!isSignedIn){
          setGameOutputMessage((prevOutput) => [...prevOutput, { output: "You can't do much without signing in! Type login *yourusername*" }]);
        }else{
          setGameOutputMessage((prevOutput) => [...prevOutput, { output: enteredText }]);
        }
        break;
    }
  };

  useEffect(() => { //Here we watch for the username to change and trigger the signinfunction when it does so.
        if (username) {
          handleSignIn(username);
          }
        }, [username]);

  useEffect(() => {

  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <div className="Title"> E̴̙̣̦̩̱̮͇̋̐̏̕G̶̱͕̦͎̯͙̳̋̽͒͋̾͌̌̚͜O̴̪̤͎̼͙̫͌̏͒̑̍̏͜͠ ̶̗͎̯̥̮̲̠̝̮̲̃͆͊̽Ḓ̶̘̞̂Ȇ̶̹͎͓̳̼͇̠͜ͅA̸͖͖̠̖̙̐̍̀̉̍̾̇̚Ṯ̷̜̀̆͗̏͊͘̚H̴̛̼ </div>
        <div className="SignOutButton">
          <SignOutButton isSignedIn={isSignedIn} username={username} onSignOut={handleSignOut} />
        </div>
      </header>
        <GameOutputWindow output={gameOutputMessage} />
      <div className="TextInputBox">
        <TextInputBox onEnterPressed={handleTextEntered} />
      </div>
    </div>
  );
}

export default App;