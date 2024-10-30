import './App.css';
import GameOutputWindow, { GameOutputMessage } from './components/GameOutputWindow';
import SignOutButton from './components/SignOutButton';
import TextInputBox from './components/TextInputBox';
import React, { useState, useEffect } from 'react';
import { KeychainSDK, Login, KeychainKeyTypes } from "keychain-sdk";
import { Client } from "@hiveio/dhive";

const keychain = new KeychainSDK(window);
const client = new Client(["https://api.hive.blog", "https://api.hivekings.com", "https://anyx.io", "https://api.openhive.network"]);

function App() {
  async function initializeKeychain() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const isInstalled = await keychain.isKeychainInstalled();
  }

  window.onload = initializeKeychain;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [gameOutputMessage, setGameOutputMessage] = useState<GameOutputMessage[]>([]);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [userrc, setUserRc] = useState('');
  
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
  };

  const handleSignOut = () => {
    setIsSignedIn(false);
    setUsername('');
  };

  const handleTextEntered = (enteredText: string) => {
    switch(enteredText.toLowerCase().split(/\s+/)[0]) {
      //In the interest of things not becoming a stringy mess we are only actually going to with three switches here
      //the first one of course is login as feedback if the user is not the other two are say and emote 
      //say and emote also both have short form and we need to watch for those as well within the switch case  
      case "login":
        if(isSignedIn) {

          setGameOutputMessage((prevOutput) => [...prevOutput, { output: "You are already signed in!" }]);
        }else{
          const tempuser = enteredText.split(/\s+/)[1];
          setUsername(tempuser);
        }
        break;
      case "say":
        const usersaid = enteredText.substring(3).trim();
        setGameOutputMessage((prevOutput) => [...prevOutput, { output: "You say " + usersaid }]);
        break;

      default:
        if(!isSignedIn){
          setGameOutputMessage((prevOutput) => [...prevOutput, { output: "You can't do much without signing in! Type login *yourusername*" }]);
        }else{
          setGameOutputMessage((prevOutput) => [...prevOutput, { output: enteredText + " Current RC is : " + userrc }]);
        }
        break;
    }
  };

  useEffect(() => { //Here we watch for the username to change and trigger the signinfunction when it does so.
        if (username) {
          handleSignIn(username);
          }
        }, [username]);

  // async function getRCAccounts(username: string) {
  //         const rc = await client.rc.findRCAccounts([username]);
  //           // Now you can use the 'something' variable here, as it will contain the resolved value.
  //             return rc[0].rc_manabar.current_mana;
  //           }
useEffect(() => {
  const fetchRCAccounts = async () => {
    if (username) {
      try {
        const rcAccounts = await client.rc.findRCAccounts([username]);
        setUserRc(rcAccounts[0].rc_manabar.current_mana);
      } catch (error) {
        console.error("Error fetching RC accounts:", error);
      }
    }
  };

  fetchRCAccounts();
}, [username]);


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