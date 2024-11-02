import './App.css';
import GameOutputWindow, { GameOutputMessage } from './components/GameOutputWindow';
import SignOutButton from './components/SignOutButton';
import TextInputBox from './components/TextInputBox';
import React, { useState, useEffect } from 'react';
import { KeychainSDK, Login, KeychainKeyTypes, Custom } from 'keychain-sdk';
import HiveMultisigSDK from 'hive-multisig-sdk';
import { Client, AccountUpdate2Operation } from '@hiveio/dhive';
import * as Dhive from '@hiveio/dhive';
import gameObjects from './modules/gameObjects';


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
  const [submittingData, setsubmittingData] = useState(false);
  let [username, setUsername] = useState('');
  const [roomdata, setRoomData] = useState('');

  const checkPlayer = async () => {
    try {
      let IsPlayer = await client.database.getAccounts([username]);
        console.log(JSON.parse(IsPlayer[0].posting_json_metadata).profile.reputation);
      
    } catch(error) {
      console.log({ error })
    }
  }

  async function updateAccountMetadata(username: string, playerNumber: number) {
  try {

    const accountInfo = await client.database.getAccounts([username]);
    const currentMetadata = JSON.parse(accountInfo[0].posting_json_metadata);

    currentMetadata.egodeathplayer = playerNumber;

    const operation = [
      'account_update2',
      {
        account: username,
        method:KeychainKeyTypes.posting,
        posting_json_metadata: JSON.stringify(currentMetadata),
        // Other optional fields like active, owner, memo_key
      }
    ];

    //const result = await Dhive.account_update2([operation], KeychainKeyTypes.posting);
    console.log(Dhive);
    //console.log(result);
    } catch (error) {
    console.error('Error updating account metadata:', error);
    }
  }
  

  let customData = {
    "data": {
      "username": username,
      "id": "egodeath",
      "method" : KeychainKeyTypes.posting,
      "json": "{}",
      "display_msg": "Seed"
    }
  }

  const onCustom = async () => {
    try {
    
    const custom = await keychain
         .custom(customData.data as Custom);
      console.log({ custom });
    } catch (error) {
      console.log({ error });
    }
  };

  
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

  const outPut = (texttooutput: string) => {
    setGameOutputMessage((prevOutput) => [...prevOutput, { output: texttooutput }]);
  };

  const handleTextEntered = (enteredText: string) => {
    switch(enteredText.toLowerCase().split(/\s+/)[0]) {

      case "login":
        if(isSignedIn) {
          outPut("You are already signed in!");
        }else{
        const tempuser = enteredText.split(/\s+/)[1];
        setUsername(tempuser);
        }
        break;

      case "seed":
        setsubmittingData(true);

        break;

      default:
        if(!isSignedIn){
          outPut("You can't do much without signing in! Type login *yourusername*");
        }else{
          checkPlayer();
          console.log(Dhive);
          outPut(enteredText);
        }
        break;
    }
  };

  //Here we watch for the username to change and trigger the signinfunction when it does so.
  useEffect(() => {
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